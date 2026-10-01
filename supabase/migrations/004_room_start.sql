-- 対戦室は2人以上で開始。マッチングの人数設定も手動開始では迂回させない。
begin;
create or replace function public.start_room(p_match uuid, p_device uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare m matches%rowtype;
begin
  select * into m from matches where id=p_match for update;
  if not found or _seat(p_match,p_device) is null then raise exception 'NOT_IN_MATCH'; end if;
  if m.code is null then raise exception 'ROOM_ONLY'; end if;
  if m.status='waiting' then
    if m.host_device is distinct from p_device and _seat(m.id,m.host_device) is not null then
      raise exception 'HOST_ONLY';
    end if;
    if (select count(*) from players where match_id=m.id) < 2 then raise exception 'NEED_PLAYERS'; end if;
    perform _start(m.id);
    return _broadcast(m.id) || jsonb_build_object('my_seat',_seat(m.id,p_device));
  end if;
  return _state(m.id) || jsonb_build_object('my_seat',_seat(m.id,p_device));
end
$$;
revoke execute on function public.start_room(uuid,uuid) from public;
grant execute on function public.start_room(uuid,uuid) to anon,authenticated;
notify pgrst,'reload schema';
commit;
