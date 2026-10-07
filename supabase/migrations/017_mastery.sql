-- 学習レベル（XP）と問題ごとの習得状態。一人学習・復習の永続記録（study_answer_records）だけから計算する。
-- 対戦の記録は1日・7日で整理されるため含めない（XPが後から減らないように）。
-- XP：正解10・誤答3・回答を見た1。同じ問題を同じ日（日本時間）に再び解いた分は半分（切り捨て）。
--     問題ごとに一度だけ、最初の正解に +10（初めての解答で正解）または +15（以前の誤答・回答確認からの克服）。
-- 状態：learning＝取り組み中、mastered＝直近2回連続で正解、settled＝直近3回以上連続で正解。
--       記録のない問題は返さない（未着手）。「迷った」は端末保存のため、クライアントで扱う。
-- p_session を渡すと、その学習・復習コースで得たXP（session_xp）も返す。結果画面の表示用。
begin;
create index if not exists study_answer_device_question
  on public.study_answer_records(device_id,question_id,answered_at);

drop function if exists public.get_mastery(uuid);
create or replace function public.get_mastery(p_device uuid,p_session uuid default null) returns jsonb
language sql stable security definer set search_path=public as $$
  with r as (
    select session_id,question_id,answered_at,correct and not answer_viewed as ok,answer_viewed,
      row_number() over w as nth,
      row_number() over (partition by question_id order by answered_at desc,session_id desc) as back,
      row_number() over (partition by question_id,(answered_at at time zone 'Asia/Tokyo')::date order by answered_at,session_id) as nth_day,
      count(*) filter(where correct and not answer_viewed) over (w rows between unbounded preceding and 1 preceding) as prior_ok
    from study_answer_records where device_id=p_device
    window w as (partition by question_id order by answered_at,session_id)
  ), x as (
    select *,
      (case when answer_viewed then 1 when ok then 10 else 3 end) / (case when nth_day>1 then 2 else 1 end)
      + case when ok and prior_ok=0 then case when nth=1 then 10 else 15 end else 0 end as xp
    from r
  ), q as (
    -- 末尾から続く正解の数
    select question_id,coalesce(min(back) filter(where not ok),count(*)+1)-1 as streak
    from r group by question_id
  ), s as (
    select q.question_id,case when q.streak>=3 then 'settled' when q.streak>=2 then 'mastered' else 'learning' end as state
    from q
  )
  select jsonb_build_object(
    'xp',(select coalesce(sum(xp),0) from x),
    'xp_today',(select coalesce(sum(xp),0) from x where (answered_at at time zone 'Asia/Tokyo')::date=(now() at time zone 'Asia/Tokyo')::date),
    'session_xp',case when p_session is not null then (select coalesce(sum(xp),0) from x where session_id=p_session) end,
    'states',(select coalesce(jsonb_object_agg(question_id,state),'{}'::jsonb) from s),
    'server_now',now())
$$;

revoke execute on function public.get_mastery(uuid,uuid) from public;
grant execute on function public.get_mastery(uuid,uuid) to anon,authenticated;
notify pgrst,'reload schema';
commit;
