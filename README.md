# Actiio (Phase 1 + Phase 2 + Phase 3 + Phase 4)

Actiio is an AI-powered lead follow-up agent. This repository contains a monorepo with:
- `backend/` FastAPI API + worker entrypoint
- `frontend/` Next.js + Tailwind app

## Services

- Web service: `uvicorn main:app --host 0.0.0.0 --port 8000 --reload`
- Worker service: `python worker.py`

## Implemented Scope

- Monorepo scaffold
- Supabase schema
- Auth (sign up, sign in, protected routes)
- Business profile setup page
- Backend health check endpoint
- Core lead follow-up pipeline modules (`backend/pipeline/`)
- APScheduler worker pipeline orchestration
- Local pipeline test script (`backend/tests/test_pipeline.py`)
- Gmail OAuth2 connect + callback + sync/webhook/send endpoints
- Gmail integration modules (`backend/integrations/gmail/`)
- Gmail test script (`backend/tests/test_gmail.py`)
- Frontend onboarding flow (`/onboarding`) and dashboard draft approval modal
- Settings page (`/settings`) with business profile + Gmail connection status
- Stripe checkout + webhook + billing portal routes
- Subscription gating for threads/sync/send operations

See [docs/SETUP.md](/Users/jishma/follow-up-agent/docs/SETUP.md) for local setup.
