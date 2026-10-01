-- 一人学習とAI対戦。正解・AIの予定はサーバだけが保持する。
begin;
create table if not exists public.solo_sessions (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null,
  mode text not null check (mode in ('study','ai')),
  difficulty text not null check (difficulty in ('easy','normal','hard')),
  q_ids text[] not null,
  q_index int not null default 0,
  phase text not null default 'question' check (phase in ('question','reveal','finished')),
  answer_seconds int not null check (answer_seconds between 5 and 120),
  question_at timestamptz not null default now(),
  ai_due_at timestamptz,
  ai_correct boolean,
  ai_mark text check (ai_mark in ('o','x')),
  my_choice int,
  my_score int not null default 0,
  ai_score int not null default 0,
  winner text check (winner in ('me','ai')),
  history jsonb not null default '[]'::jsonb,
  version int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.solo_sessions enable row level security;
create index if not exists solo_device_created on public.solo_sessions(device_id, created_at);

create or replace function public._solo_state(p_session uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id',s.id,'mode',s.mode,'difficulty',s.difficulty,'q_index',s.q_index,
    'q_total',cardinality(s.q_ids),'q_id',s.q_ids[s.q_index+1], 'phase',s.phase,
    'answer_seconds',s.answer_seconds,'server_now',now(),'version',s.version,
    'phase_ends_at',case when s.mode='ai' and s.phase='question' then s.question_at+make_interval(secs=>s.answer_seconds) end,
    'my_choice',s.my_choice,'my_score',s.my_score,'ai_score',s.ai_score,
    'ai_mark',s.ai_mark,'winner',s.winner,
    'reveal',case when s.phase='reveal' then (select jsonb_build_object('answer',q.answer,'explanation',q.explanation) from questions q where q.id=s.q_ids[s.q_index+1]) end
  ) from solo_sessions s where s.id=p_session
$$;

create or replace function public._solo_schedule(p_session uuid) returns void
language sql volatile security definer set search_path = public as $$
  update solo_sessions set
    ai_due_at=case when mode='ai' then question_at + make_interval(secs => answer_seconds *
      case difficulty when 'easy' then 0.55+random()*0.3 when 'normal' then 0.3+random()*0.3 else 0.15+random()*0.25 end) end,
    ai_correct=case when mode='ai' then random() < case difficulty when 'easy' then 0.45 when 'normal' then 0.7 else 0.9 end end
  where id=p_session
$$;

-- 呼び出し元で行ロックを取得。時間切れやAIの解答を冪等に反映する。
create or replace function public._solo_advance(p_session uuid) returns void
language plpgsql security definer set search_path=public as $$
declare s solo_sessions%rowtype;
begin
  select * into s from solo_sessions where id=p_session;
  if s.phase <> 'question' or s.mode <> 'ai' then return; end if;
  if now() >= s.ai_due_at and s.ai_mark is null then
    update solo_sessions set ai_mark=case when ai_correct then 'o' else 'x' end,
      ai_score=ai_score+case when ai_correct then 1 else 0 end,
      winner=case when ai_correct then 'ai' end,
      phase=case when ai_correct or my_choice is not null then 'reveal' else 'question' end,
      version=version+1 where id=p_session;
  end if;
  update solo_sessions set phase='reveal',version=version+1 where id=p_session and phase='question'
    and now() >= question_at+make_interval(secs=>answer_seconds);
end
$$;

create or replace function public.start_solo(p_device uuid,p_mode text,p_ids text[],p_seconds int default 20,p_difficulty text default 'normal') returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if p_device is null or p_mode is null or p_mode not in ('study','ai') or p_difficulty is null or p_difficulty not in ('easy','normal','hard')
    or p_seconds is null or p_seconds not between 5 and 120 or coalesce(cardinality(p_ids),0) not between 1 and 100
    or (select count(distinct q.id) from questions q where q.id=any(p_ids)) <> cardinality(p_ids) then
    raise exception 'BAD_SOLO_SETTINGS';
  end if;
  delete from solo_sessions where device_id=p_device and created_at < now()-interval '7 days';
  insert into solo_sessions(device_id,mode,difficulty,q_ids,answer_seconds) values(p_device,p_mode,p_difficulty,p_ids,p_seconds) returning id into v_id;
  perform _solo_schedule(v_id);
  return _solo_state(v_id);
end
$$;

create or replace function public.get_solo(p_session uuid,p_device uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
  perform 1 from solo_sessions where id=p_session and device_id=p_device for update;
  if not found then raise exception 'SOLO_NOT_FOUND'; end if;
  perform _solo_advance(p_session);
  return _solo_state(p_session);
end
$$;

create or replace function public.answer_solo(p_session uuid,p_device uuid,p_q_index int,p_choice int) returns jsonb
language plpgsql security definer set search_path=public as $$
declare s solo_sessions%rowtype; v_correct boolean;
begin
  select * into s from solo_sessions where id=p_session and device_id=p_device for update;
  if not found then raise exception 'SOLO_NOT_FOUND'; end if;
  if p_choice is null or p_choice not between 0 and 4 then raise exception 'BAD_CHOICE'; end if;
  perform _solo_advance(p_session);
  select * into s from solo_sessions where id=p_session;
  if s.phase='question' and s.q_index=p_q_index and s.my_choice is null then
    select answer=p_choice into v_correct from questions where id=s.q_ids[s.q_index+1];
    update solo_sessions set my_choice=p_choice,
      my_score=my_score+case when v_correct then 1 else 0 end,
      winner=case when v_correct then 'me' end,
      phase=case when mode='study' or v_correct or ai_mark is not null then 'reveal' else 'question' end,
      version=version+1 where id=p_session;
  end if;
  return _solo_state(p_session);
end
$$;

-- 次へは現在の問題番号を渡す。二重送信で2問進まない。
create or replace function public.next_solo(p_session uuid,p_device uuid,p_q_index int) returns jsonb
language plpgsql security definer set search_path=public as $$
declare s solo_sessions%rowtype; v_item jsonb;
begin
  select * into s from solo_sessions where id=p_session and device_id=p_device for update;
  if not found then raise exception 'SOLO_NOT_FOUND'; end if;
  if s.phase='reveal' and s.q_index=p_q_index then
    select jsonb_build_object('id',q.id,'answer',q.answer,'explanation',q.explanation,'my_choice',s.my_choice)
    into v_item from questions q where q.id=s.q_ids[s.q_index+1];
    update solo_sessions set history=history || jsonb_build_array(v_item),version=version+1 where id=p_session;
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

create or replace function public.review_solo(p_session uuid,p_device uuid) returns jsonb
language sql stable security definer set search_path=public as $$
  select history from solo_sessions where id=p_session and device_id=p_device and phase='finished'
$$;

revoke execute on function public._solo_state(uuid),public._solo_schedule(uuid),public._solo_advance(uuid) from public,anon,authenticated;
revoke execute on function public.start_solo(uuid,text,text[],int,text),public.get_solo(uuid,uuid),public.answer_solo(uuid,uuid,int,int),public.next_solo(uuid,uuid,int),public.review_solo(uuid,uuid) from public;
grant execute on function public.start_solo(uuid,text,text[],int,text),public.get_solo(uuid,uuid),public.answer_solo(uuid,uuid,int,int),public.next_solo(uuid,uuid,int),public.review_solo(uuid,uuid) to anon,authenticated;
notify pgrst,'reload schema';
commit;
