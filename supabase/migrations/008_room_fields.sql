-- 出題分野は正解を公開せずサーバーで検証する。既存の部屋は全分野のまま。
begin;
alter table public.questions add column if not exists field text not null default '';
alter table public.matches add column if not exists room_field text;
alter table public.matches add column if not exists started_at timestamptz;
update public.questions q set field=m.field from jsonb_to_recordset('[{"id":"genome-2025-001","field":"転写"},{"id":"genome-2025-002","field":"遺伝子組換え技術・法令"},{"id":"genome-2025-003","field":"DNAの構造・遺伝学史"},{"id":"genome-2025-004","field":"遺伝様式・集団遺伝"},{"id":"genome-2025-005","field":"遺伝様式・集団遺伝"},{"id":"genome-2025-006","field":"翻訳"},{"id":"genome-2025-007","field":"遺伝様式・集団遺伝"},{"id":"genome-2025-008","field":"DNA複製"},{"id":"genome-2025-009","field":"DNA修復・組換え"},{"id":"genome-2025-010","field":"遺伝子組換え技術・法令"},{"id":"genome-2025-011","field":"遺伝子組換え技術・法令"},{"id":"genome-2025-012","field":"DNA複製"},{"id":"genome-2025-013","field":"DNA修復・組換え"},{"id":"genome-2025-014","field":"DNA複製"},{"id":"genome-2025-015","field":"DNAの構造・遺伝学史"},{"id":"genome-2025-016","field":"ゲノム医療・応用"},{"id":"genome-2025-017","field":"転写"},{"id":"genome-2025-018","field":"転写"},{"id":"genome-2025-019","field":"転写"},{"id":"genome-2025-020","field":"転写"},{"id":"genome-2025-021","field":"転写"},{"id":"genome-2025-022","field":"染色体・クロマチン"},{"id":"genome-2025-023","field":"ゲノム医療・応用"},{"id":"genome-2025-024","field":"転写"},{"id":"genome-2025-025","field":"転写"},{"id":"genome-2025-026","field":"遺伝子組換え技術・法令"},{"id":"genome-2025-027","field":"転写"},{"id":"genome-2025-028","field":"転写"},{"id":"genome-2025-029","field":"翻訳"},{"id":"genome-2025-030","field":"遺伝子組換え技術・法令"},{"id":"genome-2025-031","field":"変異・多型"},{"id":"genome-2025-032","field":"翻訳"},{"id":"genome-2025-033","field":"ゲノム医療・応用"},{"id":"genome-2025-034","field":"遺伝子組換え技術・法令"},{"id":"genome-2025-035","field":"遺伝子組換え技術・法令"},{"id":"genome-2025-036","field":"翻訳"},{"id":"genome-2025-037","field":"遺伝子組換え技術・法令"},{"id":"genome-2025-038","field":"遺伝子組換え技術・法令"},{"id":"genome-2025-039","field":"翻訳"},{"id":"genome-2025-040","field":"変異・多型"},{"id":"genome-2025-041","field":"変異・多型"},{"id":"genome-2025-042","field":"変異・多型"},{"id":"genome-2025-043","field":"遺伝子組換え技術・法令"},{"id":"genome-2025-044","field":"遺伝子発現調節"},{"id":"genome-2025-045","field":"染色体・クロマチン"},{"id":"genome-2025-046","field":"遺伝子発現調節"},{"id":"genome-2025-047","field":"遺伝子発現調節"},{"id":"genome-2025-048","field":"遺伝子発現調節"},{"id":"genome-2025-049","field":"遺伝子発現調節"},{"id":"genome-2025-050","field":"染色体・クロマチン"},{"id":"genome-2025-051","field":"遺伝子発現調節"},{"id":"genome-2025-052","field":"遺伝子発現調節"},{"id":"genome-2025-053","field":"遺伝子発現調節"},{"id":"genome-2025-054","field":"エピジェネティクス"},{"id":"genome-2025-055","field":"遺伝子発現調節"},{"id":"genome-2025-056","field":"変異・多型"},{"id":"genome-2025-057","field":"変異・多型"},{"id":"genome-2025-058","field":"変異・多型"},{"id":"genome-2025-059","field":"変異・多型"},{"id":"genome-2025-060","field":"変異・多型"},{"id":"genome-2025-061","field":"エピジェネティクス"},{"id":"genome-2025-062","field":"ゲノム構造"},{"id":"genome-2025-063","field":"エピジェネティクス"},{"id":"genome-2025-064","field":"ゲノム構造"},{"id":"genome-2025-065","field":"遺伝様式・集団遺伝"},{"id":"genome-2025-066","field":"遺伝子発現調節"},{"id":"genome-2025-067","field":"DNA修復・組換え"},{"id":"genome-2025-068","field":"遺伝子組換え技術・法令"},{"id":"genome-2025-069","field":"DNAの構造・遺伝学史"},{"id":"genome-2025-070","field":"DNA複製"},{"id":"genome-2025-071","field":"遺伝子発現調節"},{"id":"genome-2025-072","field":"変異・多型"},{"id":"genome-2025-073","field":"遺伝子組換え技術・法令"},{"id":"genome-2025-074","field":"遺伝子組換え技術・法令"},{"id":"genome-2025-075","field":"遺伝子組換え技術・法令"},{"id":"genome-2025-076","field":"遺伝子組換え技術・法令"},{"id":"genome-2025-077","field":"DNA複製"},{"id":"genome-2025-078","field":"遺伝子組換え技術・法令"},{"id":"genome-2025-079","field":"遺伝子組換え技術・法令"},{"id":"genome-2025-080","field":"遺伝様式・集団遺伝"},{"id":"genome-2025-081","field":"遺伝子組換え技術・法令"},{"id":"genome-2025-082","field":"遺伝子組換え技術・法令"},{"id":"genome-2025-083","field":"変異・多型"},{"id":"genome-2025-084","field":"遺伝子組換え技術・法令"},{"id":"genome-2025-085","field":"遺伝子組換え技術・法令"},{"id":"genome-2025-086","field":"遺伝子組換え技術・法令"},{"id":"genome-2025-087","field":"遺伝子組換え技術・法令"},{"id":"genome-2025-088","field":"遺伝子組換え技術・法令"},{"id":"genome-2025-089","field":"遺伝子組換え技術・法令"},{"id":"genome-2025-090","field":"ゲノム医療・応用"},{"id":"genome-2025-091","field":"ゲノム医療・応用"},{"id":"genome-2025-092","field":"ゲノム医療・応用"},{"id":"genome-2025-093","field":"エピジェネティクス"},{"id":"genome-2025-094","field":"遺伝様式・集団遺伝"},{"id":"genome-2025-095","field":"遺伝子発現調節"},{"id":"genome-2025-096","field":"エピジェネティクス"},{"id":"genome-2025-097","field":"DNA複製"},{"id":"genome-2025-098","field":"遺伝子組換え技術・法令"},{"id":"genome-2025-099","field":"転写"},{"id":"genome-2025-100","field":"遺伝様式・集団遺伝"}]'::jsonb) as m(id text,field text) where q.id=m.id;
create index if not exists questions_field_idx on public.questions(field);
update public.matches m set started_at=m.created_at where m.started_at is null and
 (m.status='playing' or m.q_index>0 or exists(select 1 from public.attempts a where a.match_id=m.id));
create or replace function public._start(p_match uuid) returns void
language sql security definer set search_path=public as $$
 update matches set status='playing',phase='countdown',q_index=0,winner_seat=null,
 started_at=coalesce(started_at,now()),phase_ends_at=now()+interval '3 seconds' where id=p_match
$$;
create or replace function public._pick_field_questions(p_field text) returns text[]
language plpgsql volatile security definer set search_path=public as $$
declare ids text[];
begin
 if p_field is null then return _pick_questions(); end if;
 select array_agg(id) into ids from (select id from questions where field=p_field order by random() limit 15) s;
 if coalesce(cardinality(ids),0)=0 then raise exception 'BAD_ROOM_FIELD'; end if;
 return ids;
end $$;
create or replace function public._state(p_match uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', m.id,
    'code', m.code,
    'is_private', m.is_private,
    'room_field', m.room_field,
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

drop function if exists public.create_room(uuid,text,int,int,boolean);
create or replace function public.create_room(p_device uuid,p_name text,p_capacity int default null,p_seconds int default 20,p_private boolean default false,p_field text default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_name text:=_clean_name(p_name); v_id uuid;v_field text:=nullif(btrim(p_field),'');v_ids text[];
begin
  if p_device is null then raise exception 'NOT_IN_MATCH'; end if;
  if v_name='' then raise exception 'NAME_REQUIRED'; end if;
  if p_seconds is null or p_seconds not between 5 and 120 or p_capacity not between 2 and 8 or p_private is null then raise exception 'BAD_SETTINGS'; end if;
  v_ids:=_pick_field_questions(v_field);
  loop
    begin
      insert into matches(code,host_device,q_ids,capacity,answer_seconds,is_private,invite_token,room_field)
      values(lpad(floor(random()*10000)::int::text,4,'0'),p_device,v_ids,p_capacity,p_seconds,p_private,
        case when p_private then gen_random_uuid() end,v_field) returning id into v_id;
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
      'capacity',coalesce(m.capacity,8),'answer_seconds',m.answer_seconds,'field',m.room_field,'q_total',cardinality(m.q_ids)) as item
    from matches m where m.status='waiting' and m.code is not null and not m.is_private
      and m.last_active>now()-interval '15 seconds'
      and exists(select 1 from players p where p.match_id=m.id and p.last_seen>now()-interval '12 seconds')
    order by m.created_at desc limit 50
  ) s
$$;

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
 'invites',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'name',p.name,'is_private',m.is_private,'field',m.room_field,'q_total',cardinality(m.q_ids),'player_count',m.player_count,'capacity',coalesce(m.capacity,8)) order by i.expires_at desc)
 from friend_invites i join friendships f on f.id=i.friendship join matches m on m.id=i.match_id join friend_profiles p on p.device_id=i.sender
 where i.recipient=p_device and not i.consumed and i.expires_at>now() and f.status='accepted'
 and m.status='waiting' and m.last_active>now()-interval '15 seconds' and _seat(m.id,i.sender) is not null
 and (not m.is_private or i.invite_token is not distinct from m.invite_token)),'[]'::jsonb),'server_now',now())
$$;
create or replace function public.get_performance(p_device uuid) returns jsonb
language sql stable security definer set search_path=public as $$
  with study as (
    select count(*) as sessions,coalesce(sum(jsonb_array_length(history)),0) as answered,
      coalesce(sum(my_score),0) as correct
    from solo_sessions where device_id=p_device and mode='study' and phase='finished'
  ), ai as (
    select count(*) as matches,count(*) filter(where my_score>ai_score) as wins,
      count(*) filter(where my_score=ai_score) as draws,coalesce(sum(my_score),0) as points
    from solo_sessions where device_id=p_device and mode='ai' and phase='finished'
  ), human_results as (
    select p.score,
      (select max(other.score) from players other where other.match_id=m.id) as top_score,
      (select count(*) from players other where other.match_id=m.id and other.score=p.score) as same_score
    from matches m join players p on p.match_id=m.id
    -- 決着時はphaseがNULLに戻る。待機中に終了した部屋は進行・解答がないため除外する。
    where p.device_id=p_device and m.status='finished'
      and (m.started_at is not null or m.q_index>0 or exists(select 1 from attempts a where a.match_id=m.id))
  ), human as (
    select count(*) as matches,count(*) filter(where score=top_score and same_score=1) as wins,
      count(*) filter(where score=top_score and same_score>1) as draws,coalesce(sum(score),0) as points
    from human_results
  )
  select jsonb_build_object('study',to_jsonb(study),'ai',to_jsonb(ai),'human',to_jsonb(human),'server_now',now())
  from study,ai,human
$$;
revoke execute on function public._pick_field_questions(text) from public,anon,authenticated;
revoke execute on function public.create_room(uuid,text,int,int,boolean,text) from public;
grant execute on function public.create_room(uuid,text,int,int,boolean,text) to anon,authenticated;
notify pgrst,'reload schema';
commit;
