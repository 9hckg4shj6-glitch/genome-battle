-- 一人学習でわからない場合、得点なしで正答・解説を確認し、復習対象として保持する。
begin;
alter table public.solo_sessions add column if not exists answer_viewed boolean not null default false;
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
    'ai_mark',s.ai_mark,'winner',s.winner,'answer_viewed',s.answer_viewed,
    'reveal',case when s.phase='reveal' then (select jsonb_build_object('answer',q.answer,'explanation',q.explanation) from questions q where q.id=s.q_ids[s.q_index+1]) end
  ) from solo_sessions s where s.id=p_session
$$;

create or replace function public.next_solo(p_session uuid,p_device uuid,p_q_index int) returns jsonb
language plpgsql security definer set search_path=public as $$
declare s solo_sessions%rowtype; v_item jsonb;
begin
  select * into s from solo_sessions where id=p_session and device_id=p_device for update;
  if not found then raise exception 'SOLO_NOT_FOUND'; end if;
  if s.phase='reveal' and s.q_index=p_q_index then
    select jsonb_build_object('id',q.id,'answer',q.answer,'explanation',q.explanation,'my_choice',s.my_choice,'answer_viewed',s.answer_viewed,'choice_index',coalesce(array_position(s.original_ids,q.id)-1,s.q_index))
    into v_item from questions q where q.id=s.q_ids[s.q_index+1];
    update solo_sessions set history=history || jsonb_build_array(v_item),deferred_ids=array_remove(deferred_ids,s.q_ids[s.q_index+1]),version=version+1 where id=p_session;
    if s.q_index+1 >= cardinality(s.q_ids) or (s.mode='ai' and greatest(s.my_score,s.ai_score)>=5) then
      update solo_sessions set phase='finished' where id=p_session;
    else
      update solo_sessions set q_index=q_index+1,phase='question',question_at=now(),ai_mark=null,my_choice=null,winner=null,answer_viewed=false where id=p_session;
      perform _solo_schedule(p_session);
    end if;
  end if;
  return _solo_state(p_session);
end
$$;

-- 問題・バージョンを照合し、後回し・解答と競合しても別の問題の回答を公開しない。
create or replace function public.view_solo_answer(p_session uuid,p_device uuid,p_q_index int,p_q_id text,p_version int) returns jsonb
language plpgsql security definer set search_path=public as $$
declare s solo_sessions%rowtype;
begin
 select * into s from solo_sessions where id=p_session and device_id=p_device for update;
 if not found then raise exception 'SOLO_NOT_FOUND'; end if;
 if s.mode<>'study' then raise exception 'STUDY_ONLY'; end if;
 if s.phase='question' and s.my_choice is null and s.q_index=p_q_index and s.q_ids[s.q_index+1]=p_q_id and s.version=p_version then
   insert into study_attempts(device_id,question_id) values(p_device,p_q_id)
   on conflict(device_id,question_id) do update set last_answered_at=now();
   -- 選択肢は選ばず、得点を与えない。正答・解説は reveal で初めて返す。
   update solo_sessions set phase='reveal',answer_viewed=true,winner=null,
     deferred_ids=array_remove(deferred_ids,p_q_id),version=version+1 where id=p_session;
 end if;
 return _solo_state(p_session);
end $$;
revoke execute on function public.view_solo_answer(uuid,uuid,int,text,int) from public;
grant execute on function public.view_solo_answer(uuid,uuid,int,text,int) to anon,authenticated;
notify pgrst,'reload schema';
commit;
