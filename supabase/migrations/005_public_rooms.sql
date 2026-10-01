-- 既存の合言葉ルームの公開範囲は維持。新規作成はデフォルト公開。
begin;
alter table public.matches add column if not exists is_private boolean not null default true;
alter table public.matches add column if not exists invite_token uuid;
create index if not exists public_rooms_waiting on public.matches(created_at) where status='waiting' and code is not null and not is_private;

create or replace function public._state(p_match uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', m.id,
    'code', m.code,
    'is_private', m.is_private,
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

-- 招待キーはBroadcastには含めず、参加済みホストへのRPC応答にだけ含める。
create or replace function public._room_for_device(p_match uuid,p_device uuid) returns jsonb
language sql stable security definer set search_path=public as $$
  select _state(m.id) || jsonb_build_object('my_seat',_seat(m.id,p_device),'invite_token',
    case when m.is_private and (m.host_device=p_device or _seat(m.id,m.host_device) is null)
      then m.invite_token::text end)
  from matches m where m.id=p_match and _seat(m.id,p_device) is not null
$$;

drop function if exists public.create_room(uuid,text,int,int);
create or replace function public.create_room(p_device uuid,p_name text,p_capacity int default null,p_seconds int default 20,p_private boolean default false) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_name text:=_clean_name(p_name); v_id uuid;
begin
  if p_device is null then raise exception 'NOT_IN_MATCH'; end if;
  if v_name='' then raise exception 'NAME_REQUIRED'; end if;
  if p_seconds is null or p_seconds not between 5 and 120 or p_capacity not between 2 and 8 or p_private is null then raise exception 'BAD_SETTINGS'; end if;
  loop
    begin
      insert into matches(code,host_device,q_ids,capacity,answer_seconds,is_private,invite_token)
      values(lpad(floor(random()*10000)::int::text,4,'0'),p_device,_pick_questions(),p_capacity,p_seconds,p_private,
        case when p_private then gen_random_uuid() end) returning id into v_id;
      exit;
    exception when unique_violation then null;
    end;
  end loop;
  perform _join(v_id,p_device,v_name);
  perform _broadcast(v_id);
  return _room_for_device(v_id,p_device);
end
$$;

create or replace function public.list_public_rooms() returns jsonb
language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(item order by created_at desc),'[]'::jsonb) from (
    select m.created_at,jsonb_build_object('id',m.id,
      'host_name',coalesce((select p.name from players p where p.match_id=m.id and p.device_id=m.host_device),
        (select p.name from players p where p.match_id=m.id order by p.seat limit 1),'ゲスト'),
      'player_count',(select count(*) from players p where p.match_id=m.id and p.last_seen>now()-interval '12 seconds'),
      'capacity',coalesce(m.capacity,8),'answer_seconds',m.answer_seconds) as item
    from matches m where m.status='waiting' and m.code is not null and not m.is_private
      and m.last_active>now()-interval '15 seconds'
      and exists(select 1 from players p where p.match_id=m.id and p.last_seen>now()-interval '12 seconds')
    order by m.created_at desc limit 50
  ) s
$$;

create or replace function public.join_public_room(p_match uuid,p_device uuid,p_name text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare m matches%rowtype;v_name text:=_clean_name(p_name);
begin
  if p_device is null then raise exception 'NOT_IN_MATCH'; end if;
  if v_name='' then raise exception 'NAME_REQUIRED'; end if;
  select * into m from matches where id=p_match for update;
  if not found or m.status<>'waiting' or m.code is null or m.is_private or m.last_active<now()-interval '15 seconds'
    then raise exception 'ROOM_NOT_FOUND'; end if;
  perform _advance(m.id);
  select * into m from matches where id=p_match;
  if m.status<>'waiting' then raise exception 'ROOM_NOT_FOUND'; end if;
  if m.player_count>=coalesce(m.capacity,8) and _seat(m.id,p_device) is null then raise exception 'ROOM_FULL'; end if;
  perform _join(m.id,p_device,v_name);
  perform _broadcast(m.id);
  return _room_for_device(m.id,p_device);
end
$$;

drop function if exists public.join_room(text,uuid,text);
create or replace function public.join_room(p_code text,p_device uuid,p_name text,p_invite text default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare m matches%rowtype;v_name text:=_clean_name(p_name);
begin
  if p_device is null then raise exception 'NOT_IN_MATCH'; end if;
  if v_name='' then raise exception 'NAME_REQUIRED'; end if;
  select * into m from matches where code=btrim(p_code) and status='waiting' for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  -- 移行前の招待ルームは招待キーなしの旧合言葉を維持する。
  if m.is_private and m.invite_token is not null and m.invite_token::text is distinct from btrim(p_invite)
    and _seat(m.id,p_device) is null then raise exception 'INVITE_REQUIRED'; end if;
  perform _advance(m.id);
  select * into m from matches where id=m.id;
  if m.status<>'waiting' then raise exception 'ROOM_NOT_FOUND'; end if;
  if m.player_count>=coalesce(m.capacity,8) and _seat(m.id,p_device) is null then raise exception 'ROOM_FULL'; end if;
  perform _join(m.id,p_device,v_name);
  perform _broadcast(m.id);
  return _room_for_device(m.id,p_device);
end
$$;

create or replace function public.set_room_private(p_match uuid,p_device uuid,p_private boolean) returns jsonb
language plpgsql security definer set search_path=public as $$
declare m matches%rowtype;
begin
  select * into m from matches where id=p_match for update;
  if not found or _seat(m.id,p_device) is null then raise exception 'NOT_IN_MATCH'; end if;
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

create or replace function public.get_match(p_match uuid,p_device uuid) returns jsonb
language sql stable security definer set search_path=public as $$
  select _room_for_device(p_match,p_device)
$$;

create or replace function public.tick(p_match uuid,p_device uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
  perform 1 from matches where id=p_match for update;
  if not found then return null; end if;
  if _seat(p_match,p_device) is null then raise exception 'NOT_IN_MATCH'; end if;
  update players set last_seen=now() where match_id=p_match and device_id=p_device;
  update matches set last_active=now() where id=p_match;
  if _advance(p_match) then perform _broadcast(p_match); end if;
  return _room_for_device(p_match,p_device);
end
$$;

revoke execute on function public._room_for_device(uuid,uuid) from public,anon,authenticated;
revoke execute on function public.create_room(uuid,text,int,int,boolean),public.list_public_rooms(),public.join_public_room(uuid,uuid,text),public.join_room(text,uuid,text,text),public.set_room_private(uuid,uuid,boolean),public.get_match(uuid,uuid),public.tick(uuid,uuid) from public;
grant execute on function public.create_room(uuid,text,int,int,boolean),public.list_public_rooms(),public.join_public_room(uuid,uuid,text),public.join_room(text,uuid,text,text),public.set_room_private(uuid,uuid,boolean),public.get_match(uuid,uuid),public.tick(uuid,uuid) to anon,authenticated;
notify pgrst,'reload schema';
commit;
