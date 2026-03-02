# Local Setup (Phase 1-5)

## 1. Supabase

1. Create a Supabase project.
2. In Supabase SQL Editor, run [backend/supabase/schema.sql](/Users/jishma/follow-up-agent/backend/supabase/schema.sql).
3. In Auth settings, keep email/password auth enabled.
4. Copy `Project URL`, `anon key`, and `service_role key`.

## 2. Backend

1. `cd backend`
2. `python -m venv .venv && source .venv/bin/activate`
3. `pip install -r requirements.txt`
4. `cp .env.example .env` and fill:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   - `ANTHROPIC_API_KEY`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI`
   - `GOOGLE_PUBSUB_TOPIC`
   - `WHATSAPP_VERIFY_TOKEN`
   - `WHATSAPP_API_VERSION`
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `STRIPE_PRICE_ID`
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
10. Run WhatsApp parser test script:
   `python tests/test_whatsapp.py`

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

## 7. Meta Setup (Phase 5 WhatsApp)

1. Create a Meta developer app with WhatsApp Cloud API enabled.
2. Add a WhatsApp Business phone number and copy `Phone Number ID`.
3. Generate a permanent access token with WhatsApp messaging permissions.
4. Set webhook callback URL to `https://yourdomain.com/api/whatsapp/webhook`.
5. Set verify token in Meta to match `WHATSAPP_VERIFY_TOKEN` in backend `.env`.
6. Subscribe webhook fields for messages.
7. In onboarding/settings, save:
   - `phone_number_id`
   - `access_token`
   - optional `business_account_id` and display phone number

## 8. Railway Deployment

Use two services from the same backend repo:

1. Web service:
   - Start command: `uvicorn main:app --host 0.0.0.0 --port 8000`
   - Set all backend env vars from `backend/.env.example`
2. Worker service:
   - Start command: `python worker.py`
   - Set the same env vars as web service

`backend/Procfile` is included with both process definitions.

## 9. Vercel Deployment

1. Deploy the `frontend/` directory to Vercel.
2. Set environment variables in Vercel:
   - `NEXT_PUBLIC_API_BASE_URL=https://your-railway-web-service-url`
   - `NEXT_PUBLIC_SUPABASE_URL=...`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY=...`
