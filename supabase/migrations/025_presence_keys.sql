-- オンライン人数（Realtime Presence）のキーと、管理画面の「裏で開いている端末」（024の続き）。
-- これまでアプリは Presence のキーに端末IDをそのまま使っていた。Presence の一覧は誰でも購読できるため、
-- 開いている人の端末ID（各RPCの本人確認に使う値）が読めてしまっていた。アプリは端末IDのハッシュをキーにする（src/presence.ts）。
-- 管理画面の「いまオンライン」は、画面を表示している間だけ30秒ごとに届くフレンド同期（friend_profiles.last_seen）で
-- 判定していたため、アプリを開いたまま裏に回した端末が数えられていなかった。管理画面が Presence を読み取りだけで購読し、
-- そのキーを get_admin_dashboard に渡すと、同じハッシュで端末と結びつけて「裏で開いている」を返す。
-- 更新前のアプリ（端末IDのままのキー）も、更新で読み込み直されるまでのあいだ結びつける。
begin;
create or replace function public._presence_key(p_device uuid) returns text
language sql immutable set search_path=public,extensions as $$
  select encode(extensions.digest('gb-presence:'||p_device::text,'sha256'),'hex')
$$;

drop function if exists public.get_admin_dashboard();
create or replace function public.get_admin_dashboard(p_present text[] default null) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare
  v_today timestamptz:=((now() at time zone 'Asia/Tokyo')::date)::timestamp at time zone 'Asia/Tokyo';
  v_keys text[];
begin
  if not _is_admin() then raise exception 'ADMIN_ONLY'; end if;
  -- 管理画面が見ている Presence のキー（重複を除く）。未接続なら null のまま。
  if p_present is not null then
    select coalesce(array_agg(distinct k),'{}') into v_keys from unnest(p_present[1:5000]) k where k is not null and length(k)<=80;
  end if;
  return jsonb_build_object(
    'now',_online_now(),
    'presence',case when v_keys is null then null else (
      with m as (select device_id from friend_profiles where _presence_key(device_id)=any(v_keys) or device_id::text=any(v_keys))
      select jsonb_build_object('open',cardinality(v_keys),'matched',(select count(*) from m),
        'background',(select count(*) from m join friend_profiles p using(device_id) where p.last_seen<=now()-interval '90 seconds'))) end,
    'active',(select jsonb_build_object(
      'h1',count(*) filter(where last_seen>now()-interval '1 hour'),
      'today',count(*) filter(where last_seen>=v_today),
      'd7',count(*) filter(where last_seen>now()-interval '7 days'),
      'total',count(*),
      'new_today',count(*) filter(where first_seen>=v_today),
      'new_d7',count(*) filter(where first_seen>now()-interval '7 days')) from friend_profiles),
    'today',jsonb_build_object(
      'answers',(select count(*) from study_answer_records where answered_at>=v_today),
      'studies',(select count(*) from solo_sessions where mode='study' and created_at>=v_today),
      'ai',(select count(*) from solo_sessions where mode='ai' and created_at>=v_today),
      'battles',(select count(*) from matches where started_at>=v_today)),
    'hourly',(select coalesce(jsonb_agg(jsonb_build_object('at',h,'online',o,'studying',s,'ai',a,'battle',b) order by h),'[]'::jsonb) from (
      select date_trunc('hour',at) h,max(online) o,max(studying) s,max(ai) a,max(battle) b
      from online_samples where at>date_trunc('hour',now())-interval '23 hours' group by 1) x),
    'daily',(select coalesce(jsonb_agg(jsonb_build_object('day',d,'online',o) order by d),'[]'::jsonb) from (
      select (at at time zone 'Asia/Tokyo')::date d,max(online) o
      from online_samples where at>=v_today-interval '13 days' group by 1) x),
    'peak',(select jsonb_build_object('online',online,'at',at) from online_samples order by online desc,at desc limit 1),
    'sampled_since',(select min(at) from online_samples),
    'db',jsonb_build_object('connections',(select count(*) from pg_stat_activity),'max',current_setting('max_connections')::int),
    'users',(select coalesce(jsonb_agg(u order by (u->>'present')::boolean desc,(u->>'last_seen')::timestamptz desc),'[]'::jsonb) from (
      select jsonb_build_object(
        'name',p.name,'code',p.code,'last_seen',p.last_seen,'first_seen',p.first_seen,
        'online',p.last_seen>now()-interval '90 seconds',
        'present',coalesce(_presence_key(p.device_id)=any(v_keys) or p.device_id::text=any(v_keys),false),
        'activity',case
          when exists(select 1 from players pl join matches m on m.id=pl.match_id where pl.device_id=p.device_id and m.status in ('waiting','playing') and pl.last_seen>now()-interval '1 minute') then 'battle'
          when exists(select 1 from solo_sessions s where s.device_id=p.device_id and s.mode='ai' and s.phase<>'finished' and s.updated_at>now()-interval '2 minutes') then 'ai'
          when exists(select 1 from solo_sessions s where s.device_id=p.device_id and s.mode='study' and s.phase<>'finished' and s.updated_at>now()-interval '3 minutes') then 'study'
        end,
        'answers',(select count(*) from study_answer_records r where r.device_id=p.device_id),
        'answers_today',(select count(*) from study_answer_records r where r.device_id=p.device_id and r.answered_at>=v_today),
        'questions',(select count(distinct question_id) from study_answer_records r where r.device_id=p.device_id)) as u
      -- 開いている端末を先に入れてから、最終利用の新しい順に2000台まで。
      from friend_profiles p
      order by coalesce(_presence_key(p.device_id)=any(v_keys) or p.device_id::text=any(v_keys),false) desc,p.last_seen desc limit 2000) x),
    'server_now',now());
end $$;

revoke execute on function public._presence_key(uuid) from public,anon,authenticated;
revoke execute on function public.get_admin_dashboard(text[]) from public,anon;
grant execute on function public.get_admin_dashboard(text[]) to authenticated;
notify pgrst,'reload schema';
commit;
