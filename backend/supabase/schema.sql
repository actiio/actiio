-- Actiio Phase 1 schema
-- Execute in Supabase SQL editor.

create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text unique not null,
  subscription_status text not null default 'inactive' check (subscription_status in ('inactive', 'active', 'past_due', 'canceled')),
  stripe_customer_id text,
  created_at timestamptz not null default now()
);

alter table public.users add column if not exists stripe_customer_id text;

create table if not exists public.business_profiles (
  user_id uuid primary key references public.users (id) on delete cascade,
  business_name text not null,
  industry text not null,
  target_customer text not null,
  core_offer text not null,
  price_range text not null,
  differentiator text not null,
  preferred_tone text not null,
  silence_threshold_hours integer not null default 48,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gmail_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users (id) on delete cascade,
  email text,
  access_token text not null,
  refresh_token text,
  token_expiry timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.whatsapp_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users (id) on delete cascade,
  phone_number_id text not null,
  display_phone_number text,
  business_account_id text,
  access_token text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.lead_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  contact_name text,
  contact_email text,
  contact_phone text,
  channel text not null check (channel in ('gmail', 'whatsapp')),
  status text not null default 'active' check (status in ('active', 'pending_approval', 'closed', 'manual_review', 'needs_review')),
  escalation_level integer not null default 0,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  follow_up_count integer not null default 0,
  last_classified_at timestamptz,
  gmail_thread_id text,
  whatsapp_chat_id text,
  created_at timestamptz not null default now()
);

-- Ensure existing projects also allow `needs_review` status.
alter table public.lead_threads
  drop constraint if exists lead_threads_status_check;
alter table public.lead_threads
  add constraint lead_threads_status_check
  check (status in ('active', 'pending_approval', 'closed', 'manual_review', 'needs_review'));

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.lead_threads (id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  content text not null,
  gmail_message_id text,
  whatsapp_message_id text,
  "timestamp" timestamptz not null default now()
);

alter table public.lead_threads add column if not exists last_outbound_at timestamptz;
alter table public.lead_threads add column if not exists follow_up_count integer not null default 0;
alter table public.lead_threads add column if not exists last_classified_at timestamptz;
alter table public.lead_threads add column if not exists gmail_thread_id text;
alter table public.lead_threads add column if not exists whatsapp_chat_id text;
alter table public.messages add column if not exists gmail_message_id text;
alter table public.messages add column if not exists whatsapp_message_id text;

create table if not exists public.drafts (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.lead_threads (id) on delete cascade,
  draft_1 jsonb not null,
  draft_2 jsonb not null,
  draft_3 jsonb not null,
  selected_draft jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'sent')),
  created_at timestamptz not null default now()
);

create index if not exists idx_lead_threads_user_id on public.lead_threads (user_id);
create index if not exists idx_lead_threads_gmail_thread_id on public.lead_threads (gmail_thread_id);
create index if not exists idx_lead_threads_whatsapp_chat_id on public.lead_threads (whatsapp_chat_id);
create index if not exists idx_messages_thread_id on public.messages (thread_id);
create index if not exists idx_messages_gmail_message_id on public.messages (gmail_message_id);
create index if not exists idx_messages_whatsapp_message_id on public.messages (whatsapp_message_id);
create index if not exists idx_drafts_thread_id on public.drafts (thread_id);
create index if not exists idx_gmail_connections_user_id on public.gmail_connections (user_id);
create index if not exists idx_gmail_connections_email on public.gmail_connections (email);
create index if not exists idx_whatsapp_connections_user_id on public.whatsapp_connections (user_id);
create index if not exists idx_whatsapp_connections_phone_number_id on public.whatsapp_connections (phone_number_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_business_profiles_updated_at on public.business_profiles;
create trigger trg_business_profiles_updated_at
before update on public.business_profiles
for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

alter table public.users enable row level security;
alter table public.business_profiles enable row level security;
alter table public.gmail_connections enable row level security;
alter table public.whatsapp_connections enable row level security;
alter table public.lead_threads enable row level security;
alter table public.messages enable row level security;
alter table public.drafts enable row level security;

drop policy if exists "users_select_own" on public.users;
drop policy if exists "users_update_own" on public.users;
drop policy if exists "business_profiles_select_own" on public.business_profiles;
drop policy if exists "business_profiles_insert_own" on public.business_profiles;
drop policy if exists "business_profiles_update_own" on public.business_profiles;
drop policy if exists "lead_threads_all_own" on public.lead_threads;
drop policy if exists "messages_all_own" on public.messages;
drop policy if exists "drafts_all_own" on public.drafts;
drop policy if exists "gmail_connections_all_own" on public.gmail_connections;
drop policy if exists "whatsapp_connections_all_own" on public.whatsapp_connections;
drop policy if exists "gmail_connections_select_own" on public.gmail_connections;
drop policy if exists "gmail_connections_update_own" on public.gmail_connections;
drop policy if exists "whatsapp_connections_select_own" on public.whatsapp_connections;
drop policy if exists "whatsapp_connections_update_own" on public.whatsapp_connections;
drop policy if exists "lead_threads_select_own" on public.lead_threads;
drop policy if exists "lead_threads_update_own" on public.lead_threads;
drop policy if exists "messages_select_own" on public.messages;
drop policy if exists "drafts_select_own" on public.drafts;

create policy "users_select_own"
on public.users for select
using (auth.uid() = id);

create policy "users_update_own"
on public.users for update
using (auth.uid() = id);

create policy "business_profiles_select_own"
on public.business_profiles for select
using (auth.uid() = user_id);

create policy "business_profiles_insert_own"
on public.business_profiles for insert
with check (auth.uid() = user_id);

create policy "business_profiles_update_own"
on public.business_profiles for update
using (auth.uid() = user_id);

create policy "gmail_connections_select_own"
on public.gmail_connections for select
using (auth.uid() = user_id)
;

create policy "gmail_connections_update_own"
on public.gmail_connections for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "whatsapp_connections_select_own"
on public.whatsapp_connections for select
using (auth.uid() = user_id)
;

create policy "whatsapp_connections_update_own"
on public.whatsapp_connections for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "lead_threads_select_own"
on public.lead_threads for select
using (auth.uid() = user_id);

create policy "lead_threads_update_own"
on public.lead_threads for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "messages_select_own"
on public.messages for select
using (
  exists (
    select 1
    from public.lead_threads lt
    where lt.id = thread_id and lt.user_id = auth.uid()
  )
);

create policy "drafts_select_own"
on public.drafts for select
using (
  exists (
    select 1
    from public.lead_threads lt
    where lt.id = thread_id and lt.user_id = auth.uid()
  )
);

-- Allow users to disconnect their own integrations from the frontend.
drop policy if exists "gmail_connections_delete_own" on public.gmail_connections;
create policy "gmail_connections_delete_own"
on public.gmail_connections for delete
using (auth.uid() = user_id);

drop policy if exists "whatsapp_connections_delete_own" on public.whatsapp_connections;
create policy "whatsapp_connections_delete_own"
on public.whatsapp_connections for delete
using (auth.uid() = user_id);
