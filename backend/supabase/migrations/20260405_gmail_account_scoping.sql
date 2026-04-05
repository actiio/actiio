ALTER TABLE public.lead_threads
ADD COLUMN IF NOT EXISTS gmail_account_email text;

ALTER TABLE public.thread_audits
ADD COLUMN IF NOT EXISTS gmail_account_email text;

UPDATE public.lead_threads lt
SET gmail_account_email = gc.email
FROM public.gmail_connections gc
WHERE lt.user_id = gc.user_id
  AND lt.agent_id = gc.agent_id
  AND lt.channel = 'gmail'
  AND lt.gmail_account_email IS NULL;

UPDATE public.thread_audits ta
SET gmail_account_email = gc.email
FROM public.gmail_connections gc
WHERE ta.user_id = gc.user_id
  AND ta.agent_id = gc.agent_id
  AND ta.gmail_account_email IS NULL;

ALTER TABLE public.thread_audits
DROP CONSTRAINT IF EXISTS thread_audits_user_id_agent_id_gmail_thread_id_key;

ALTER TABLE public.thread_audits
DROP CONSTRAINT IF EXISTS thread_audits_user_id_agent_id_gmail_account_email_gmail_thread_id_key;

ALTER TABLE public.thread_audits
ADD CONSTRAINT thread_audits_user_id_agent_id_gmail_account_email_gmail_thread_id_key
UNIQUE (user_id, agent_id, gmail_account_email, gmail_thread_id);
