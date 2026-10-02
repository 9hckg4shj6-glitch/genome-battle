-- 対人戦を早押しから全員解答へ。各自が1回ずつ選び、全員がそろうか時間切れで正解・解説を出す。
-- 正解した人は全員1点。解答中は他人の正誤を隠し「回答済み」だけを見せる。
begin;
create or replace function public._state(p_match uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', m.id,
    'code', m.code,
    'is_private', m.is_private,
    'room_field', m.room_field,
    'rematch_of',m.rematch_of,
    'can_rematch',m.status='finished' and m.started_at is not null and (select count(*) from players where match_id=m.id)>=2,
    'rematch_requested',exists(select 1 from matches n where n.id=m.rematch_id and n.status in ('waiting','playing')),
    'rematch_joined',(select count(*) from players where match_id=m.rematch_id and last_seen>now()-interval '12 seconds'),
    'rematch_total',(select count(*) from players where match_id=m.id),
    'rematch_roster',coalesce((select jsonb_agg(jsonb_build_object('name',r.name,'seat',r.seat,'joined',p.device_id is not null and p.last_seen>now()-interval '12 seconds','ready',coalesce(p.ready and p.last_seen>now()-interval '12 seconds',false)) order by r.seat)
      from rematch_members r left join players p on p.match_id=r.match_id and p.device_id=r.device_id where r.match_id=m.id),'[]'::jsonb),
    'status', m.status,
    'phase', m.phase,
    'q_index', m.q_index,
    'q_total', cardinality(m.q_ids),
    'q_id', m.q_ids[m.q_index + 1],
    'phase_ends_at', m.phase_ends_at,
    'server_now', now(),
    'winner_seat', m.winner_seat,
    'win_score', 5,
    'capacity', m.capacity,
    'answer_seconds', m.answer_seconds,
    'version', m.version,
    'host_seat', (select p.seat from players p where p.match_id = m.id and p.device_id = m.host_device),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'seat', p.seat,
        'name', p.name,
        'score', p.score,
        'ready',p.ready,
        'mark', (select case when m.phase = 'question' then 'answered' when a.correct then 'o' else 'x' end
                 from attempts a where a.match_id = m.id and a.q_index = m.q_index and a.seat = p.seat)
      ) order by p.seat)
      from players p where p.match_id = m.id), '[]'::jsonb),
    'reveal', case when m.phase = 'reveal' then (
      select jsonb_build_object('answer', q.answer, 'explanation', q.explanation)
      from questions q where q.id = m.q_ids[m.q_index + 1]) end
  )
  from matches m where m.id = p_match
$$;

create or replace function public.submit_answer(p_match uuid, p_device uuid, p_q_index int, p_choice int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m matches%rowtype;
  v_seat smallint;
  v_correct boolean;
begin
  select * into m from matches where id = p_match for update;
  v_seat := _seat(p_match, p_device);
  if m.id is null or v_seat is null then
    raise exception 'NOT_IN_MATCH';
  end if;
  if m.status = 'playing' and m.phase = 'question' and m.q_index = p_q_index
     and now() < m.phase_ends_at and p_choice between 0 and 4
     and not exists (select 1 from attempts where match_id = p_match and q_index = p_q_index and seat = v_seat) then
    select answer = p_choice into v_correct from questions where id = m.q_ids[m.q_index + 1];
    insert into attempts (match_id, q_index, seat, choice, correct) values (p_match, p_q_index, v_seat, p_choice, v_correct);
    if v_correct then
      update players set score = score + 1 where match_id = p_match and seat = v_seat;
    end if;
    -- 対戦中に抜けた人も players に残るので、来ない人の分は制限時間で打ち切る。
    if (select count(*) from attempts where match_id = p_match and q_index = p_q_index)
       >= (select count(*) from players where match_id = p_match) then
      update matches set phase = 'reveal', phase_ends_at = now() + interval '7 seconds' where id = p_match;
    end if;
    return _broadcast(p_match) || jsonb_build_object('my_seat', v_seat);
  end if;
  if _advance(p_match) then
    return _broadcast(p_match) || jsonb_build_object('my_seat', v_seat);
  end if;
  return _state(p_match) || jsonb_build_object('my_seat', v_seat);
end
$$;
commit;
