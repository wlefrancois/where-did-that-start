-- Argument Autopsy authentication, preferences, and usage metering.
-- Raw conversations, screenshots, and reports are intentionally not stored.

begin;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  age_18_confirmed_at timestamptz,
  unfiltered_terms_accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  free_reports_remaining integer not null default 1 check (free_reports_remaining >= 0),
  paid_report_credits integer not null default 0 check (paid_report_credits >= 0),
  unlimited_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.entitlements enable row level security;

drop policy if exists "Users can view their profile" on public.profiles;
create policy "Users can view their profile" on public.profiles
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users can update their profile" on public.profiles;
create policy "Users can update their profile" on public.profiles
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can view their entitlements" on public.entitlements;
create policy "Users can view their entitlements" on public.entitlements
for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (age_18_confirmed_at, unfiltered_terms_accepted_at) on public.profiles to authenticated;

revoke all on public.entitlements from anon, authenticated;
grant select on public.entitlements to authenticated;

create or replace function public.create_argument_autopsy_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict (user_id) do nothing;
  insert into public.entitlements (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists create_argument_autopsy_user_trigger on auth.users;
create trigger create_argument_autopsy_user_trigger
after insert on auth.users for each row
execute function public.create_argument_autopsy_user();

create or replace function public.consume_argument_autopsy_credit(requested_user_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  account public.entitlements%rowtype;
begin
  select * into account from public.entitlements
  where user_id = requested_user_id for update;

  if not found then return 'none'; end if;

  if account.unlimited_until is not null and account.unlimited_until > now() then
    return 'unlimited';
  end if;

  if account.free_reports_remaining > 0 then
    update public.entitlements
    set free_reports_remaining = free_reports_remaining - 1, updated_at = now()
    where user_id = requested_user_id;
    return 'free';
  end if;

  if account.paid_report_credits > 0 then
    update public.entitlements
    set paid_report_credits = paid_report_credits - 1, updated_at = now()
    where user_id = requested_user_id;
    return 'paid';
  end if;

  return 'none';
end;
$$;

revoke all on function public.consume_argument_autopsy_credit(uuid)
from public, anon, authenticated;
grant execute on function public.consume_argument_autopsy_credit(uuid) to service_role;

commit;