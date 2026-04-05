-- Actiio Phase 1 schema
-- Execute in Supabase SQL editor.

create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text unique not null,
  created_at timestamptz not null default now()
);

-- Legacy cleanup if needed (done via separate migration steps in real life, but here we update the source of truth)
ALTER TABLE public.users DROP COLUMN IF EXISTS subscription_status;
ALTER TABLE public.users DROP COLUMN IF EXISTS stripe_customer_id;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS subscription_status text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS stripe_customer_id text;

-- =============================================
-- Agents catalog
-- =============================================
CREATE TABLE IF NOT EXISTS public.agents (
  id text primary key,
  name text not null,
  description text not null,
  icon text not null,
  free_price_inr integer not null default 99,
  pro_price_inr integer not null default 499,
  stripe_free_price_id text,
  stripe_pro_price_id text,
  channel text check (channel in ('gmail', 'any') or channel is null),
  status text not null default 'active'
    check (status in ('active', 'coming_soon')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS channel text
  check (channel in ('gmail', 'any') or channel is null);

INSERT INTO public.agents
  (id, name, description, icon, free_price_inr, pro_price_inr, status, sort_order)
VALUES
  ('gmail_followup', 'Gmail Follow-up Agent',
   'Monitors your Gmail inbox for silent sales leads and generates smart follow-up drafts automatically. Never lose a warm lead again.',
   '📧', 99, 499, 'active', 1),
  ('lead_scorer', 'Lead Scorer Agent',
   'Automatically scores and prioritizes inbound leads so you focus on the ones most likely to close.',
   '🎯', 99, 499, 'coming_soon', 2),
  ('cold_outreach', 'Cold Outreach Agent',
   'Researches prospects and generates personalized cold outreach that gets replies.',
   '📨', 99, 499, 'coming_soon', 3),
  ('proposal_generator', 'Proposal Generator',
   'Turns meeting notes into polished proposals ready to send in minutes.',
   '📄', 99, 499, 'coming_soon', 4)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  free_price_inr = EXCLUDED.free_price_inr,
  pro_price_inr = EXCLUDED.pro_price_inr,
  status = EXCLUDED.status,
  sort_order = EXCLUDED.sort_order;

create table if not exists public.business_profiles (
  user_id uuid primary key references public.users (id) on delete cascade,
  agent_id text references public.agents(id) default 'gmail_followup',
  business_name text not null,
  industry text not null,
  target_customer text not null,
  core_offer text not null,
  price_range text not null,
  differentiator text not null,
  email_footer text not null default '',
  sales_assets jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

ALTER TABLE public.business_profiles
  DROP COLUMN IF EXISTS silence_threshold_hours;

ALTER TABLE public.business_profiles
  DROP COLUMN IF EXISTS preferred_tone;

ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS email_footer text not null default '';

create table if not exists public.gmail_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  agent_id text references public.agents(id) default 'gmail_followup',
  email text,
  display_name text,
  access_token text not null,
  refresh_token text,
  token_expiry timestamptz,
  is_active boolean not null default true,
  status text default 'connected',
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.lead_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  agent_id text references public.agents(id) default 'gmail_followup',
  gmail_account_email text,
  contact_name text,
  contact_email text,
  contact_phone text,
  subject text,
  channel text not null check (channel in ('gmail')),
  status text not null default 'active' check (status in ('active', 'pending_approval', 'closed', 'manual_review', 'needs_review', 'ignored')),
  escalation_level integer not null default 0,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  follow_up_count integer not null default 0,
  last_classified_at timestamptz,
  gmail_thread_id text,
  created_at timestamptz not null default now()
);

ALTER TABLE public.lead_threads
  ADD COLUMN IF NOT EXISTS close_reason text;

ALTER TABLE public.lead_threads
  DROP CONSTRAINT IF EXISTS lead_threads_close_reason_check;

ALTER TABLE public.lead_threads
  ADD CONSTRAINT lead_threads_close_reason_check
  CHECK (
    close_reason IN (
      'opt_out',
      'chose_competitor',
      'not_interested',
      'manual',
      'follow_up_limit'
    ) OR close_reason IS NULL
  );

ALTER TABLE public.lead_threads ADD COLUMN IF NOT EXISTS agent_id text references public.agents(id) default 'gmail_followup';
UPDATE public.lead_threads SET agent_id = 'gmail_followup' WHERE agent_id IS NULL;
UPDATE public.lead_threads
  SET agent_id = 'gmail_followup'
  WHERE agent_id IN ('actiio', 'follow_up') AND channel = 'gmail';

-- Ensure existing projects also allow `needs_review` status.
alter table public.lead_threads
  drop constraint if exists lead_threads_status_check;
alter table public.lead_threads
  add constraint lead_threads_status_check
  check (status in ('active', 'pending_approval', 'closed', 'manual_review', 'needs_review', 'ignored'));

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.lead_threads (id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  subject text,
  preview_snippet text,
  gmail_message_id text unique, -- Added unique constraint
  header_message_id text,
  reply_to text,
  cc text,
  sender_email text,
  has_attachments boolean not null default false,
  attachment_names jsonb not null default '[]'::jsonb,
  "timestamp" timestamptz not null default now()
);

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS has_attachments boolean not null default false;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS attachment_names jsonb not null default '[]'::jsonb;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS preview_snippet text;

create table if not exists public.thread_audits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  agent_id text references public.agents(id) default 'gmail_followup',
  gmail_account_email text,
  gmail_thread_id text not null,
  classification_status text not null check (classification_status in ('lead', 'not_lead')),
  last_message_at timestamptz,
  last_gmail_message_id text,
  last_checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, agent_id, gmail_account_email, gmail_thread_id)
);

create table if not exists public.drafts (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.lead_threads (id) on delete cascade,
  agent_id text references public.agents(id) default 'gmail_followup',
  draft_1 jsonb,
  draft_2 jsonb,
  draft_3 jsonb,
  selected_draft jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'sent')),
  created_at timestamptz not null default now()
);

ALTER TABLE public.drafts ALTER COLUMN draft_1 DROP NOT NULL;
ALTER TABLE public.drafts ALTER COLUMN draft_2 DROP NOT NULL;
ALTER TABLE public.drafts ALTER COLUMN draft_3 DROP NOT NULL;

ALTER TABLE public.drafts ADD COLUMN IF NOT EXISTS agent_id text references public.agents(id) default 'gmail_followup';
UPDATE public.drafts SET agent_id = 'gmail_followup' WHERE agent_id IS NULL;
UPDATE public.drafts
  SET agent_id = 'gmail_followup'
  WHERE agent_id IN ('actiio', 'follow_up')
  AND thread_id IN (SELECT id FROM public.lead_threads WHERE channel = 'gmail');

ALTER TABLE public.gmail_connections
  ADD COLUMN IF NOT EXISTS agent_id text references public.agents(id) default 'gmail_followup';

ALTER TABLE public.gmail_connections
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

ALTER TABLE public.gmail_connections
  ADD COLUMN IF NOT EXISTS display_name text;

UPDATE public.gmail_connections
  SET last_synced_at = created_at
  WHERE last_synced_at IS NULL
  AND created_at IS NOT NULL;

UPDATE public.gmail_connections
  SET agent_id = 'gmail_followup'
  WHERE agent_id IS NULL;

UPDATE public.gmail_connections
  SET agent_id = 'gmail_followup'
  WHERE agent_id IN ('actiio', 'follow_up');

create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  agent_id text references public.agents(id) default 'gmail_followup',
  subject text not null,
  message text not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);

ALTER TABLE public.gmail_connections
  DROP CONSTRAINT IF EXISTS gmail_connections_user_id_key;

ALTER TABLE public.gmail_connections
  DROP CONSTRAINT IF EXISTS gmail_connections_user_agent_unique;

ALTER TABLE public.gmail_connections
  DROP CONSTRAINT IF EXISTS gmail_connections_user_agent_email_unique;

ALTER TABLE public.gmail_connections
  ADD CONSTRAINT gmail_connections_user_agent_email_unique
  UNIQUE (user_id, agent_id, email);

ALTER TABLE public.gmail_connections
  ADD COLUMN IF NOT EXISTS is_active boolean not null default true;

CREATE UNIQUE INDEX IF NOT EXISTS gmail_connections_one_active_per_agent_idx
  ON public.gmail_connections (user_id, agent_id)
  WHERE is_active = true;

ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS agent_id text references public.agents(id) default 'gmail_followup';

UPDATE public.business_profiles
  SET agent_id = 'gmail_followup'
  WHERE agent_id IS NULL;

UPDATE public.business_profiles
  SET agent_id = 'gmail_followup'
  WHERE agent_id IN ('actiio', 'follow_up');

ALTER TABLE public.business_profiles
  DROP CONSTRAINT IF EXISTS business_profiles_pkey;

ALTER TABLE public.business_profiles
  ADD PRIMARY KEY (user_id, agent_id);

-- =============================================
-- Per-agent user subscriptions
-- =============================================
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id)
    on delete cascade,
  agent_id text not null references public.agents(id),
  stripe_subscription_id text,
  stripe_customer_id text,
  plan text not null default 'free'
    check (plan in ('free', 'pro')),
  status text not null default 'inactive'
    check (status in ('active', 'inactive',
                      'past_due', 'canceled')),
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  unique(user_id, agent_id)
);

UPDATE public.user_subscriptions
  SET agent_id = 'gmail_followup'
  WHERE agent_id IN ('actiio', 'follow_up');

UPDATE public.agents
  SET channel = 'gmail'
  WHERE id = 'gmail_followup';

UPDATE public.agents
  SET channel = 'any'
  WHERE id IN ('lead_scorer', 'cold_outreach', 'proposal_generator');

DELETE FROM public.agents WHERE id IN ('actiio', 'follow_up');

-- =============================================
-- Agent waitlist
-- =============================================
CREATE TABLE IF NOT EXISTS public.agent_waitlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id),
  agent_id text not null,
  email text not null,
  created_at timestamptz not null default now(),
  unique(user_id, agent_id)
);

-- =============================================
-- Suggested Skills
-- =============================================
CREATE TABLE IF NOT EXISTS public.suggested_skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  skill text not null,
  description text,
  created_at timestamptz not null default now()
);

-- =============================================
-- RLS and Policies
-- =============================================
alter table public.users enable row level security;
alter table public.business_profiles enable row level security;
alter table public.gmail_connections enable row level security;
alter table public.lead_threads enable row level security;
alter table public.messages enable row level security;
alter table public.thread_audits enable row level security;
alter table public.drafts enable row level security;
alter table public.support_requests enable row level security;
alter table public.agents enable row level security;
alter table public.user_subscriptions enable row level security;
alter table public.agent_waitlist enable row level security;
alter table public.suggested_skills enable row level security;

-- Policies for Agents & Subscriptions
drop policy if exists "agents_select_all" on public.agents;
create policy "agents_select_all" on public.agents for select using (true);

drop policy if exists "user_subscriptions_select_own" on public.user_subscriptions;
create policy "user_subscriptions_select_own" on public.user_subscriptions for select using (auth.uid() = user_id);

drop policy if exists "user_subscriptions_insert_own" on public.user_subscriptions;
create policy "user_subscriptions_insert_own" on public.user_subscriptions for insert with check (auth.uid() = user_id);

drop policy if exists "waitlist_insert_own" on public.agent_waitlist;
create policy "waitlist_insert_own" on public.agent_waitlist for insert with check (auth.uid() = user_id);

drop policy if exists "waitlist_select_own" on public.agent_waitlist;
create policy "waitlist_select_own" on public.agent_waitlist for select using (auth.uid() = user_id);

drop policy if exists "suggested_skills_insert_own" on public.suggested_skills;
create policy "suggested_skills_insert_own" on public.suggested_skills for insert with check (auth.uid() = user_id);

drop policy if exists "suggested_skills_select_own" on public.suggested_skills;
create policy "suggested_skills_select_own" on public.suggested_skills for select using (auth.uid() = user_id);

-- Existing Policies (restored)
drop policy if exists "users_select_own" on public.users;
create policy "users_select_own" on public.users for select using (auth.uid() = id);

drop policy if exists "users_update_own" on public.users;
create policy "users_update_own" on public.users for update using (auth.uid() = id);

drop policy if exists "business_profiles_select_own" on public.business_profiles;
create policy "business_profiles_select_own" on public.business_profiles for select using (auth.uid() = user_id);

drop policy if exists "business_profiles_insert_own" on public.business_profiles;
create policy "business_profiles_insert_own" on public.business_profiles for insert with check (auth.uid() = user_id);

drop policy if exists "business_profiles_update_own" on public.business_profiles;
create policy "business_profiles_update_own" on public.business_profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Gmail OAuth tokens are backend-only secrets.
-- The frontend anon client should never read or write this table directly.
drop policy if exists "gmail_connections_select_own" on public.gmail_connections;
drop policy if exists "gmail_connections_insert_own" on public.gmail_connections;
drop policy if exists "gmail_connections_update_own" on public.gmail_connections;
drop policy if exists "gmail_connections_delete_own" on public.gmail_connections;

drop policy if exists "lead_threads_select_own" on public.lead_threads;
create policy "lead_threads_select_own" on public.lead_threads for select using (auth.uid() = user_id);

drop policy if exists "lead_threads_update_own" on public.lead_threads;
create policy "lead_threads_update_own" on public.lead_threads for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "messages_select_own" on public.messages;
create policy "messages_select_own" on public.messages for select using (exists (select 1 from public.lead_threads lt where lt.id = thread_id and lt.user_id = auth.uid()));

drop policy if exists "thread_audits_select_own" on public.thread_audits;
create policy "thread_audits_select_own" on public.thread_audits for select using (auth.uid() = user_id);

drop policy if exists "drafts_select_own" on public.drafts;
create policy "drafts_select_own" on public.drafts for select using (exists (select 1 from public.lead_threads lt where lt.id = thread_id and lt.user_id = auth.uid()));

drop policy if exists "support_requests_select_own" on public.support_requests;
create policy "support_requests_select_own" on public.support_requests for select using (auth.uid() = user_id);

drop policy if exists "support_requests_insert_own" on public.support_requests;
create policy "support_requests_insert_own" on public.support_requests for insert with check (auth.uid() = user_id);

-- Storage Policies
insert into storage.buckets (id, name, public) values ('sales-assets', 'sales-assets', false) on conflict (id) do nothing;
drop policy if exists "sales_assets_select_own" on storage.objects;
create policy "sales_assets_select_own" on storage.objects for select using (bucket_id = 'sales-assets' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "sales_assets_insert_own" on storage.objects;
create policy "sales_assets_insert_own" on storage.objects for insert with check (bucket_id = 'sales-assets' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "sales_assets_delete_own" on storage.objects;
create policy "sales_assets_delete_own" on storage.objects for delete using (bucket_id = 'sales-assets' and auth.uid()::text = (storage.foldername(name))[1]);

-- Triggers & Helpers
create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists trg_business_profiles_updated_at on public.business_profiles;
create trigger trg_business_profiles_updated_at before update on public.business_profiles for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user() returns trigger language plpgsql security definer set search_path = public as $$ begin insert into public.users (id, email) values (new.id, coalesce(new.email, '')) on conflict (id) do nothing; return new; end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_auth_user();
