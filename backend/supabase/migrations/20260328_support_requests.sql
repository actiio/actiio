create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  agent_id text references public.agents(id) default 'gmail_followup',
  subject text not null,
  message text not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);

alter table public.support_requests enable row level security;

drop policy if exists "support_requests_select_own" on public.support_requests;
create policy "support_requests_select_own" on public.support_requests for select using (auth.uid() = user_id);

drop policy if exists "support_requests_insert_own" on public.support_requests;
create policy "support_requests_insert_own" on public.support_requests for insert with check (auth.uid() = user_id);
