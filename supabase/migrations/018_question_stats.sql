-- みんなの正答率。端末ごとに「その問題に初めて答えたときの正誤」を1件だけ残し、問題ごとに集計する。
-- 同じ人が繰り返し解いても率が上がらないよう初回だけ数える（初見での難しさを表す）。
-- 一人学習・復習・AI対戦・対人対戦のすべてが対象。対戦・セッションは数日で整理されるが、この記録は残す。
-- 回答を見た（解答せずに正答を確認）は、分からなかった問題として不正解に数える（学習成績と同じ扱い）。
-- 集計は解答の後に付け足すだけで、失敗しても解答・進行は止めない。
begin;
create table if not exists public.question_first_answers (
  question_id text not null references public.questions(id) on delete cascade,
  device_id uuid not null,
  correct boolean not null,
  answered_at timestamptz not null default now(),
  primary key (question_id, device_id)
);
create index if not exists question_first_answers_device on public.question_first_answers(device_id);
alter table public.question_first_answers enable row level security;

-- 既存の記録から初回分を移す（学習の永続記録・まだ残っている対戦・AI対戦の履歴）。
insert into public.question_first_answers(question_id,device_id,correct,answered_at)
select distinct on (question_id,device_id) question_id,device_id,correct,at from (
  select r.question_id,r.device_id,r.correct,r.answered_at as at from public.study_answer_records r
  union all
  select m.q_ids[a.q_index+1],p.device_id,a.correct,a.at
  from public.attempts a join public.matches m on m.id=a.match_id
  join public.players p on p.match_id=a.match_id and p.seat=a.seat
  union all
  select h->>'id',s.device_id,(h->>'my_choice')::int=(h->>'answer')::int,s.created_at
  from public.solo_sessions s cross join lateral jsonb_array_elements(s.history) h
  where s.mode='ai' and h->>'my_choice' is not null and h->>'answer' is not null
) x where question_id in (select id from public.questions)
order by question_id,device_id,at
on conflict do nothing;

create or replace function public._first_answer(p_question text,p_device uuid,p_correct boolean) returns void
language sql security definer set search_path=public as $$
  insert into question_first_answers(question_id,device_id,correct)
  select p_question,p_device,p_correct where p_correct is not null and exists(select 1 from questions where id=p_question)
  on conflict do nothing
$$;

-- 一人学習・復習・AI対戦：解答（お手つきを含む）と「回答を見る」の瞬間に数える。
create or replace function public._count_solo_first_answer() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  begin
    if new.my_choice is not null and (old.my_choice is null or old.q_index<>new.q_index) then
      perform _first_answer(new.q_ids[new.q_index+1],new.device_id,
        (select answer=new.my_choice from questions where id=new.q_ids[new.q_index+1]));
    elsif new.answer_viewed and not old.answer_viewed and new.my_choice is null then
      perform _first_answer(new.q_ids[new.q_index+1],new.device_id,false);
    end if;
  exception when others then null; -- 集計の失敗で解答を止めない
  end;
  return new;
end $$;
drop trigger if exists count_solo_first_answer on public.solo_sessions;
create trigger count_solo_first_answer after update of my_choice,answer_viewed on public.solo_sessions
for each row execute function public._count_solo_first_answer();

-- 対人対戦：解答の記録（attempts）ができた瞬間に数える。
create or replace function public._count_match_first_answer() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  begin
    perform _first_answer(m.q_ids[new.q_index+1],p.device_id,new.correct)
    from matches m join players p on p.match_id=m.id and p.seat=new.seat where m.id=new.match_id;
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists count_match_first_answer on public.attempts;
create trigger count_match_first_answer after insert on public.attempts
for each row execute function public._count_match_first_answer();

-- 問題ごとの人数（n）と初回正解の人数（correct）。正解・解答者は返さない。
create or replace function public.get_question_stats() returns jsonb
language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_object_agg(question_id,jsonb_build_object('n',n,'correct',c)),'{}'::jsonb) from (
    select question_id,count(*) as n,count(*) filter(where correct) as c from question_first_answers group by question_id
  ) s
$$;

revoke execute on function public._first_answer(text,uuid,boolean),public._count_solo_first_answer(),public._count_match_first_answer() from public,anon,authenticated;
revoke execute on function public.get_question_stats() from public;
grant execute on function public.get_question_stats() to anon,authenticated;
notify pgrst,'reload schema';
commit;
