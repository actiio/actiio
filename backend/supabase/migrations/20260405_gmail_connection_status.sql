ALTER TABLE public.gmail_connections
ADD COLUMN IF NOT EXISTS status text default 'connected';
