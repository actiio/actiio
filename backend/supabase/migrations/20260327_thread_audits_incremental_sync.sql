create table if not exists public.thread_audits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  agent_id text references public.agents(id) default 'gmail_followup',
  gmail_thread_id text not null,
  classification_status text not null check (classification_status in ('lead', 'not_lead')),
  last_message_at timestamptz,
  last_gmail_message_id text,
  last_checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, agent_id, gmail_thread_id)
);

alter table public.thread_audits enable row level security;

drop policy if exists "thread_audits_select_own" on public.thread_audits;
create policy "thread_audits_select_own" on public.thread_audits for select using (auth.uid() = user_id);
