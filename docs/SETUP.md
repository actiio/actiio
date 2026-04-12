# Local Setup (Phase 1-4)

## 1. Supabase

1. Create a Supabase project.
2. In Supabase SQL Editor, run [backend/supabase/schema.sql](/Users/jishma/follow-up-agent/backend/supabase/schema.sql).
3. In Auth settings, keep email/password auth enabled.
4. Copy `Project URL`, `anon key`, and `service_role key`.

## 2. Backend

1. `cd backend`
2. `python -m venv .venv && source .venv/bin/activate`
3. `pip install -r requirements.txt`
   This installs `email-validator`, which Pydantic needs for the auth/email schemas.
4. `cp .env.example .env` and fill:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   - `ANTHROPIC_API_KEY`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI`
   - `GOOGLE_PUBSUB_TOPIC`
   - `CASHFREE_APP_ID`
   - `CASHFREE_SECRET_KEY`
   - `CASHFREE_ENV`
   - `CASHFREE_PLAN_ID`
   - `CASHFREE_RETURN_URL`
5. Run web service:
   `uvicorn main:app --host 0.0.0.0 --port 8000 --reload`
6. Health check:
   `GET http://localhost:8000/api/health`
7. Run worker in separate terminal:
   `python worker.py`
8. Run pipeline test script:
   `python tests/test_pipeline.py`
9. Run Gmail test script:
   `GMAIL_TEST_USER_ID=<supabase_user_id> python tests/test_gmail.py`
## 3. Frontend

1. `cd frontend`
2. `npm install`
3. `cp .env.example .env.local` and fill Supabase values.
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:8000`)
4. `npm run dev`
5. Open `http://localhost:3000`

## 4. App flows

- Sign up: `/sign-up`
- Sign in: `/sign-in`
- Protected routes:
  - `/dashboard`
  - `/onboarding`
  - `/settings`
- Business profile writes to `public.business_profiles`.

## 5. Phase 2 pipeline modules

- `pipeline/silence_detector.py`
- `pipeline/thread_loader.py`
- `pipeline/classifier.py`
- `pipeline/draft_generator.py`
- `pipeline/notifier.py`

## 6. Google Cloud Setup (Phase 3 Gmail)

1. Create a Google Cloud project.
2. Enable Gmail API.
3. Create OAuth2 credentials with **Web application** type.
4. Add authorized redirect URI: `http://localhost:8000/api/gmail/callback`
5. Create a Pub/Sub topic and subscription.
6. Grant Gmail API publish rights to the Pub/Sub topic.
7. Set push subscription endpoint to: `https://yourdomain.com/api/gmail/webhook`
8. Add to `backend/.env`:
   - `GOOGLE_CLIENT_ID=`
   - `GOOGLE_CLIENT_SECRET=`
   - `GOOGLE_REDIRECT_URI=`
   - `GOOGLE_PUBSUB_TOPIC=`

## 7. Railway Deployment

Use two services from the same backend repo:

1. Web service:
   - Start command: `uvicorn main:app --host 0.0.0.0 --port 8000`
   - Set all backend env vars from `backend/.env.example`
2. Worker service:
   - Start command: `python worker.py`
   - Set the same env vars as web service

`backend/Procfile` is included with both process definitions.

## 8. Vercel Deployment

1. Deploy the `frontend/` directory to Vercel.
2. Set environment variables in Vercel:
   - `NEXT_PUBLIC_API_BASE_URL=https://your-railway-web-service-url`
   - `NEXT_PUBLIC_SUPABASE_URL=...`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY=...`

## 9. Supabase Auth Configuration

1. Password reset email template can be customized in:
   **Supabase Dashboard → Authentication → Email Templates → Reset Password**
   The default template works out of the box, but for production, customize it with Actiio branding.

2. In **Supabase Dashboard → Authentication → URL Configuration**, add your URLs to allowed redirect URLs:
   - Development: `http://localhost:3000/reset-password`
   - Production: `https://actiio.co/reset-password`

## 10. Cashfree Plan Setup

1. Create a reusable subscription/autopay plan in Cashfree Dashboard.
2. Set the plan type to `ON_DEMAND` with max amount `₹499`.
3. Copy the plan ID from Cashfree.
4. Add `CASHFREE_PLAN_ID=<your_plan_id>` to backend env.
5. Each autopay mandate will reference this shared Cashfree plan ID; the backend raises ₹499 charges against the authorized mandate.
6. Set `CASHFREE_RETURN_URL=http://localhost:3000/agents` in development.
7. Register `POST https://your-backend-domain/api/payment/webhook` for both payment order events and subscription events.
8. Enable subscription webhook events: `SUBSCRIPTION_STATUS_CHANGED`, `SUBSCRIPTION_AUTH_STATUS`, `SUBSCRIPTION_PAYMENT_SUCCESS`, `SUBSCRIPTION_PAYMENT_FAILED`, and `SUBSCRIPTION_PAYMENT_CANCELLED`.
