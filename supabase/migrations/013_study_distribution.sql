-- 一人学習の過去問配分／分野均等。中断したセッションの設定と問題順を保持。
begin;
alter table public.solo_sessions add column if not exists study_distribution text
  check(study_distribution in ('exam','even'));
-- デフォルト付きの旧関数を残すとPostgRESTが解決できないため、互換引数の新関数へ置換。
drop function public.start_solo(uuid,text,text[],int,text,text,int);
create or replace function public.start_solo(p_device uuid,p_mode text,p_ids text[],p_seconds int default 20,p_difficulty text default 'normal',p_order text default 'given',p_count int default null,p_distribution text default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_id uuid;v_ids text[];v_count int:=coalesce(p_count,cardinality(p_ids));
  v_caps jsonb;v_quotas jsonb:='{}'::jsonb;v_field text;v_distribution text;
begin
  if p_device is null or p_mode is null or p_mode not in ('study','ai') or p_difficulty is null or p_difficulty not in ('easy','normal','hard')
    or p_seconds is null or p_seconds not between 5 and 120 or coalesce(cardinality(p_ids),0) not between 1 and 100
    or p_order is null or p_order not in ('given','random','unattempted') or (p_mode='ai' and p_order<>'given') or v_count not between 1 and cardinality(p_ids)
    or (p_distribution is not null and p_distribution not in ('exam','even'))
    or (p_distribution='even' and (p_mode<>'study' or p_order='given'))
    or (select count(distinct q.id) from questions q where q.id=any(p_ids)) <> cardinality(p_ids) then
    raise exception 'BAD_SOLO_SETTINGS';
  end if;
  if p_order='given' then v_ids:=p_ids[1:v_count];
  elsif p_distribution='even' then
    select jsonb_object_agg(field,n) into v_caps from (
      select field,count(*)::int as n from questions where id=any(p_ids) group by field
    ) sizes;
    -- 最も割当の少ない分野へ1問ずつ。枯渇した分野を除き、端数はランダムに割り当てる。
    for i in 1..v_count loop
      select key into v_field from jsonb_each_text(v_caps)
      where coalesce((v_quotas->>key)::int,0)<value::int
      order by coalesce((v_quotas->>key)::int,0),random() limit 1;
      v_quotas:=jsonb_set(v_quotas,array[v_field],to_jsonb(coalesce((v_quotas->>v_field)::int,0)+1));
    end loop;
    -- 配分を確保してから分野内で未着手を優先。出題順は全分野を混ぜる。
    select array_agg(id order by random()) into v_ids from (
      select q.id,q.field,row_number() over(partition by q.field order by
        case when p_order='unattempted' then exists(select 1 from study_attempts a where a.device_id=p_device and a.question_id=q.id)::int else 0 end,random()) as pos
      from questions q where q.id=any(p_ids)
    ) ranked where pos<=coalesce((v_quotas->>field)::int,0);
  else
    select array_agg(id order by pos) into v_ids from (
      select id,row_number() over(order by case when p_order='unattempted' then exists(select 1 from study_attempts a where a.device_id=p_device and a.question_id=q.id)::int else 0 end,random()) as pos
      from questions q where id=any(p_ids)
    ) picked where pos<=v_count;
  end if;
  v_distribution:=case when p_mode='study' and p_order<>'given'
    and (select count(distinct field) from questions where id=any(p_ids))>1
    then coalesce(p_distribution,'exam') end;
  -- 未完了の一人学習は期限で消さない。学習成績は独立した記録に保持する。
  delete from solo_sessions where device_id=p_device and created_at < now()-interval '7 days' and (mode='ai' or phase='finished');
  insert into solo_sessions(device_id,mode,difficulty,q_ids,original_ids,study_order,answer_seconds,study_distribution) values(p_device,p_mode,p_difficulty,v_ids,v_ids,p_order,p_seconds,v_distribution) returning id into v_id;
  perform _solo_schedule(v_id);
  return _solo_state(v_id);
end
$$;


create or replace function public._solo_state(p_session uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id',s.id,'mode',s.mode,'difficulty',s.difficulty,'q_index',s.q_index,
    'study_order',s.study_order,'study_distribution',s.study_distribution,'choice_index',coalesce(array_position(s.original_ids,s.q_ids[s.q_index+1])-1,s.q_index),
    'deferred_count',cardinality(s.deferred_ids),'is_deferred',s.q_ids[s.q_index+1]=any(s.deferred_ids),
    'can_defer',s.mode='study' and s.phase='question' and s.my_choice is null and s.q_index+1<cardinality(s.q_ids),
    'q_total',cardinality(s.q_ids),'q_id',s.q_ids[s.q_index+1], 'phase',s.phase,
    'answer_seconds',s.answer_seconds,'server_now',now(),'version',s.version,
    'phase_ends_at',case when s.mode='ai' and s.phase='question' then s.question_at+make_interval(secs=>s.answer_seconds) end,
    'my_choice',s.my_choice,'my_score',s.my_score,'ai_score',s.ai_score,
    'ai_mark',s.ai_mark,'winner',s.winner,'answer_viewed',s.answer_viewed,
    'reveal',case when s.phase='reveal' then (select jsonb_build_object('answer',q.answer,'explanation',q.explanation) from questions q where q.id=s.q_ids[s.q_index+1]) end
  ) from solo_sessions s where s.id=p_session
$$;


create or replace function public.list_saved_studies(p_device uuid) returns jsonb
language sql stable security definer set search_path=public as $$
select coalesce(jsonb_agg(item order by updated_at desc,id),'[]'::jsonb) from (
 select s.id,s.updated_at,jsonb_build_object(
  'id',s.id,'study_distribution',s.study_distribution,'q_total',cardinality(s.q_ids),'phase',s.phase,'updated_at',s.updated_at,
  'answered',jsonb_array_length(s.history)+case when s.phase='reveal' then 1 else 0 end,
  'field',(select case when count(distinct q.field)=1 then min(q.field) else '分野混合' end from questions q where q.id=any(s.q_ids))
 ) as item from solo_sessions s where s.device_id=p_device and s.mode='study' and s.phase<>'finished'
) saved
$$;


revoke execute on function public.start_solo(uuid,text,text[],int,text,text,int,text) from public;
grant execute on function public.start_solo(uuid,text,text[],int,text,text,int,text) to anon,authenticated;
notify pgrst,'reload schema';
commit;
