-- みんなの正答率を大人数に備えて事前集計にする（018の続き）。
-- これまでは取得のたびに question_first_answers 全体（端末数×問題数）を問題ごとに数え直していた。
-- 問題ごとの合計（question_stat_totals）を初回解答の追加・削除と同じトランザクションで足し引きし、
-- 取得はその合計（問題数ぶん）を読むだけにする。端末が何十・何百に増えても取得の重さは変わらない。
-- 返す形（{問題ID:{n,correct}}）は018と同じなので、配信済みの端末もそのまま使える。
begin;
create table if not exists public.question_stat_totals (
  question_id text primary key references public.questions(id) on delete cascade,
  n integer not null default 0 check (n>=0),
  correct integer not null default 0 check (correct>=0 and correct<=n)
);
alter table public.question_stat_totals enable row level security;

-- 初回解答の追加・削除（検証スクリプトの後片付けを含む）に合わせて合計を足し引きする。
-- 同じ問題に大勢が同時に初めて答えても、行の更新は順番に適用されるので数え漏れは起きない。
create or replace function public._tally_first_answer() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if tg_op in ('DELETE','UPDATE') then
    update question_stat_totals set n=n-1,correct=correct-old.correct::int where question_id=old.question_id;
  end if;
  if tg_op in ('INSERT','UPDATE') then
    insert into question_stat_totals as t(question_id,n,correct) values(new.question_id,1,new.correct::int)
    on conflict (question_id) do update set n=t.n+1,correct=t.correct+excluded.correct;
  end if;
  return null;
end $$;
create or replace function public._clear_first_answer_totals() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  delete from question_stat_totals;
  return null;
end $$;

-- 移行中に解答が入って合計がずれないよう、記録を止めてから数え直す（数ミリ秒）。
lock table public.question_first_answers in share row exclusive mode;
drop trigger if exists tally_first_answer on public.question_first_answers;
create trigger tally_first_answer after insert or delete or update of question_id,correct on public.question_first_answers
for each row execute function public._tally_first_answer();
drop trigger if exists clear_first_answer_totals on public.question_first_answers;
create trigger clear_first_answer_totals after truncate on public.question_first_answers
for each statement execute function public._clear_first_answer_totals();
delete from public.question_stat_totals;
insert into public.question_stat_totals(question_id,n,correct)
select question_id,count(*),count(*) filter(where correct) from public.question_first_answers group by question_id;

-- 問題ごとの人数（n）と初回正解の人数（correct）。解答のない問題は返さない（018と同じ）。
create or replace function public.get_question_stats() returns jsonb
language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_object_agg(question_id,jsonb_build_object('n',n,'correct',correct)),'{}'::jsonb)
  from question_stat_totals where n>0
$$;

revoke execute on function public._tally_first_answer(),public._clear_first_answer_totals() from public,anon,authenticated;
revoke execute on function public.get_question_stats() from public;
grant execute on function public.get_question_stats() to anon,authenticated;
notify pgrst,'reload schema';
commit;
