-- マッチング対戦を「ソロ（2人）・3人・4人」の3択、1問20秒、解説3秒に固定する。
-- 対戦室（合言葉）は従来どおり定員・制限時間を選べ、解説は7秒。
-- マッチング由来の試合は matchmaking=true とし、同じメンバーでの再戦にも引き継ぐ。
begin;
alter table public.matches add column if not exists matchmaking boolean not null default false;
update public.matches set matchmaking = true where code is null and not matchmaking;

create or replace function public._reveal_interval(p_matchmaking boolean) returns interval
language sql immutable set search_path = public as $$
  select case when p_matchmaking then interval '3 seconds' else interval '7 seconds' end
$$;

create or replace function public._state(p_match uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', m.id,
    'code', m.code,
    'is_private', m.is_private,
    'room_field', m.room_field,
    'rematch_of',m.rematch_of,
    'can_rematch',m.status='finished' and m.started_at is not null and (select count(*) from players where match_id=m.id)>=2,
    'rematch_requested',exists(select 1 from matches n where n.id=m.rematch_id and n.status in ('waiting','playing')),
    'rematch_joined',(select count(*) from players where match_id=m.rematch_id and last_seen>now()-interval '12 seconds'),
    'rematch_total',(select count(*) from players where match_id=m.id),
    'rematch_roster',coalesce((select jsonb_agg(jsonb_build_object('name',r.name,'seat',r.seat,'joined',p.device_id is not null and p.last_seen>now()-interval '12 seconds','ready',coalesce(p.ready and p.last_seen>now()-interval '12 seconds',false)) order by r.seat)
      from rematch_members r left join players p on p.match_id=r.match_id and p.device_id=r.device_id where r.match_id=m.id),'[]'::jsonb),
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
    'matchmaking', m.matchmaking,
    'version', m.version,
    'host_seat', (select p.seat from players p where p.match_id = m.id and p.device_id = m.host_device),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'seat', p.seat,
        'name', p.name,
        'score', p.score,
        'ready',p.ready,
        'mark', (select case when m.phase = 'question' then 'answered' when a.correct then 'o' else 'x' end
                 from attempts a where a.match_id = m.id and a.q_index = m.q_index and a.seat = p.seat)
      ) order by p.seat)
      from players p where p.match_id = m.id), '[]'::jsonb),
    'reveal', case when m.phase = 'reveal' then (
      select jsonb_build_object('answer', q.answer, 'explanation', q.explanation)
      from questions q where q.id = m.q_ids[m.q_index + 1]) end
  )
  from matches m where m.id = p_match
$$;

create or replace function public.submit_answer(p_match uuid, p_device uuid, p_q_index int, p_choice int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m matches%rowtype;
  v_seat smallint;
  v_correct boolean;
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
    end if;
    -- 対戦中に抜けた人も players に残るので、来ない人の分は制限時間で打ち切る。
    if (select count(*) from attempts where match_id = p_match and q_index = p_q_index)
       >= (select count(*) from players where match_id = p_match) then
      update matches set phase = 'reveal', phase_ends_at = now() + _reveal_interval(m.matchmaking) where id = p_match;
    end if;
    return _broadcast(p_match) || jsonb_build_object('my_seat', v_seat);
  end if;
  if _advance(p_match) then
    return _broadcast(p_match) || jsonb_build_object('my_seat', v_seat);
  end if;
  return _state(p_match) || jsonb_build_object('my_seat', v_seat);
end
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
    if m.rematch_of is not null then
      -- 再戦への参加資格は一時切断でも保持し、準備完了だけを取り消す。
      update players set ready=false where match_id=m.id and ready and last_seen<now()-interval '12 seconds';
      get diagnostics v_deleted=row_count;
    else
      delete from players where match_id = m.id and last_seen < now() - interval '12 seconds';
      get diagnostics v_deleted = row_count;
    end if;
    select count(*) into v_count from players where match_id = m.id;
    if v_count = 0 then
      update matches set status = 'finished', player_count = 0 where id = m.id;
      return true;
    end if;
    update matches set player_count = v_count where id = m.id;
    if m.rematch_of is not null then
      if v_count=(select count(*) from rematch_members where match_id=m.id) and v_count>=2
         and not exists(select 1 from players where match_id=m.id and not ready) then
        perform _start(m.id);return true;
      end if;
      return v_deleted>0;
    end if;
    if m.code is not null then
      return v_deleted > 0;  -- 合言葉ルームは開始ボタンで始める
    end if;
    if exists(select 1 from players where match_id=m.id and not ready) then
      if m.phase_ends_at is not null then
        update matches set phase_ends_at=null where id=m.id;return true;
      end if;
      return v_deleted>0;
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
    update matches set phase = 'reveal', phase_ends_at = now() + _reveal_interval(m.matchmaking) where id = m.id;
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

create or replace function public.request_rematch(p_match uuid,p_device uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare m matches%rowtype;n matches%rowtype;v_id uuid;v_name text;v_host uuid;
begin
 select * into m from matches where id=p_match for update;
 if not found or _seat(m.id,p_device) is null then raise exception 'NOT_IN_MATCH'; end if;
 if m.status<>'finished' or m.started_at is null or (select count(*) from players where match_id=m.id)<2 then raise exception 'REMATCH_UNAVAILABLE'; end if;
 select * into n from matches where id=m.rematch_id for update;
 if n.id is null or (n.status='finished' and n.started_at is null) then
   v_host:=coalesce(m.host_device,(select device_id from players where match_id=m.id order by seat limit 1));
   loop
     begin
       insert into matches(code,host_device,q_ids,capacity,answer_seconds,is_private,room_field,rematch_of,matchmaking)
       values(lpad(floor(random()*10000)::int::text,4,'0'),v_host,_pick_field_questions(m.room_field),m.capacity,m.answer_seconds,m.is_private,m.room_field,m.id,m.matchmaking) returning id into v_id;
       exit;
     exception when unique_violation then null;
     end;
   end loop;
   insert into rematch_members(match_id,device_id,seat,name) select v_id,device_id,seat,name from players where match_id=m.id;
   update matches set rematch_id=v_id where id=m.id;
   select * into n from matches where id=v_id for update;
 end if;
 if n.status='waiting' then
   select name into v_name from rematch_members where match_id=n.id and device_id=p_device;
   perform _join(n.id,p_device,v_name);
   perform _advance(n.id);perform _broadcast(n.id);perform _broadcast(m.id);
 elsif _seat(n.id,p_device) is null then raise exception 'REMATCH_UNAVAILABLE';
 end if;
 return _room_for_device(n.id,p_device);
end $$;

-- 人数の指定がなければソロ（2人）。制限時間は端末の指定にかかわらず20秒。
create or replace function public.find_match(p_device uuid, p_name text, p_capacity int default null, p_seconds int default 20)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_name text := _clean_name(p_name);
  v_capacity int := coalesce(p_capacity, 2);
  v_id uuid;
begin
  if v_name = '' then
    raise exception 'NAME_REQUIRED';
  end if;
  if v_capacity not between 2 and 4 then
    raise exception 'BAD_MATCH_SIZE';
  end if;
  -- 同時に押した人どうしが互いの新しい部屋を見られず別々に待つのを防ぐため、マッチングだけ直列化する
  perform pg_advisory_xact_lock(hashtext('find_match'));
  delete from matches where created_at < now() - interval '1 day';
  select id into v_id from matches
  where status = 'waiting' and code is null and matchmaking
    and capacity = v_capacity and answer_seconds = 20
    and player_count < capacity and last_active > now() - interval '15 seconds'
  order by created_at
  limit 1
  for update;
  if v_id is null then
    insert into matches (q_ids, capacity, answer_seconds, matchmaking)
    values (_pick_questions(), v_capacity, 20, true) returning id into v_id;
  end if;
  perform _join(v_id, p_device, v_name);
  perform _advance(v_id);
  return _broadcast(v_id) || jsonb_build_object('my_seat', _seat(v_id, p_device));
end
$$;

revoke execute on function public._reveal_interval(boolean) from public, anon, authenticated;
notify pgrst,'reload schema';
commit;
