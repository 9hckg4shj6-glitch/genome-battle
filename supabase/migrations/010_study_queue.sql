-- 未着手優先／ランダムの出題・未解答の後回し。正解は解答後だけ公開。
begin;
alter table public.solo_sessions add column if not exists original_ids text[];
alter table public.solo_sessions add column if not exists study_order text not null default 'given' check(study_order in ('given','unattempted','random'));
alter table public.solo_sessions add column if not exists deferred_ids text[] not null default '{}';
update public.solo_sessions set original_ids=q_ids where original_ids is null;
create table if not exists public.study_attempts (
 device_id uuid not null,question_id text not null references public.questions(id) on delete cascade,
 first_answered_at timestamptz not null default now(),last_answered_at timestamptz not null default now(),
 primary key(device_id,question_id)
);
alter table public.study_attempts enable row level security;
-- 中断した学習での解答も含める。未解答・AI対戦は未着手判定を変えない。
insert into public.study_attempts(device_id,question_id,first_answered_at,last_answered_at)
select device_id,old.id,min(created_at),max(created_at) from (
 select s.device_id,h->>'id' as id,s.created_at from solo_sessions s cross join lateral jsonb_array_elements(s.history) h
 where s.mode='study' and h->>'my_choice' is not null
 union all select device_id,q_ids[q_index+1],created_at from solo_sessions where mode='study' and my_choice is not null
) old join questions q on q.id=old.id group by device_id,old.id
on conflict(device_id,question_id) do nothing;
create or replace function public._solo_state(p_session uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id',s.id,'mode',s.mode,'difficulty',s.difficulty,'q_index',s.q_index,
    'study_order',s.study_order,'choice_index',coalesce(array_position(s.original_ids,s.q_ids[s.q_index+1])-1,s.q_index),
    'deferred_count',cardinality(s.deferred_ids),'is_deferred',s.q_ids[s.q_index+1]=any(s.deferred_ids),
    'can_defer',s.mode='study' and s.phase='question' and s.my_choice is null and s.q_index+1<cardinality(s.q_ids),
    'q_total',cardinality(s.q_ids),'q_id',s.q_ids[s.q_index+1], 'phase',s.phase,
    'answer_seconds',s.answer_seconds,'server_now',now(),'version',s.version,
    'phase_ends_at',case when s.mode='ai' and s.phase='question' then s.question_at+make_interval(secs=>s.answer_seconds) end,
    'my_choice',s.my_choice,'my_score',s.my_score,'ai_score',s.ai_score,
    'ai_mark',s.ai_mark,'winner',s.winner,
    'reveal',case when s.phase='reveal' then (select jsonb_build_object('answer',q.answer,'explanation',q.explanation) from questions q where q.id=s.q_ids[s.q_index+1]) end
  ) from solo_sessions s where s.id=p_session
$$;

drop function if exists public.start_solo(uuid,text,text[],int,text);
drop function if exists public.answer_solo(uuid,uuid,int,int);
create or replace function public.start_solo(p_device uuid,p_mode text,p_ids text[],p_seconds int default 20,p_difficulty text default 'normal',p_order text default 'given',p_count int default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_id uuid;v_ids text[];v_count int:=coalesce(p_count,cardinality(p_ids));
begin
  if p_device is null or p_mode is null or p_mode not in ('study','ai') or p_difficulty is null or p_difficulty not in ('easy','normal','hard')
    or p_seconds is null or p_seconds not between 5 and 120 or coalesce(cardinality(p_ids),0) not between 1 and 100
    or p_order is null or p_order not in ('given','random','unattempted') or (p_mode='ai' and p_order<>'given') or v_count not between 1 and cardinality(p_ids)
    or (select count(distinct q.id) from questions q where q.id=any(p_ids)) <> cardinality(p_ids) then
    raise exception 'BAD_SOLO_SETTINGS';
  end if;
  if p_order='given' then v_ids:=p_ids[1:v_count];
  else
    select array_agg(id order by pos) into v_ids from (
      select id,row_number() over(order by case when p_order='unattempted' then exists(select 1 from study_attempts a where a.device_id=p_device and a.question_id=q.id)::int else 0 end,random()) as pos
      from questions q where id=any(p_ids)
    ) picked where pos<=v_count;
  end if;
  delete from solo_sessions where device_id=p_device and created_at < now()-interval '7 days';
  insert into solo_sessions(device_id,mode,difficulty,q_ids,original_ids,study_order,answer_seconds) values(p_device,p_mode,p_difficulty,v_ids,v_ids,p_order,p_seconds) returning id into v_id;
  perform _solo_schedule(v_id);
  return _solo_state(v_id);
end
$$;
create or replace function public.answer_solo(p_session uuid,p_device uuid,p_q_index int,p_choice int,p_q_id text default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare s solo_sessions%rowtype; v_correct boolean;
begin
  select * into s from solo_sessions where id=p_session and device_id=p_device for update;
  if not found then raise exception 'SOLO_NOT_FOUND'; end if;
  if p_choice is null or p_choice not between 0 and 4 then raise exception 'BAD_CHOICE'; end if;
  perform _solo_advance(p_session);
  select * into s from solo_sessions where id=p_session;
  if s.phase='question' and s.q_index=p_q_index and s.my_choice is null and (p_q_id is null or p_q_id=s.q_ids[s.q_index+1]) then
    if s.mode='study' then
      insert into study_attempts(device_id,question_id) values(p_device,s.q_ids[s.q_index+1])
      on conflict(device_id,question_id) do update set last_answered_at=now();
    end if;
    select answer=p_choice into v_correct from questions where id=s.q_ids[s.q_index+1];
    update solo_sessions set my_choice=p_choice,deferred_ids=array_remove(deferred_ids,s.q_ids[s.q_index+1]),
      my_score=my_score+case when v_correct then 1 else 0 end,
      winner=case when v_correct then 'me' end,
      phase=case when mode='study' or v_correct or ai_mark is not null then 'reveal' else 'question' end,
      version=version+1 where id=p_session;
  end if;
  return _solo_state(p_session);
end
$$;
create or replace function public.next_solo(p_session uuid,p_device uuid,p_q_index int) returns jsonb
language plpgsql security definer set search_path=public as $$
declare s solo_sessions%rowtype; v_item jsonb;
begin
  select * into s from solo_sessions where id=p_session and device_id=p_device for update;
  if not found then raise exception 'SOLO_NOT_FOUND'; end if;
  if s.phase='reveal' and s.q_index=p_q_index then
    select jsonb_build_object('id',q.id,'answer',q.answer,'explanation',q.explanation,'my_choice',s.my_choice,'choice_index',coalesce(array_position(s.original_ids,q.id)-1,s.q_index))
    into v_item from questions q where q.id=s.q_ids[s.q_index+1];
    update solo_sessions set history=history || jsonb_build_array(v_item),deferred_ids=array_remove(deferred_ids,s.q_ids[s.q_index+1]),version=version+1 where id=p_session;
    if s.q_index+1 >= cardinality(s.q_ids) or (s.mode='ai' and greatest(s.my_score,s.ai_score)>=5) then
      update solo_sessions set phase='finished' where id=p_session;
    else
      update solo_sessions set q_index=q_index+1,phase='question',question_at=now(),ai_mark=null,my_choice=null,winner=null where id=p_session;
      perform _solo_schedule(p_session);
    end if;
  end if;
  return _solo_state(p_session);
end
$$;

-- 同一問題・バージョンを照合し、二重送信や解答との競合で次の問題を後回しにしない。
create or replace function public.defer_solo(p_session uuid,p_device uuid,p_q_index int,p_q_id text,p_version int) returns jsonb
language plpgsql security definer set search_path=public as $$
declare s solo_sessions%rowtype;v_current text;
begin
 select * into s from solo_sessions where id=p_session and device_id=p_device for update;
 if not found then raise exception 'SOLO_NOT_FOUND'; end if;
 if s.mode<>'study' then raise exception 'STUDY_ONLY'; end if;
 v_current:=s.q_ids[s.q_index+1];
 if s.phase='question' and s.my_choice is null and s.q_index=p_q_index and v_current=p_q_id and s.version=p_version and s.q_index+1<cardinality(s.q_ids) then
   update solo_sessions set q_ids=coalesce(q_ids[1:s.q_index],'{}'::text[]) || q_ids[s.q_index+2:cardinality(q_ids)] || array[v_current],
     deferred_ids=case when v_current=any(deferred_ids) then deferred_ids else deferred_ids || array[v_current] end,
     version=version+1 where id=p_session;
 end if;
 return _solo_state(p_session);
end $$;
create or replace function public.get_study_progress(p_device uuid) returns jsonb
language sql stable security definer set search_path=public as $$
 select jsonb_build_object('attempted_ids',coalesce((select jsonb_agg(question_id order by question_id) from study_attempts where device_id=p_device),'[]'::jsonb),'server_now',now())
$$;
revoke execute on function public.start_solo(uuid,text,text[],int,text,text,int),public.answer_solo(uuid,uuid,int,int,text),public.defer_solo(uuid,uuid,int,text,int),public.get_study_progress(uuid) from public;
grant execute on function public.start_solo(uuid,text,text[],int,text,text,int),public.answer_solo(uuid,uuid,int,int,text),public.defer_solo(uuid,uuid,int,text,int),public.get_study_progress(uuid) to anon,authenticated;
notify pgrst,'reload schema';
commit;
