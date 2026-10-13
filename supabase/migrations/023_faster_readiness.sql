-- 試験準備度を1週間の追い込みに合う速さにする（017の続き）。
-- これまで：直近2回連続で正解＝習得、3回連続＝定着。初見で正解した問題も、もう一度解くまで準備度に入らなかった。
-- これから：一度も間違えて（回答を見て）いない問題は、正解1回で習得・2回連続で定着。
--           間違えた・回答を見たことのある問題は、これまでどおり2回連続で習得・3回連続で定着。
-- 運よく当たった問題は「迷った」を付ければ、これまでどおりクライアントで習得から外す。
-- ready_today：今日（日本時間）の解答で、新たに習得以上になった問題。「今日 +N問」の表示用。
-- XPの計算は017と同じ。
begin;
create or replace function public.get_mastery(p_device uuid,p_session uuid default null) returns jsonb
language sql stable security definer set search_path=public as $$
  with r as (
    select session_id,question_id,answered_at,correct and not answer_viewed as ok,answer_viewed,
      (answered_at at time zone 'Asia/Tokyo')::date=(now() at time zone 'Asia/Tokyo')::date as today,
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
    -- 末尾から続く正解の数と、間違えた・回答を見たことがあるか。昨日までの記録だけで見た値も出す。
    -- 今日の解答は末尾にまとまっているので、昨日までの連続正解は今日の件数を引いて求める。
    select question_id,
      coalesce(min(back) filter(where not ok),count(*)+1)-1 as streak,
      bool_or(not ok) as missed,
      count(*) filter(where not today) as n_before,
      coalesce(min(back) filter(where not ok and not today),count(*)+1)-1-count(*) filter(where today) as streak_before,
      coalesce(bool_or(not ok and not today),false) as missed_before
    from r group by question_id
  ), s as (
    select question_id,
      case when streak>=2+missed::int then 'settled' when streak>=1+missed::int then 'mastered' else 'learning' end as state,
      streak>=1+missed::int and not (n_before>0 and streak_before>=1+missed_before::int) as ready_today
    from q
  )
  select jsonb_build_object(
    'xp',(select coalesce(sum(xp),0) from x),
    'xp_today',(select coalesce(sum(xp),0) from x where today),
    'session_xp',case when p_session is not null then (select coalesce(sum(xp),0) from x where session_id=p_session) end,
    'states',(select coalesce(jsonb_object_agg(question_id,state),'{}'::jsonb) from s),
    'ready_today',(select coalesce(jsonb_agg(question_id order by question_id),'[]'::jsonb) from s where ready_today),
    'server_now',now())
$$;

revoke execute on function public.get_mastery(uuid,uuid) from public;
grant execute on function public.get_mastery(uuid,uuid) to anon,authenticated;
notify pgrst,'reload schema';
commit;
