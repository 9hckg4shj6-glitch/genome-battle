-- 一人で学習の「収録問題一覧」で、開いた1問の正答と解説だけを返す。
-- 一覧の本文・選択肢は public/questions.json から表示し、正答は開いたときに初めて取得する。
begin;
create or replace function public.get_question_answer(p_id text) returns jsonb
language sql stable security definer set search_path=public as $$
  select jsonb_build_object('id',q.id,'answer',q.answer,'explanation',q.explanation) from questions q where q.id=p_id
$$;
revoke execute on function public.get_question_answer(text) from public;
grant execute on function public.get_question_answer(text) to anon,authenticated;
notify pgrst,'reload schema';
commit;
