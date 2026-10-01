-- 準備完了の確認・元の成績を保った同一メンバーでの再戦。
begin;
alter table public.players add column if not exists ready boolean not null default false;
alter table public.matches add column if not exists rematch_of uuid;
alter table public.matches add column if not exists rematch_id uuid;
create table if not exists public.rematch_members (
 match_id uuid not null references public.matches(id) on delete cascade,
 device_id uuid not null,seat smallint not null,name text not null,
 primary key(match_id,device_id),unique(match_id,seat)
);
alter table public.rematch_members enable row level security;
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
    'version', m.version,
    'host_seat', (select p.seat from players p where p.match_id = m.id and p.device_id = m.host_device),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'seat', p.seat,
        'name', p.name,
        'score', p.score,
        'ready',p.ready,
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
create or replace function public._join(p_match uuid, p_device uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists(select 1 from matches where id=p_match and rematch_of is not null)
     and not exists(select 1 from rematch_members where match_id=p_match and device_id=p_device) then
    raise exception 'REMATCH_MEMBERS_ONLY';
  end if;
  if _seat(p_match,p_device) is null then
    update matches set phase_ends_at=null where id=p_match and status='waiting' and code is null;
  end if;
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
language plpgsql security definer set search_path=public as $$
begin
 if (select count(*) from players where match_id=p_match)<2 then raise exception 'NEED_PLAYERS'; end if;
 if exists(select 1 from players where match_id=p_match and (not ready or last_seen<now()-interval '12 seconds')) then raise exception 'NOT_ALL_READY'; end if;
 if exists(select 1 from matches m where m.id=p_match and m.rematch_of is not null and
   (select count(*) from players where match_id=m.id)<>(select count(*) from rematch_members where match_id=m.id)) then raise exception 'NOT_ALL_READY'; end if;
 update matches set status='playing',phase='countdown',q_index=0,winner_seat=null,
 started_at=coalesce(started_at,now()),phase_ends_at=now()+interval '3 seconds' where id=p_match;
end $$;
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
create or replace function public.start_room(p_match uuid, p_device uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare m matches%rowtype;
begin
  select * into m from matches where id=p_match for update;
  if not found or _seat(p_match,p_device) is null then raise exception 'NOT_IN_MATCH'; end if;
  if m.code is null then raise exception 'ROOM_ONLY'; end if;
  if m.status='waiting' then
    perform _advance(m.id);
    select * into m from matches where id=p_match;
    if m.status='playing' then return _room_for_device(m.id,p_device); end if;
    if _seat(p_match,p_device) is null then raise exception 'NOT_IN_MATCH'; end if;
    if m.host_device is distinct from p_device and _seat(m.id,m.host_device) is not null then
      raise exception 'HOST_ONLY';
    end if;
    if (select count(*) from players where match_id=m.id) < 2 then raise exception 'NEED_PLAYERS'; end if;
    perform _start(m.id);
    return _broadcast(m.id) || jsonb_build_object('my_seat',_seat(m.id,p_device));
  end if;
  return _state(m.id) || jsonb_build_object('my_seat',_seat(m.id,p_device));
end
$$;
create or replace function public.set_room_private(p_match uuid,p_device uuid,p_private boolean) returns jsonb
language plpgsql security definer set search_path=public as $$
declare m matches%rowtype;
begin
  select * into m from matches where id=p_match for update;
  if not found or _seat(m.id,p_device) is null then raise exception 'NOT_IN_MATCH'; end if;
  if m.rematch_of is not null then raise exception 'REMATCH_MEMBERS_ONLY'; end if;
  if m.code is null then raise exception 'ROOM_ONLY'; end if;
  if m.host_device is distinct from p_device and _seat(m.id,m.host_device) is not null then raise exception 'HOST_ONLY'; end if;
  if m.status<>'waiting' then raise exception 'ROOM_STARTED'; end if;
  if p_private is null then raise exception 'BAD_SETTINGS'; end if;
  update matches set is_private=p_private,invite_token=case
    when p_private and (not is_private or invite_token is null) then gen_random_uuid()
    when p_private then invite_token else null end where id=m.id;
  perform _broadcast(m.id);
  return _room_for_device(m.id,p_device);
end
$$;
create or replace function public.list_public_rooms() returns jsonb
language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(item order by created_at desc),'[]'::jsonb) from (
    select m.created_at,jsonb_build_object('id',m.id,
      'host_name',coalesce((select p.name from players p where p.match_id=m.id and p.device_id=m.host_device),
        (select p.name from players p where p.match_id=m.id order by p.seat limit 1),'ゲスト'),
      'player_count',(select count(*) from players p where p.match_id=m.id and p.last_seen>now()-interval '12 seconds'),
      'capacity',coalesce(m.capacity,8),'answer_seconds',m.answer_seconds,'field',m.room_field,'q_total',cardinality(m.q_ids)) as item
    from matches m where m.status='waiting' and m.code is not null and not m.is_private and m.rematch_of is null
      and m.last_active>now()-interval '15 seconds'
      and exists(select 1 from players p where p.match_id=m.id and p.last_seen>now()-interval '12 seconds')
    order by m.created_at desc limit 50
  ) s
$$;

create or replace function public.set_ready(p_match uuid,p_device uuid,p_ready boolean) returns jsonb
language plpgsql security definer set search_path=public as $$
declare m matches%rowtype;
begin
 select * into m from matches where id=p_match for update;
 if not found or _seat(p_match,p_device) is null then raise exception 'NOT_IN_MATCH'; end if;
 if p_ready is null then raise exception 'BAD_SETTINGS'; end if;
 if m.status<>'waiting' then return _room_for_device(m.id,p_device); end if;
 update players set ready=p_ready,last_seen=now() where match_id=m.id and device_id=p_device;
 perform _advance(m.id);perform _broadcast(m.id);
 return _room_for_device(m.id,p_device);
end $$;

-- 元の試合をロックして再戦先を一つだけ作る。各参加者は自分で参加・準備を選ぶ。
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
       insert into matches(code,host_device,q_ids,capacity,answer_seconds,is_private,room_field,rematch_of)
       values(lpad(floor(random()*10000)::int::text,4,'0'),v_host,_pick_field_questions(m.room_field),m.capacity,m.answer_seconds,m.is_private,m.room_field,m.id) returning id into v_id;
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
create or replace function public.invite_friend(p_device uuid,p_code text,p_match uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_peer uuid;f friendships%rowtype;m matches%rowtype;
begin
 select device_id into v_peer from friend_profiles where code=upper(p_code);
 select * into f from friendships where user_low=least(p_device,v_peer) and user_high=greatest(p_device,v_peer) and status='accepted';
 if not found then raise exception 'FRIEND_NOT_ACCEPTED'; end if;
 select * into m from matches where id=p_match for update;
 if not found or m.status<>'waiting' or m.code is null or m.last_active<now()-interval '15 seconds' then raise exception 'ROOM_NOT_FOUND'; end if;
 if m.rematch_of is not null then raise exception 'REMATCH_MEMBERS_ONLY'; end if;
 if m.host_device is distinct from p_device or _seat(m.id,p_device) is null then raise exception 'HOST_ONLY'; end if;
 if _seat(m.id,v_peer) is not null then raise exception 'FRIEND_ALREADY_IN_ROOM'; end if;
 if m.player_count>=coalesce(m.capacity,8) then raise exception 'ROOM_FULL'; end if;
 insert into friend_invites(friendship,sender,recipient,match_id,invite_token) values(f.id,p_device,v_peer,m.id,m.invite_token)
 on conflict(match_id,recipient) do update set consumed=false,invite_token=excluded.invite_token,expires_at=now()+interval '10 minutes';
 return jsonb_build_object('sent',true,'server_now',now());
end $$;
revoke execute on function public.set_ready(uuid,uuid,boolean),public.request_rematch(uuid,uuid) from public;
grant execute on function public.set_ready(uuid,uuid,boolean),public.request_rematch(uuid,uuid) to anon,authenticated;
notify pgrst,'reload schema';
commit;
