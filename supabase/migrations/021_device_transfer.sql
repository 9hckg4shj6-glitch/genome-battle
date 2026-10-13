-- 端末の引き継ぎ。サーバーの記録はすべて device_id に紐づくので、引き継ぎ元の device_id と
-- 端末保存のデータ（復習ノート・迷った・読んだ記録・しおり・設定など）を短いコードで新しい端末へ渡す。
-- コードは15分で失効し、一度受け取ると消える。発行し直すと同じ端末の前のコードは無効になる。
-- コードは推測できない乱数（32種×12文字）で、表に直接触れる権限は公開クライアントに与えない。
begin;
create table if not exists public.device_transfers (
  code text primary key,
  device_id uuid not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '15 minutes'
);
create index if not exists device_transfers_device on public.device_transfers(device_id);
alter table public.device_transfers enable row level security;

-- 紛らわしい 0/O・1/I を除いた32文字。gen_random_uuid() の乱数部分（版・種別のビットを除く）から作る。
create or replace function public._transfer_code() returns text
language plpgsql volatile set search_path=public as $$
declare
  v_chars constant text:='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea:=uuid_send(gen_random_uuid());
  v_code text:='';
  i int;
begin
  foreach i in array array[0,1,2,3,4,5,7,9,10,11,12,13] loop
    v_code:=v_code||substr(v_chars,(get_byte(v_bytes,i)%32)+1,1);
  end loop;
  return v_code;
end $$;

-- 発行：この端末の device_id と端末保存のデータを預け、コードを返す。
create or replace function public.create_device_transfer(p_device uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_code text;
  v_expires timestamptz;
begin
  if p_device is null or p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'BAD_TRANSFER'; end if;
  if octet_length(p_payload::text)>2000000 then raise exception 'TRANSFER_TOO_LARGE'; end if;
  delete from device_transfers where expires_at<now() or device_id=p_device;
  loop
    v_code:=_transfer_code();
    begin
      insert into device_transfers(code,device_id,payload) values(v_code,p_device,p_payload) returning expires_at into v_expires;
      exit;
    exception when unique_violation then null; -- まれな重複は引き直す
    end;
  end loop;
  return jsonb_build_object('code',v_code,'expires_at',v_expires,'server_now',now());
end $$;

-- 受け取り：コードが有効なら device_id とデータを返し、コードを消す（一度きり）。
create or replace function public.redeem_device_transfer(p_code text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_row device_transfers;
begin
  delete from device_transfers
  where code=upper(regexp_replace(coalesce(p_code,''),'[^0-9A-Za-z]','','g')) and expires_at>=now()
  returning * into v_row;
  if v_row.code is null then raise exception 'TRANSFER_NOT_FOUND'; end if;
  return jsonb_build_object('device_id',v_row.device_id,'payload',v_row.payload,'server_now',now());
end $$;

-- 発行を取り消す（「コードを無効にする」）。
create or replace function public.cancel_device_transfer(p_device uuid) returns jsonb
language sql security definer set search_path=public as $$
  with gone as (delete from device_transfers where device_id=p_device returning 1)
  select jsonb_build_object('cancelled',(select count(*) from gone),'server_now',now())
$$;

revoke execute on function public._transfer_code() from public,anon,authenticated;
revoke execute on function public.create_device_transfer(uuid,jsonb),public.redeem_device_transfer(text),public.cancel_device_transfer(uuid) from public;
grant execute on function public.create_device_transfer(uuid,jsonb),public.redeem_device_transfer(text),public.cancel_device_transfer(uuid) to anon,authenticated;
notify pgrst,'reload schema';
commit;
