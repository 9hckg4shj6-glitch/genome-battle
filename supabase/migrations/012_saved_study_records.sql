-- 中断・再開と、未完了の学習を含む問題ごとの永続記録。
begin;
alter table public.solo_sessions add column if not exists updated_at timestamptz;
update public.solo_sessions set updated_at=created_at where updated_at is null;
alter table public.solo_sessions alter column updated_at set default now();
alter table public.solo_sessions alter column updated_at set not null;

-- セッションが整理されても取り組んだ問題数と完了回数を保持する。
create table if not exists public.study_answer_records (
  session_id uuid not null, question_id text not null, device_id uuid not null,
  correct boolean not null, answer_viewed boolean not null default false,
  answered_at timestamptz not null default now(), primary key(session_id,question_id)
);
create index if not exists study_answer_device on public.study_answer_records(device_id);
alter table public.study_answer_records enable row level security;
create table if not exists public.study_completions (
  session_id uuid primary key, device_id uuid not null,
  completed_at timestamptz not null default now()
);
create index if not exists study_completion_device on public.study_completions(device_id);
alter table public.study_completions enable row level security;

-- 既存履歴と「次へ」を押す前の解答を移行。完了済みの最終問題は履歴と重ねない。
insert into public.study_answer_records(session_id,question_id,device_id,correct,answer_viewed,answered_at)
select s.id,h->>'id',s.device_id,coalesce((h->>'my_choice')::int=(h->>'answer')::int,false),
  coalesce((h->>'answer_viewed')::boolean,false),s.created_at
from public.solo_sessions s cross join lateral jsonb_array_elements(s.history) h
where s.mode='study' on conflict(session_id,question_id) do nothing;
insert into public.study_answer_records(session_id,question_id,device_id,correct,answer_viewed,answered_at)
select s.id,q.id,s.device_id,coalesce(s.my_choice=q.answer,false),s.answer_viewed,s.created_at
from public.solo_sessions s join public.questions q on q.id=s.q_ids[s.q_index+1]
where s.mode='study' and s.phase='reveal' and (s.my_choice is not null or s.answer_viewed)
on conflict(session_id,question_id) do nothing;
insert into public.study_completions(session_id,device_id,completed_at)
select id,device_id,created_at from public.solo_sessions where mode='study' and phase='finished'
on conflict(session_id) do nothing;

create or replace function public._touch_solo_session() returns trigger
language plpgsql security definer set search_path=public as $$
begin new.updated_at:=now(); return new; end $$;
drop trigger if exists touch_solo_session on public.solo_sessions;
create trigger touch_solo_session before update on public.solo_sessions
for each row execute function public._touch_solo_session();

-- 判定と同じトランザクションで記録する。再送・再開・次へで二重加算しない。
create or replace function public._record_study_answer() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.mode='study' then
    if new.phase='reveal' and (new.my_choice is not null or new.answer_viewed) then
      insert into study_answer_records(session_id,question_id,device_id,correct,answer_viewed)
      select new.id,q.id,new.device_id,coalesce(new.my_choice=q.answer,false),new.answer_viewed
      from questions q where q.id=new.q_ids[new.q_index+1]
      on conflict(session_id,question_id) do nothing;
    end if;
    if new.phase='finished' then
      insert into study_completions(session_id,device_id) values(new.id,new.device_id)
      on conflict(session_id) do nothing;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists record_study_answer on public.solo_sessions;
create trigger record_study_answer after insert or update on public.solo_sessions
for each row execute function public._record_study_answer();

create or replace function public.save_study(p_session uuid,p_device uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare s solo_sessions%rowtype;
begin
  select * into s from solo_sessions where id=p_session and device_id=p_device for update;
  if not found then raise exception 'SOLO_NOT_FOUND'; end if;
  if s.mode<>'study' then raise exception 'STUDY_ONLY'; end if;
  update solo_sessions set version=version+1 where id=p_session;
  return _solo_state(p_session);
end $$;

-- 所有端末の未完了分のみ。答え・履歴・未出題の問題順は返さない。
create or replace function public.list_saved_studies(p_device uuid) returns jsonb
language sql stable security definer set search_path=public as $$
select coalesce(jsonb_agg(item order by updated_at desc,id),'[]'::jsonb) from (
 select s.id,s.updated_at,jsonb_build_object(
  'id',s.id,'q_total',cardinality(s.q_ids),'phase',s.phase,'updated_at',s.updated_at,
  'answered',jsonb_array_length(s.history)+case when s.phase='reveal' then 1 else 0 end,
  'field',(select case when count(distinct q.field)=1 then min(q.field) else '分野混合' end from questions q where q.id=any(s.q_ids))
 ) as item from solo_sessions s where s.device_id=p_device and s.mode='study' and s.phase<>'finished'
) saved
$$;

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
  -- 未完了の一人学習は期限で消さない。学習成績は独立した記録に保持する。
  delete from solo_sessions where device_id=p_device and created_at < now()-interval '7 days' and (mode='ai' or phase='finished');
  insert into solo_sessions(device_id,mode,difficulty,q_ids,original_ids,study_order,answer_seconds) values(p_device,p_mode,p_difficulty,v_ids,v_ids,p_order,p_seconds) returning id into v_id;
  perform _solo_schedule(v_id);
  return _solo_state(v_id);
end
$$;

create or replace function public.get_performance(p_device uuid) returns jsonb
language sql stable security definer set search_path=public as $$
  with study as (
    select (select count(*) from study_completions where device_id=p_device) as sessions,
      count(*) as answered,count(*) filter(where correct) as correct,
      count(*) filter(where answer_viewed) as viewed
    from study_answer_records where device_id=p_device
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

revoke execute on function public._touch_solo_session(),public._record_study_answer() from public,anon,authenticated;
revoke execute on function public.save_study(uuid,uuid),public.list_saved_studies(uuid) from public;
grant execute on function public.save_study(uuid,uuid),public.list_saved_studies(uuid) to anon,authenticated;
notify pgrst,'reload schema';
commit;
