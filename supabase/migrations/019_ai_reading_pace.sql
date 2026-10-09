-- AI対戦：AIも問題を読んでから答える。回答時刻は「読む時間（文字数・図）＋考える時間（難易度）」で決め、
-- 制限時間は「時間内に答える」ための上限にだけ使う。お手つきの後はAIの解答をすぐ出して待たせない。
begin;
alter table public.questions add column if not exists read_chars int not null default 80 check (read_chars > 0);
alter table public.questions add column if not exists has_figure boolean not null default false;
-- 問題文＋選択肢の文字数と図の有無（public/questions.json から生成。以後は seed で更新）。
update public.questions q set read_chars=m.chars,has_figure=m.figure
from jsonb_to_recordset('[{"id":"genome-2025-001","chars":66,"figure":true},{"id":"genome-2025-002","chars":47,"figure":false},{"id":"genome-2025-003","chars":147,"figure":false},{"id":"genome-2025-004","chars":91,"figure":false},{"id":"genome-2025-005","chars":54,"figure":false},{"id":"genome-2025-006","chars":77,"figure":false},{"id":"genome-2025-007","chars":85,"figure":false},{"id":"genome-2025-008","chars":77,"figure":false},{"id":"genome-2025-009","chars":95,"figure":false},{"id":"genome-2025-010","chars":45,"figure":false},{"id":"genome-2025-011","chars":142,"figure":true},{"id":"genome-2025-012","chars":82,"figure":false},{"id":"genome-2025-013","chars":60,"figure":false},{"id":"genome-2025-014","chars":89,"figure":false},{"id":"genome-2025-015","chars":78,"figure":false},{"id":"genome-2025-016","chars":38,"figure":false},{"id":"genome-2025-017","chars":75,"figure":false},{"id":"genome-2025-018","chars":92,"figure":false},{"id":"genome-2025-019","chars":70,"figure":false},{"id":"genome-2025-020","chars":50,"figure":true},{"id":"genome-2025-021","chars":74,"figure":false},{"id":"genome-2025-022","chars":36,"figure":true},{"id":"genome-2025-023","chars":47,"figure":false},{"id":"genome-2025-024","chars":98,"figure":false},{"id":"genome-2025-025","chars":85,"figure":false},{"id":"genome-2025-026","chars":144,"figure":false},{"id":"genome-2025-027","chars":102,"figure":false},{"id":"genome-2025-028","chars":124,"figure":false},{"id":"genome-2025-029","chars":42,"figure":false},{"id":"genome-2025-030","chars":206,"figure":true},{"id":"genome-2025-031","chars":74,"figure":false},{"id":"genome-2025-032","chars":109,"figure":false},{"id":"genome-2025-033","chars":86,"figure":false},{"id":"genome-2025-034","chars":60,"figure":false},{"id":"genome-2025-035","chars":95,"figure":false},{"id":"genome-2025-036","chars":71,"figure":false},{"id":"genome-2025-037","chars":63,"figure":false},{"id":"genome-2025-038","chars":124,"figure":true},{"id":"genome-2025-039","chars":61,"figure":false},{"id":"genome-2025-040","chars":49,"figure":false},{"id":"genome-2025-041","chars":73,"figure":false},{"id":"genome-2025-042","chars":102,"figure":false},{"id":"genome-2025-043","chars":97,"figure":false},{"id":"genome-2025-044","chars":116,"figure":false},{"id":"genome-2025-045","chars":38,"figure":true},{"id":"genome-2025-046","chars":81,"figure":false},{"id":"genome-2025-047","chars":118,"figure":false},{"id":"genome-2025-048","chars":85,"figure":false},{"id":"genome-2025-049","chars":112,"figure":false},{"id":"genome-2025-050","chars":50,"figure":true},{"id":"genome-2025-051","chars":73,"figure":false},{"id":"genome-2025-052","chars":79,"figure":false},{"id":"genome-2025-053","chars":99,"figure":false},{"id":"genome-2025-054","chars":86,"figure":false},{"id":"genome-2025-055","chars":58,"figure":false},{"id":"genome-2025-056","chars":78,"figure":false},{"id":"genome-2025-057","chars":67,"figure":false},{"id":"genome-2025-058","chars":54,"figure":false},{"id":"genome-2025-059","chars":71,"figure":false},{"id":"genome-2025-060","chars":65,"figure":false},{"id":"genome-2025-061","chars":103,"figure":true},{"id":"genome-2025-062","chars":72,"figure":false},{"id":"genome-2025-063","chars":63,"figure":false},{"id":"genome-2025-064","chars":74,"figure":false},{"id":"genome-2025-065","chars":106,"figure":false},{"id":"genome-2025-066","chars":71,"figure":false},{"id":"genome-2025-067","chars":115,"figure":false},{"id":"genome-2025-068","chars":90,"figure":false},{"id":"genome-2025-069","chars":70,"figure":false},{"id":"genome-2025-070","chars":69,"figure":false},{"id":"genome-2025-071","chars":68,"figure":true},{"id":"genome-2025-072","chars":83,"figure":false},{"id":"genome-2025-073","chars":57,"figure":false},{"id":"genome-2025-074","chars":52,"figure":false},{"id":"genome-2025-075","chars":46,"figure":false},{"id":"genome-2025-076","chars":41,"figure":false},{"id":"genome-2025-077","chars":44,"figure":false},{"id":"genome-2025-078","chars":85,"figure":false},{"id":"genome-2025-079","chars":53,"figure":false},{"id":"genome-2025-080","chars":76,"figure":false},{"id":"genome-2025-081","chars":59,"figure":false},{"id":"genome-2025-082","chars":56,"figure":false},{"id":"genome-2025-083","chars":54,"figure":false},{"id":"genome-2025-084","chars":150,"figure":false},{"id":"genome-2025-085","chars":81,"figure":false},{"id":"genome-2025-086","chars":79,"figure":false},{"id":"genome-2025-087","chars":98,"figure":false},{"id":"genome-2025-088","chars":87,"figure":false},{"id":"genome-2025-089","chars":212,"figure":false},{"id":"genome-2025-090","chars":62,"figure":false},{"id":"genome-2025-091","chars":75,"figure":false},{"id":"genome-2025-092","chars":106,"figure":false},{"id":"genome-2025-093","chars":75,"figure":false},{"id":"genome-2025-094","chars":97,"figure":false},{"id":"genome-2025-095","chars":93,"figure":false},{"id":"genome-2025-096","chars":115,"figure":false},{"id":"genome-2025-097","chars":81,"figure":false},{"id":"genome-2025-098","chars":98,"figure":false},{"id":"genome-2025-099","chars":89,"figure":false},{"id":"genome-2025-100","chars":60,"figure":false}]'::jsonb) as m(id text,chars int,figure boolean) where q.id=m.id;

-- 読む速さは1秒8文字、図は+3秒。難易度ごとに 読む時間×倍率＋考える時間（乱数幅つき）。
-- 制限時間より長くなる場合は、難易度順を保ったまま時間内（上限の割合）に収める。
create or replace function public._solo_schedule(p_session uuid) returns void
language sql volatile security definer set search_path = public as $$
  update solo_sessions s set
    ai_due_at=case when s.mode='ai' then s.question_at + make_interval(secs => greatest(2,least(
      (q.read_chars/8.0 + case when q.has_figure then 3 else 0 end) *
        case s.difficulty when 'easy' then 1.0 when 'normal' then 1.0 else 0.8 end
      + case s.difficulty when 'easy' then 5+random()*4 when 'normal' then 2.5+random()*3 else 1.5+random()*2 end,
      s.answer_seconds * case s.difficulty when 'easy' then 0.8+random()*0.15 when 'normal' then 0.7+random()*0.2 else 0.6+random()*0.2 end))) end,
    ai_correct=case when s.mode='ai' then random() < case s.difficulty when 'easy' then 0.45 when 'normal' then 0.7 else 0.9 end end
  from questions q
  where s.id=p_session and q.id=s.q_ids[s.q_index+1]
$$;

-- 010 の解答処理に、AI対戦のお手つき後の早送りを加える。AIの正誤は出題時に決まっているので、
-- 1.5秒の演出のあとAIの解答を反映する（予定がそれより早ければ予定どおり）。
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
      ai_due_at=case when mode='ai' and not v_correct and ai_mark is null then least(ai_due_at,now()+interval '1.5 seconds') else ai_due_at end,
      version=version+1 where id=p_session;
  end if;
  return _solo_state(p_session);
end
$$;

revoke execute on function public._solo_schedule(uuid) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
