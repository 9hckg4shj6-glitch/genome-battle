begin;
create table if not exists public.friend_profiles (
  device_id uuid primary key,
  code text not null unique default upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),
  name text not null,
  last_seen timestamptz not null default now()
);
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_low uuid not null references friend_profiles(device_id) on delete cascade,
  user_high uuid not null references friend_profiles(device_id) on delete cascade,
  requester uuid not null,
  status text not null default 'pending' check(status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  unique(user_low,user_high),check(user_low<user_high),check(requester in (user_low,user_high))
);
create table if not exists public.friend_invites (
  id uuid primary key default gen_random_uuid(),
  friendship uuid not null references friendships(id) on delete cascade,
  sender uuid not null,recipient uuid not null,
  match_id uuid not null references matches(id) on delete cascade,
  invite_token uuid,
  expires_at timestamptz not null default now()+interval '10 minutes',
  consumed boolean not null default false,
  unique(match_id,recipient)
);
alter table friend_profiles enable row level security;
alter table friendships enable row level security;
alter table friend_invites enable row level security;
create index if not exists friend_recipient_idx on friend_invites(recipient) where not consumed;

create or replace function public._friend_snapshot(p_device uuid) returns jsonb
language sql stable security definer set search_path=public as $$
 select jsonb_build_object('profile',(select jsonb_build_object('code',code,'name',name) from friend_profiles where device_id=p_device),
 'friends',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'code',p.code,'name',p.name,'online',p.last_seen>now()-interval '60 seconds') order by p.name)
 from friendships f join friend_profiles p on p.device_id=case when f.user_low=p_device then f.user_high else f.user_low end
 where p_device in (f.user_low,f.user_high) and f.status='accepted'),'[]'::jsonb),
 'incoming',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'code',p.code,'name',p.name) order by f.created_at)
 from friendships f join friend_profiles p on p.device_id=f.requester
 where p_device in (f.user_low,f.user_high) and f.requester<>p_device and f.status='pending'),'[]'::jsonb),
 'outgoing',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'code',p.code,'name',p.name) order by f.created_at)
 from friendships f join friend_profiles p on p.device_id=case when f.user_low=p_device then f.user_high else f.user_low end
 where f.requester=p_device and f.status='pending'),'[]'::jsonb),
 'invites',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'name',p.name,'is_private',m.is_private,'player_count',m.player_count,'capacity',coalesce(m.capacity,8)) order by i.expires_at desc)
 from friend_invites i join friendships f on f.id=i.friendship join matches m on m.id=i.match_id join friend_profiles p on p.device_id=i.sender
 where i.recipient=p_device and not i.consumed and i.expires_at>now() and f.status='accepted'
 and m.status='waiting' and m.last_active>now()-interval '15 seconds' and _seat(m.id,i.sender) is not null
 and (not m.is_private or i.invite_token is not distinct from m.invite_token)),'[]'::jsonb),'server_now',now())
$$;
create or replace function public.friend_sync(p_device uuid,p_name text default null) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
 if p_device is null then raise exception 'FRIEND_PROFILE_REQUIRED'; end if;
 insert into friend_profiles(device_id,name) values(p_device,coalesce(nullif(_clean_name(p_name),''),'ゲストプレイヤー'))
 on conflict(device_id) do update set last_seen=now(),name=coalesce(nullif(_clean_name(p_name),''),friend_profiles.name);
 return _friend_snapshot(p_device);
end $$;
create or replace function public.friend_request(p_device uuid,p_code text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_peer uuid;f friendships%rowtype;
begin
 if not exists(select 1 from friend_profiles where device_id=p_device) then raise exception 'FRIEND_PROFILE_REQUIRED'; end if;
 select device_id into v_peer from friend_profiles where code=upper(regexp_replace(coalesce(p_code,''),'[\s-]','','g'));
 if v_peer is null then raise exception 'FRIEND_NOT_FOUND'; end if;
 if v_peer=p_device then raise exception 'FRIEND_SELF'; end if;
 perform pg_advisory_xact_lock(hashtextextended(least(p_device,v_peer)::text||greatest(p_device,v_peer)::text,0));
 select * into f from friendships where user_low=least(p_device,v_peer) and user_high=greatest(p_device,v_peer);
 if found then return _friend_snapshot(p_device); end if;
 if (select count(*) from friendships where p_device in (user_low,user_high))>=100
 or (select count(*) from friendships where v_peer in (user_low,user_high))>=100 then raise exception 'FRIEND_LIMIT'; end if;
 insert into friendships(user_low,user_high,requester) values(least(p_device,v_peer),greatest(p_device,v_peer),p_device);
 return _friend_snapshot(p_device);
end $$;
create or replace function public.friend_respond(p_device uuid,p_friendship uuid,p_action text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare f friendships%rowtype;
begin
 select * into f from friendships where id=p_friendship and p_device in (user_low,user_high) for update;
 if not found then raise exception 'FRIEND_NOT_FOUND'; end if;
 if p_action='accept' and f.status='pending' and f.requester<>p_device then
 update friendships set status='accepted' where id=f.id;
 elsif p_action='remove' then delete from friendships where id=f.id;
 else raise exception 'FRIEND_ACTION_DENIED'; end if;
 return _friend_snapshot(p_device);
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
 if m.host_device is distinct from p_device or _seat(m.id,p_device) is null then raise exception 'HOST_ONLY'; end if;
 if _seat(m.id,v_peer) is not null then raise exception 'FRIEND_ALREADY_IN_ROOM'; end if;
 if m.player_count>=coalesce(m.capacity,8) then raise exception 'ROOM_FULL'; end if;
 insert into friend_invites(friendship,sender,recipient,match_id,invite_token) values(f.id,p_device,v_peer,m.id,m.invite_token)
 on conflict(match_id,recipient) do update set consumed=false,invite_token=excluded.invite_token,expires_at=now()+interval '10 minutes';
 return jsonb_build_object('sent',true,'server_now',now());
end $$;
create or replace function public.join_friend_invite(p_device uuid,p_invite uuid,p_name text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare i friend_invites%rowtype;m matches%rowtype;v_state jsonb;
begin
 select * into i from friend_invites where id=p_invite and recipient=p_device and expires_at>now() for update;
 if not found or not exists(select 1 from friendships where id=i.friendship and status='accepted') then raise exception 'FRIEND_INVITE_EXPIRED'; end if;
 select * into m from matches where id=i.match_id for update;
 if i.consumed and _seat(m.id,p_device) is not null then return _room_for_device(m.id,p_device); end if;
 if i.consumed then raise exception 'FRIEND_INVITE_EXPIRED'; end if;
 if not found or m.status<>'waiting' or m.last_active<now()-interval '15 seconds' or _seat(m.id,i.sender) is null
 or (m.is_private and i.invite_token is distinct from m.invite_token) then raise exception 'FRIEND_INVITE_EXPIRED'; end if;
 v_state:=join_room(m.code,p_device,p_name,case when m.is_private then i.invite_token::text end);
 update friend_invites set consumed=true where id=i.id;
 return v_state;
end $$;
create or replace function public.dismiss_friend_invite(p_device uuid,p_invite uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
 update friend_invites set consumed=true where id=p_invite and recipient=p_device;
 return _friend_snapshot(p_device);
end $$;
create or replace function public.connection_ping() returns jsonb
language sql stable security definer set search_path=public as $$select jsonb_build_object('server_now',now())$$;
revoke all on public.friend_profiles,public.friendships,public.friend_invites from anon,authenticated;
revoke execute on function public._friend_snapshot(uuid) from public,anon,authenticated;
revoke execute on function public.friend_sync(uuid,text),public.friend_request(uuid,text),public.friend_respond(uuid,uuid,text),public.invite_friend(uuid,text,uuid),public.join_friend_invite(uuid,uuid,text),public.dismiss_friend_invite(uuid,uuid),public.connection_ping() from public;
grant execute on function public.friend_sync(uuid,text),public.friend_request(uuid,text),public.friend_respond(uuid,uuid,text),public.invite_friend(uuid,text,uuid),public.join_friend_invite(uuid,uuid,text),public.dismiss_friend_invite(uuid,uuid),public.connection_ping() to anon,authenticated;
notify pgrst,'reload schema';
commit;
