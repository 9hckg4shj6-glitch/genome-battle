-- 管理画面（admin.html）。オンライン人数・利用状況・最大同時人数・利用者の名前一覧を、管理者だけに返す。
-- 管理者は Supabase Auth（メールアドレス＋パスワード、メール確認済み）でログインし、admin_users に載ったメールだけが通る。
-- admin_users の行はこのファイルに書かず、SQLで直接入れる（公開リポジトリにメールアドレスを載せないため）：
--   insert into public.admin_users(email) values('<管理者のメールアドレス（小文字）>');
-- 画面のプログラムは公開されているので、ページを見つけられてもサーバーが管理者以外にはデータを返さないことで守る。
-- 最大同時人数：アプリが30秒ごとに送る connection_ping のついでに、その1分の人数がまだ記録されていなければ1行だけ記録する。
--   誰も開いていない時間は記録がない（0人として扱う）。60日より前の記録は消す。
begin;
create table if not exists public.admin_users (email text primary key check (email=lower(email)));
alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon,authenticated;

-- 初めて来た日。既存の端末は、最終利用・初回解答・学習記録のうち最も古い時刻で埋める。
alter table public.friend_profiles add column if not exists first_seen timestamptz;
update public.friend_profiles p set first_seen=least(p.last_seen,
  (select min(answered_at) from public.question_first_answers f where f.device_id=p.device_id),
  (select min(answered_at) from public.study_answer_records r where r.device_id=p.device_id))
where first_seen is null;
alter table public.friend_profiles alter column first_seen set default now();
create index if not exists friend_profiles_last_seen on public.friend_profiles(last_seen desc);

create table if not exists public.online_samples (
  at timestamptz primary key,
  online int not null, studying int not null, ai int not null, battle int not null
);
alter table public.online_samples enable row level security;
revoke all on public.online_samples from anon,authenticated;

-- いまの人数。オンライン＝直近90秒にアプリを表示していた端末（フレンド更新が30秒ごと）。
-- 学習中・AI対戦中は直近の操作がある未終了のセッション、対人戦は待機・対戦中の部屋で直近1分に応答した参加者。
create or replace function public._online_now() returns jsonb
language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'online',(select count(*) from friend_profiles where last_seen>now()-interval '90 seconds'),
    'studying',(select count(distinct device_id) from solo_sessions where mode='study' and phase<>'finished' and updated_at>now()-interval '3 minutes'),
    'ai',(select count(distinct device_id) from solo_sessions where mode='ai' and phase<>'finished' and updated_at>now()-interval '2 minutes'),
    'battle',(select count(distinct p.device_id) from players p join matches m on m.id=p.match_id
      where m.status in ('waiting','playing') and p.last_seen>now()-interval '1 minute'))
$$;

-- 接続確認（007）に、1分に1行の人数記録を足す。記録済みの分は主キーを1回引くだけ。失敗しても接続確認は返す。
create or replace function public.connection_ping() returns jsonb
language plpgsql volatile security definer set search_path=public as $$
declare v_at timestamptz:=date_trunc('minute',now());v_now jsonb;
begin
  if not exists(select 1 from online_samples where at=v_at) then
    begin
      v_now:=_online_now();
      insert into online_samples(at,online,studying,ai,battle)
      values(v_at,(v_now->>'online')::int,(v_now->>'studying')::int,(v_now->>'ai')::int,(v_now->>'battle')::int)
      on conflict do nothing;
      delete from online_samples where at<now()-interval '60 days';
    exception when others then null;
    end;
  end if;
  return jsonb_build_object('server_now',now());
end $$;

create or replace function public._is_admin() returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from auth.users u join public.admin_users a on a.email=lower(u.email)
    where u.id=auth.uid() and u.email_confirmed_at is not null)
$$;

create or replace function public.get_admin_dashboard() returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare
  v_today timestamptz:=((now() at time zone 'Asia/Tokyo')::date)::timestamp at time zone 'Asia/Tokyo';
begin
  if not _is_admin() then raise exception 'ADMIN_ONLY'; end if;
  return jsonb_build_object(
    'now',_online_now(),
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
    'users',(select coalesce(jsonb_agg(u order by (u->>'last_seen')::timestamptz desc),'[]'::jsonb) from (
      select jsonb_build_object(
        'name',p.name,'code',p.code,'last_seen',p.last_seen,'first_seen',p.first_seen,
        'online',p.last_seen>now()-interval '90 seconds',
        'activity',case
          when exists(select 1 from players pl join matches m on m.id=pl.match_id where pl.device_id=p.device_id and m.status in ('waiting','playing') and pl.last_seen>now()-interval '1 minute') then 'battle'
          when exists(select 1 from solo_sessions s where s.device_id=p.device_id and s.mode='ai' and s.phase<>'finished' and s.updated_at>now()-interval '2 minutes') then 'ai'
          when exists(select 1 from solo_sessions s where s.device_id=p.device_id and s.mode='study' and s.phase<>'finished' and s.updated_at>now()-interval '3 minutes') then 'study'
        end,
        'answers',(select count(*) from study_answer_records r where r.device_id=p.device_id),
        'answers_today',(select count(*) from study_answer_records r where r.device_id=p.device_id and r.answered_at>=v_today),
        'questions',(select count(distinct question_id) from study_answer_records r where r.device_id=p.device_id)) as u
      from friend_profiles p order by p.last_seen desc limit 2000) x),
    'server_now',now());
end $$;

revoke execute on function public._online_now(),public._is_admin() from public,anon,authenticated;
revoke execute on function public.get_admin_dashboard() from public,anon;
grant execute on function public.get_admin_dashboard() to authenticated;
revoke execute on function public.connection_ping() from public;
grant execute on function public.connection_ping() to anon,authenticated;
notify pgrst,'reload schema';
commit;
