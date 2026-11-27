-- TRANSACTION NUMBERS (2026-11-27).
--
-- Every row in the ledger gets its own reference number, created by the
-- database at the moment the row is written, like the booking code on an air
-- or bus ticket. It works the same for every payment method (M-Pesa, Airtel
-- Money, Tigo Pesa, cash) and for every kind of entry (contribution, loan
-- payout, repayment, Jamii, expense, share-out, reversal), because it is set
-- by a trigger on the table, not by any one function or screen.
--
-- It is separate from transactions.reference, which stays the provider's own
-- code (e.g. the M-Pesa confirmation code) that the member types in.
--
-- Format: ATL-YYMM-XXXXXX, e.g. ATL-2611-7K3M9Q.
--   YYMM   = year and month the row was created (East Africa Time), so a
--            number also tells you roughly when it happened.
--   XXXXXX = 6 random characters from an alphabet without look-alikes
--            (no 0/O, 1/I/L, U), easy to read out over the phone.
--            30^6 = ~729 million per month; a clash is retried.
--
-- Rules: always set by the database (any value sent by a client is replaced),
-- unique, never changed once written. A reversal gets its own new number and
-- points back to the original through reversed_transaction_id.

create or replace function public.new_transaction_number(p_at timestamptz default now())
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_code text := '';
  v_bytes bytea := extensions.gen_random_bytes(6);
  i int;
begin
  for i in 0..5 loop
    v_code := v_code || substr(v_alphabet, 1 + (get_byte(v_bytes, i) % length(v_alphabet)), 1);
  end loop;
  return 'ATL-' || to_char(p_at at time zone 'Africa/Dar_es_Salaam', 'YYMM') || '-' || v_code;
end;
$$;

revoke all on function public.new_transaction_number(timestamptz) from public, anon, authenticated;

alter table public.transactions add column if not exists txn_number text;

-- Give every existing row a number, dated by when it was created.
do $$
declare
  r record;
  v_num text;
begin
  for r in select id, created_at from public.transactions where txn_number is null order by created_at loop
    loop
      v_num := public.new_transaction_number(r.created_at);
      exit when not exists (select 1 from public.transactions where txn_number = v_num);
    end loop;
    update public.transactions set txn_number = v_num where id = r.id;
  end loop;
end;
$$;

create unique index if not exists transactions_txn_number_key on public.transactions (txn_number);
alter table public.transactions alter column txn_number set not null;

create or replace function public.assign_transaction_number()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_num text;
begin
  loop
    v_num := new_transaction_number(coalesce(new.created_at, now()));
    exit when not exists (select 1 from transactions where txn_number = v_num);
  end loop;
  new.txn_number := v_num;
  return new;
end;
$$;

revoke all on function public.assign_transaction_number() from public, anon, authenticated;

drop trigger if exists transactions_assign_number on public.transactions;
create trigger transactions_assign_number
  before insert on public.transactions
  for each row execute function public.assign_transaction_number();

create or replace function public.keep_transaction_number()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.txn_number is distinct from old.txn_number then
    raise exception 'A transaction number can never be changed.';
  end if;
  return new;
end;
$$;

revoke all on function public.keep_transaction_number() from public, anon, authenticated;

drop trigger if exists transactions_keep_number on public.transactions;
create trigger transactions_keep_number
  before update of txn_number on public.transactions
  for each row execute function public.keep_transaction_number();
