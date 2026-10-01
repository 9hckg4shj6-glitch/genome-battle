-- 人数と1問の制限時間を、遊ぶ人が選べるようにする。
--   capacity:       ランダム対戦は「この人数がそろったら即開始」。null は従来どおり（2人以上で10秒後・8人で即開始）。
--                   合言葉ルームでは定員（null は8人）。
--   answer_seconds: 1問の制限時間（5〜120秒）。ランダム対戦は人数・秒数が同じ人どうしで組む。

alter table public.matches add column if not exists capacity smallint check (capacity between 2 and 8);
alter table public.matches add column if not exists answer_seconds smallint not null default 20 check (answer_seconds between 5 and 120);

create or replace function public._state(p_match uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', m.id,
    'code', m.code,
    'status', m.status,
    'phase', m.phase,
    'q_index', m.q_index,
    'q_total', cardinality(m.q_ids),
    'q_id', m.q_ids[m.q_index + 1],
    'phase_ends_at', m.phase_ends_at,
    'server_now', now(),
    'winner_seat', m.winner_seat,
    'win_score', 5,
    'capacity', m.capacity,
    'answer_seconds', m.answer_seconds,
    'version', m.version,
    'host_seat', (select p.seat from players p where p.match_id = m.id and p.device_id = m.host_device),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'seat', p.seat,
        'name', p.name,
        'score', p.score,
        'mark', (select case when a.correct then 'o' else 'x' end
                 from attempts a where a.match_id = m.id and a.q_index = m.q_index and a.seat = p.seat)
      ) order by p.seat)
      from players p where p.match_id = m.id), '[]'::jsonb),
    'reveal', case when m.phase = 'reveal' then (
      select jsonb_build_object('answer', q.answer, 'explanation', q.explanation)
      from questions q where q.id = m.q_ids[m.q_index + 1]) end
  )
  from matches m where m.id = p_match
$$;

create or replace function public._advance(p_match uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  m matches%rowtype;
  v_count int;
  v_deleted int;
  v_top int;
begin
  select * into m from matches where id = p_match;
  if not found or m.status = 'finished' then
    return false;
  end if;

  if m.status = 'waiting' then
    -- 待機画面は2秒ごとに tick() で生存を知らせる。途絶えた人は外す。
    delete from players where match_id = m.id and last_seen < now() - interval '12 seconds';
    get diagnostics v_deleted = row_count;
    select count(*) into v_count from players where match_id = m.id;
    if v_count = 0 then
      update matches set status = 'finished', player_count = 0 where id = m.id;
      return true;
    end if;
    update matches set player_count = v_count where id = m.id;
    if m.code is not null then
      return v_deleted > 0;  -- 合言葉ルームは開始ボタンで始める
    end if;
    if m.capacity is not null then
      if v_count >= m.capacity then
        perform _start(m.id);
        return true;
      end if;
      return v_deleted > 0;
    end if;
    if v_count >= 8 or (v_count >= 2 and m.phase_ends_at is not null and now() >= m.phase_ends_at) then
      perform _start(m.id);
      return true;
    elsif v_count >= 2 and m.phase_ends_at is null then
      update matches set phase_ends_at = now() + interval '10 seconds' where id = m.id;
      return true;
    elsif v_count < 2 and m.phase_ends_at is not null then
      update matches set phase_ends_at = null where id = m.id;
      return true;
    end if;
    return v_deleted > 0;
  end if;

  if now() < m.phase_ends_at then
    return false;
  end if;
  if m.phase = 'countdown' then
    update matches set phase = 'question', phase_ends_at = now() + make_interval(secs => m.answer_seconds) where id = m.id;
  elsif m.phase = 'question' then
    update matches set phase = 'reveal', phase_ends_at = now() + interval '7 seconds' where id = m.id;
  else
    select coalesce(max(score), 0) into v_top from players where match_id = m.id;
    if v_top >= 5 or m.q_index + 1 >= cardinality(m.q_ids) then
      update matches set status = 'finished', phase = null, phase_ends_at = null where id = m.id;
    else
      update matches
      set q_index = q_index + 1, phase = 'question', winner_seat = null,
          phase_ends_at = now() + make_interval(secs => m.answer_seconds)
      where id = m.id;
    end if;
  end if;
  return true;
end
$$;

-- 引数が増えるので旧版は消す（残すと PostgREST が呼び分けられない）
drop function if exists public.find_match(uuid, text);
drop function if exists public.create_room(uuid, text);

create or replace function public.find_match(p_device uuid, p_name text, p_capacity int default null, p_seconds int default 20)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_name text := _clean_name(p_name);
  v_id uuid;
begin
  if v_name = '' then
    raise exception 'NAME_REQUIRED';
  end if;
  if p_seconds is null or p_seconds not between 5 and 120 or p_capacity not between 2 and 8 then
    raise exception 'BAD_SETTINGS';
  end if;
  -- 同時に押した人どうしが互いの新しい部屋を見られず別々に待つのを防ぐため、マッチングだけ直列化する
  perform pg_advisory_xact_lock(hashtext('find_match'));
  delete from matches where created_at < now() - interval '1 day';
  select id into v_id from matches
  where status = 'waiting' and code is null
    and capacity is not distinct from p_capacity and answer_seconds = p_seconds
    and player_count < coalesce(capacity, 8) and last_active > now() - interval '15 seconds'
  order by created_at
  limit 1
  for update;
  if v_id is null then
    insert into matches (q_ids, capacity, answer_seconds)
    values (_pick_questions(), p_capacity, p_seconds) returning id into v_id;
  end if;
  perform _join(v_id, p_device, v_name);
  perform _advance(v_id);
  return _broadcast(v_id) || jsonb_build_object('my_seat', _seat(v_id, p_device));
end
$$;

create or replace function public.create_room(p_device uuid, p_name text, p_capacity int default null, p_seconds int default 20)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_name text := _clean_name(p_name);
  v_id uuid;
begin
  if v_name = '' then
    raise exception 'NAME_REQUIRED';
  end if;
  if p_seconds is null or p_seconds not between 5 and 120 or p_capacity not between 2 and 8 then
    raise exception 'BAD_SETTINGS';
  end if;
  loop
    begin
      insert into matches (code, host_device, q_ids, capacity, answer_seconds)
      values (lpad(floor(random() * 10000)::int::text, 4, '0'), p_device, _pick_questions(), p_capacity, p_seconds)
      returning id into v_id;
      exit;
    exception when unique_violation then
      -- 使用中の合言葉と衝突したら引き直す
    end;
  end loop;
  perform _join(v_id, p_device, v_name);
  return _broadcast(v_id) || jsonb_build_object('my_seat', _seat(v_id, p_device));
end
$$;

create or replace function public.join_room(p_code text, p_device uuid, p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_name text := _clean_name(p_name);
  m matches%rowtype;
begin
  if v_name = '' then
    raise exception 'NAME_REQUIRED';
  end if;
  select * into m from matches where code = btrim(p_code) and status = 'waiting' for update;
  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;
  if m.player_count >= coalesce(m.capacity, 8) and _seat(m.id, p_device) is null then
    raise exception 'ROOM_FULL';
  end if;
  perform _join(m.id, p_device, v_name);
  perform _advance(m.id);
  return _broadcast(m.id) || jsonb_build_object('my_seat', _seat(m.id, p_device));
end
$$;

revoke execute on function
  public.find_match(uuid, text, int, int), public.create_room(uuid, text, int, int)
from public;
grant execute on function
  public.find_match(uuid, text, int, int), public.create_room(uuid, text, int, int)
to anon, authenticated;
