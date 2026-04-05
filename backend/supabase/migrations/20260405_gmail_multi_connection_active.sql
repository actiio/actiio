ALTER TABLE public.gmail_connections
ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE public.gmail_connections
DROP CONSTRAINT IF EXISTS gmail_connections_user_id_key;

ALTER TABLE public.gmail_connections
DROP CONSTRAINT IF EXISTS gmail_connections_user_agent_unique;

ALTER TABLE public.gmail_connections
DROP CONSTRAINT IF EXISTS gmail_connections_user_agent_email_unique;

ALTER TABLE public.gmail_connections
ADD CONSTRAINT gmail_connections_user_agent_email_unique
UNIQUE (user_id, agent_id, email);

CREATE UNIQUE INDEX IF NOT EXISTS gmail_connections_one_active_per_agent_idx
ON public.gmail_connections (user_id, agent_id)
WHERE is_active = true;
