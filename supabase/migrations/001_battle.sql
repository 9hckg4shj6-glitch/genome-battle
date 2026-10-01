-- ゲノム対戦：2〜8人の早押し5択。
-- テーブルへの直接アクセスは全面禁止（RLS有効・ポリシーなし）。読み書きは security definer RPC のみ。
-- device_id は各端末が localStorage に持つ秘密の識別子。他人には席番号（seat）しか見せない。
-- 判定・到着順・進行はすべてサーバ時刻（now()）で決め、状態が変わるたびに
-- Realtime Broadcast（topic = 'battle:<match_id>'）で全員へ配る。
-- 期限切れの進行（タイムアウト・次の問題）は、期限を過ぎた端末が tick() を呼んで進める（冪等）。

-- ルール定数（変えるときは _state の win_score と各 interval も合わせる）
--   定員 8 / 先取 5 / 最大 15 問 / 解答 20 秒 / 解説 7 秒 / 開始前 3 秒 / ランダム待機 10 秒

create table if not exists public.questions (
  id text primary key,
  answer smallint not null check (answer between 0 and 4),
  explanation text not null
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  code text,                         -- 合言葉ルームの4桁。ランダムマッチは null
  host_device uuid,                  -- 合言葉ルームの作成者（開始ボタンを押せる）
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'finished')),
  q_ids text[] not null,
  q_index int not null default 0,
  phase text check (phase in ('countdown', 'question', 'reveal')),
  phase_ends_at timestamptz,         -- waiting 中はランダムマッチの自動開始時刻
  winner_seat smallint,              -- いま出ている問題の正解者
  player_count int not null default 0,
  version int not null default 0,
  last_active timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists matches_waiting_idx on public.matches (created_at) where status = 'waiting';
create index if not exists matches_created_idx on public.matches (created_at);
create unique index if not exists matches_waiting_code on public.matches (code) where status = 'waiting' and code is not null;

create table if not exists public.players (
  match_id uuid not null references public.matches (id) on delete cascade,
  device_id uuid not null,
  seat smallint not null,
  name text not null,
  score int not null default 0,
  last_seen timestamptz not null default now(),
  primary key (match_id, device_id),
  unique (match_id, seat)
);

create table if not exists public.attempts (
  match_id uuid not null references public.matches (id) on delete cascade,
  q_index int not null,
  seat smallint not null,
  choice smallint not null,
  correct boolean not null,
  at timestamptz not null default now(),
  primary key (match_id, q_index, seat)
);

alter table public.questions enable row level security;
alter table public.matches enable row level security;
alter table public.players enable row level security;
alter table public.attempts enable row level security;

-- ---------- 内部関数（クライアントからは呼べない） ----------

create or replace function public._clean_name(p_name text) returns text
language sql immutable as $$
  select left(btrim(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]', '', 'g')), 12)
$$;

create or replace function public._seat(p_match uuid, p_device uuid) returns smallint
language sql stable security definer set search_path = public as $$
  select seat from players where match_id = p_match and device_id = p_device
$$;

create or replace function public._pick_questions() returns text[]
language sql volatile security definer set search_path = public as $$
  select array_agg(id) from (select id from questions order by random() limit 15) s
$$;

-- 全員に見せてよい状態。正解と解説は「解説」フェーズの問題だけ載せる。
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

create or replace function public._broadcast(p_match uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v jsonb;
begin
  update matches set version = version + 1, last_active = now() where id = p_match;
  v := _state(p_match);
  perform realtime.send(v, 'state', 'battle:' || p_match::text, false);
  return v;
end
$$;

create or replace function public._join(p_match uuid, p_device uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into players (match_id, device_id, seat, name)
  values (p_match, p_device,
          (select coalesce(max(seat) + 1, 0) from players where match_id = p_match), p_name)
  on conflict (match_id, device_id) do update set name = excluded.name, last_seen = now();
  update matches
  set player_count = (select count(*) from players where match_id = p_match), last_active = now()
  where id = p_match;
end
$$;

create or replace function public._start(p_match uuid) returns void
language sql security definer set search_path = public as $$
  update matches
  set status = 'playing', phase = 'countdown', q_index = 0, winner_seat = null,
      phase_ends_at = now() + interval '3 seconds'
  where id = p_match
$$;

-- 期限に応じて1段階だけ進める。呼び出し側が matches 行をロックしていること。変化があれば true。
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
    update matches set phase = 'question', phase_ends_at = now() + interval '20 seconds' where id = m.id;
  elsif m.phase = 'question' then
    update matches set phase = 'reveal', phase_ends_at = now() + interval '7 seconds' where id = m.id;
  else
    select coalesce(max(score), 0) into v_top from players where match_id = m.id;
    if v_top >= 5 or m.q_index + 1 >= cardinality(m.q_ids) then
      update matches set status = 'finished', phase = null, phase_ends_at = null where id = m.id;
    else
      update matches
      set q_index = q_index + 1, phase = 'question', winner_seat = null,
          phase_ends_at = now() + interval '20 seconds'
      where id = m.id;
    end if;
  end if;
  return true;
end
$$;

-- ---------- クライアントが呼ぶ RPC ----------

create or replace function public.find_match(p_device uuid, p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_name text := _clean_name(p_name);
  v_id uuid;
begin
  if v_name = '' then
    raise exception 'NAME_REQUIRED';
  end if;
  -- 同時に押した人どうしが互いの新しい部屋を見られず別々に待つのを防ぐため、マッチングだけ直列化する
  perform pg_advisory_xact_lock(hashtext('find_match'));
  delete from matches where created_at < now() - interval '1 day';
  select id into v_id from matches
  where status = 'waiting' and code is null and player_count < 8 and last_active > now() - interval '15 seconds'
  order by created_at
  limit 1
  for update;
  if v_id is null then
    insert into matches (q_ids) values (_pick_questions()) returning id into v_id;
  end if;
  perform _join(v_id, p_device, v_name);
  perform _advance(v_id);
  return _broadcast(v_id) || jsonb_build_object('my_seat', _seat(v_id, p_device));
end
$$;

create or replace function public.create_room(p_device uuid, p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_name text := _clean_name(p_name);
  v_id uuid;
begin
  if v_name = '' then
    raise exception 'NAME_REQUIRED';
  end if;
  loop
    begin
      insert into matches (code, host_device, q_ids)
      values (lpad(floor(random() * 10000)::int::text, 4, '0'), p_device, _pick_questions())
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
  if m.player_count >= 8 and _seat(m.id, p_device) is null then
    raise exception 'ROOM_FULL';
  end if;
  perform _join(m.id, p_device, v_name);
  perform _advance(m.id);
  return _broadcast(m.id) || jsonb_build_object('my_seat', _seat(m.id, p_device));
end
$$;

create or replace function public.start_room(p_match uuid, p_device uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m matches%rowtype;
begin
  select * into m from matches where id = p_match for update;
  if not found or _seat(p_match, p_device) is null then
    raise exception 'NOT_IN_MATCH';
  end if;
  if m.status = 'waiting' then
    -- 作成者が抜けていたら誰でも開始できる
    if m.host_device is distinct from p_device and _seat(p_match, m.host_device) is not null then
      raise exception 'HOST_ONLY';
    end if;
    perform _start(p_match);
    return _broadcast(p_match) || jsonb_build_object('my_seat', _seat(p_match, p_device));
  end if;
  return _state(p_match) || jsonb_build_object('my_seat', _seat(p_match, p_device));
end
$$;

create or replace function public.leave_match(p_match uuid, p_device uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  m matches%rowtype;
  v_count int;
begin
  select * into m from matches where id = p_match for update;
  if not found or m.status <> 'waiting' then
    return;  -- 対戦中に抜けた人はそのまま（解答しないだけ）
  end if;
  delete from players where match_id = p_match and device_id = p_device;
  select count(*) into v_count from players where match_id = p_match;
  update matches
  set player_count = v_count,
      status = case when v_count = 0 then 'finished' else status end,
      host_device = case when host_device = p_device
        then (select device_id from players where match_id = p_match order by seat limit 1)
        else host_device end
  where id = p_match;
  perform _advance(p_match);
  perform _broadcast(p_match);
end
$$;

-- 生存通知＋期限切れの進行。待機中は2秒ごと、対戦中は期限を過ぎたときに呼ぶ。
create or replace function public.tick(p_match uuid, p_device uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform 1 from matches where id = p_match for update;
  if not found then
    return null;
  end if;
  update players set last_seen = now() where match_id = p_match and device_id = p_device;
  update matches set last_active = now() where id = p_match;
  if _advance(p_match) then
    return _broadcast(p_match) || jsonb_build_object('my_seat', _seat(p_match, p_device));
  end if;
  return _state(p_match) || jsonb_build_object('my_seat', _seat(p_match, p_device));
end
$$;

create or replace function public.get_match(p_match uuid, p_device uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select _state(p_match) || jsonb_build_object('my_seat', _seat(p_match, p_device))
  from matches where id = p_match
$$;

create or replace function public.submit_answer(p_match uuid, p_device uuid, p_q_index int, p_choice int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m matches%rowtype;
  v_seat smallint;
  v_correct boolean;
  v_tried int;
begin
  select * into m from matches where id = p_match for update;
  v_seat := _seat(p_match, p_device);
  if m.id is null or v_seat is null then
    raise exception 'NOT_IN_MATCH';
  end if;
  if m.status = 'playing' and m.phase = 'question' and m.q_index = p_q_index
     and now() < m.phase_ends_at and p_choice between 0 and 4
     and not exists (select 1 from attempts where match_id = p_match and q_index = p_q_index and seat = v_seat) then
    select answer = p_choice into v_correct from questions where id = m.q_ids[m.q_index + 1];
    insert into attempts (match_id, q_index, seat, choice, correct) values (p_match, p_q_index, v_seat, p_choice, v_correct);
    if v_correct then
      update players set score = score + 1 where match_id = p_match and seat = v_seat;
      update matches set phase = 'reveal', winner_seat = v_seat, phase_ends_at = now() + interval '7 seconds'
      where id = p_match;
    else
      select count(*) into v_tried from attempts where match_id = p_match and q_index = p_q_index;
      if v_tried >= m.player_count then
        update matches set phase = 'reveal', phase_ends_at = now() + interval '7 seconds' where id = p_match;
      end if;
    end if;
    return _broadcast(p_match) || jsonb_build_object('my_seat', v_seat);
  end if;
  if _advance(p_match) then
    return _broadcast(p_match) || jsonb_build_object('my_seat', v_seat);
  end if;
  return _state(p_match) || jsonb_build_object('my_seat', v_seat);
end
$$;

-- 振り返り：解説まで済んだ問題だけ、正解・解説・自分の解答を返す。
create or replace function public.get_review(p_match uuid, p_device uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', q.id,
      'answer', q.answer,
      'explanation', q.explanation,
      'my_choice', a.choice
    ) order by i), '[]'::jsonb)
  from matches m
  cross join generate_subscripts(m.q_ids, 1) i
  join questions q on q.id = m.q_ids[i]
  left join attempts a on a.match_id = m.id and a.q_index = i - 1 and a.seat = _seat(m.id, p_device)
  where m.id = p_match
    and _seat(m.id, p_device) is not null
    and (i - 1 < m.q_index or (i - 1 = m.q_index and (m.status = 'finished' or m.phase = 'reveal')))
$$;

-- ---------- 権限 ----------
revoke execute on function
  public._clean_name(text), public._seat(uuid, uuid), public._pick_questions(), public._state(uuid),
  public._broadcast(uuid), public._join(uuid, uuid, text), public._start(uuid), public._advance(uuid)
from public, anon, authenticated;

revoke execute on function
  public.find_match(uuid, text), public.create_room(uuid, text), public.join_room(text, uuid, text),
  public.start_room(uuid, uuid), public.leave_match(uuid, uuid), public.tick(uuid, uuid),
  public.get_match(uuid, uuid), public.submit_answer(uuid, uuid, int, int), public.get_review(uuid, uuid)
from public;
grant execute on function
  public.find_match(uuid, text), public.create_room(uuid, text), public.join_room(text, uuid, text),
  public.start_room(uuid, uuid), public.leave_match(uuid, uuid), public.tick(uuid, uuid),
  public.get_match(uuid, uuid), public.submit_answer(uuid, uuid, int, int), public.get_review(uuid, uuid)
to anon, authenticated;
