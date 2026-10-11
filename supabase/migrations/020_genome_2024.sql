-- 2024年度の100問を追加（計200問）。問題の登録は seed.generated.sql（scripts/import-questions.mjs で再生成）。
-- 一人学習は「すべての分野」で全問題のIDを渡すため、渡せるIDの上限100を外す。
-- 重複・未登録のIDは従来どおり拒否するので、上限は登録済みの問題数になる。
begin;
create or replace function public.start_solo(p_device uuid,p_mode text,p_ids text[],p_seconds int default 20,p_difficulty text default 'normal',p_order text default 'given',p_count int default null,p_distribution text default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_id uuid;v_ids text[];v_count int:=coalesce(p_count,cardinality(p_ids));
  v_caps jsonb;v_quotas jsonb:='{}'::jsonb;v_field text;v_distribution text;
begin
  if p_device is null or p_mode is null or p_mode not in ('study','ai') or p_difficulty is null or p_difficulty not in ('easy','normal','hard')
    or p_seconds is null or p_seconds not between 5 and 120 or coalesce(cardinality(p_ids),0) < 1
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
commit;
