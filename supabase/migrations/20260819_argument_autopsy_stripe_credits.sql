-- Stripe purchases grant report credits without storing conversation content.
begin;

create table if not exists public.stripe_payment_fulfillments (
  stripe_event_id text primary key,
  stripe_session_id text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  price_id text not null,
  amount integer not null check (amount > 0),
  currency text not null,
  created_at timestamptz not null default now()
);

alter table public.stripe_payment_fulfillments enable row level security;
revoke all on public.stripe_payment_fulfillments from public, anon, authenticated;

create or replace function public.grant_argument_autopsy_paid_credit(
  stripe_event_id text,
  stripe_session_id text,
  requested_user_id uuid,
  purchased_price_id text,
  purchased_amount integer,
  purchased_currency text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer;
begin
  insert into public.stripe_payment_fulfillments (
    stripe_event_id, stripe_session_id, user_id, price_id, amount, currency
  ) values (
    stripe_event_id, stripe_session_id, requested_user_id,
    purchased_price_id, purchased_amount, lower(purchased_currency)
  ) on conflict do nothing;

  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then return false; end if;

  update public.entitlements
  set paid_report_credits = paid_report_credits + 1,
      updated_at = now()
  where user_id = requested_user_id;

  if not found then raise exception 'Entitlement not found.'; end if;
  return true;
end;
$$;

revoke all on function public.grant_argument_autopsy_paid_credit(text, text, uuid, text, integer, text)
from public, anon, authenticated;
grant execute on function public.grant_argument_autopsy_paid_credit(text, text, uuid, text, integer, text)
to service_role;

commit;