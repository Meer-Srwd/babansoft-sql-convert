create extension if not exists pgcrypto;

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

alter table public.profiles
  add column if not exists lifecycle_stage text not null default 'beta'
    check (lifecycle_stage in ('beta', 'free', 'subscriber', 'admin')),
  add column if not exists subscription_tier text not null default 'beta'
    check (subscription_tier in ('beta', 'free', 'pro', 'team', 'enterprise')),
  add column if not exists subscription_status text not null default 'beta'
    check (subscription_status in ('beta', 'trialing', 'active', 'past_due', 'canceled', 'expired', 'inactive')),
  add column if not exists billing_customer_id text,
  add column if not exists feedback_opt_in boolean not null default true,
  add column if not exists marketing_opt_in boolean not null default false;

alter table if exists public.user_settings
  drop constraint if exists user_settings_language_check;

alter table if exists public.user_settings
  add constraint user_settings_language_check
  check (language in ('en', 'ar', 'fr', 'de', 'tr', 'ku', 'ckb'));

create table if not exists public.subscription_plans (
  id text primary key,
  name text not null,
  description text not null default '',
  monthly_price numeric(10, 2),
  yearly_price numeric(10, 2),
  is_public boolean not null default true,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.subscription_plans (id, name, description, monthly_price, yearly_price, sort_order)
values
  ('beta', 'Beta', 'Private testing access before the full commercial launch.', 0, 0, 0),
  ('free', 'Free', 'Core access for individual users after launch.', 0, 0, 1),
  ('pro', 'Pro', 'Paid access for advanced users and production work.', 29, 290, 2),
  ('team', 'Team', 'Shared access and collaboration for small teams.', 99, 990, 3),
  ('enterprise', 'Enterprise', 'Custom access, onboarding, and support for large organizations.', null, null, 4)
on conflict (id) do update
set
  name = excluded.name,
  description = excluded.description,
  monthly_price = excluded.monthly_price,
  yearly_price = excluded.yearly_price,
  sort_order = excluded.sort_order,
  updated_at = timezone('utc', now());

create table if not exists public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  plan_id text not null references public.subscription_plans (id),
  provider text not null default 'manual'
    check (provider in ('manual', 'stripe', 'paddle', 'other')),
  provider_customer_id text,
  provider_subscription_id text,
  status text not null default 'beta'
    check (status in ('beta', 'trialing', 'active', 'past_due', 'canceled', 'expired', 'inactive')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists user_subscriptions_active_user_idx
  on public.user_subscriptions (user_id)
  where status in ('beta', 'trialing', 'active', 'past_due');

create table if not exists public.feedback_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete cascade,
  reporter_name text,
  reporter_email text,
  category text not null default 'general'
    check (category in ('general', 'bug', 'feature', 'ux', 'pricing', 'support')),
  rating smallint check (rating between 1 and 5),
  page text,
  message text not null,
  status text not null default 'new'
    check (status in ('new', 'reviewed', 'planned', 'closed')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.feedback_entries
  alter column user_id drop not null;

alter table public.feedback_entries
  add column if not exists reporter_name text,
  add column if not exists reporter_email text;

create index if not exists feedback_entries_user_id_idx
  on public.feedback_entries (user_id, created_at desc);

create index if not exists feedback_entries_reporter_email_idx
  on public.feedback_entries (reporter_email, created_at desc);

alter table public.subscription_plans enable row level security;
alter table public.user_subscriptions enable row level security;

alter table public.feedback_entries enable row level security;

drop policy if exists "Plans are viewable by everyone" on public.subscription_plans;
create policy "Plans are viewable by everyone"
on public.subscription_plans
for select
using (is_public = true and is_active = true);

drop policy if exists "Users can view own subscriptions" on public.user_subscriptions;
create policy "Users can view own subscriptions"
on public.user_subscriptions
for select
using (auth.uid() = user_id);

drop policy if exists "Users can view own feedback" on public.feedback_entries;
create policy "Users can view own feedback"
on public.feedback_entries
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own feedback" on public.feedback_entries;
create policy "Users can insert own feedback"
on public.feedback_entries
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own feedback" on public.feedback_entries;
create policy "Users can update own feedback"
on public.feedback_entries
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop trigger if exists handle_feedback_entries_updated_at on public.feedback_entries;
create trigger handle_feedback_entries_updated_at
before update on public.feedback_entries
for each row
execute procedure public.handle_updated_at();

drop trigger if exists handle_subscription_plans_updated_at on public.subscription_plans;
create trigger handle_subscription_plans_updated_at
before update on public.subscription_plans
for each row
execute procedure public.handle_updated_at();

drop trigger if exists handle_user_subscriptions_updated_at on public.user_subscriptions;
create trigger handle_user_subscriptions_updated_at
before update on public.user_subscriptions
for each row
execute procedure public.handle_updated_at();