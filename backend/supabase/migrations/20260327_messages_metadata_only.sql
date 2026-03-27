alter table public.messages
  drop column if exists content;

alter table public.messages
  add column if not exists preview_snippet text;
