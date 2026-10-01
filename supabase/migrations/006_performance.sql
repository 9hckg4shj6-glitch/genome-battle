-- 学習の正答率と早押し対戦の勝敗・得点を、完了済みデータから別々に集計する。
begin;
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
      and (m.q_index>0 or exists(select 1 from attempts a where a.match_id=m.id))
  ), human as (
    select count(*) as matches,count(*) filter(where score=top_score and same_score=1) as wins,
      count(*) filter(where score=top_score and same_score>1) as draws,coalesce(sum(score),0) as points
    from human_results
  )
  select jsonb_build_object('study',to_jsonb(study),'ai',to_jsonb(ai),'human',to_jsonb(human),'server_now',now())
  from study,ai,human
$$;
revoke execute on function public.get_performance(uuid) from public;
grant execute on function public.get_performance(uuid) to anon,authenticated;
notify pgrst,'reload schema';
commit;
