# Actiio Monorepo Structure (Phase 1-5)

```text
.
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── deps.py
│   │   │   ├── routes_auth.py
│   │   │   ├── routes_business_profile.py
│   │   │   ├── routes_gmail.py
│   │   │   ├── routes_health.py
│   │   │   ├── routes_cashfree.py
│   │   │   ├── routes_threads.py
│   │   │   └── router.py
│   │   ├── core/config.py
│   │   ├── core/supabase.py
│   │   ├── middleware/subscription.py
│   │   └── main.py
│   ├── integrations/gmail/
│   │   ├── auth.py
│   │   ├── parser.py
│   │   ├── sender.py
│   │   ├── sync.py
│   │   └── webhook.py
│   ├── pipeline/
│   │   ├── silence_detector.py
│   │   ├── thread_loader.py
│   │   ├── classifier.py
│   │   ├── draft_generator.py
│   │   └── notifier.py
│   ├── supabase/schema.sql
│   ├── tests/
│   │   ├── test_pipeline.py
│   │   ├── test_gmail.py
│   │   └── test_classifier_business_context.py
│   ├── .env.example
│   ├── Procfile
│   ├── main.py
│   ├── requirements.txt
│   └── worker.py
├── frontend/
│   ├── app/
│   │   ├── (auth)/sign-in/page.tsx
│   │   ├── (auth)/sign-up/page.tsx
│   │   ├── (protected)/dashboard/page.tsx
│   │   ├── onboarding/page.tsx
│   │   ├── pricing/page.tsx
│   │   ├── settings/page.tsx
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── auth-form.tsx
│   │   ├── sign-out-button.tsx
│   │   ├── dashboard/
│   │   ├── onboarding/
│   │   ├── settings/
│   │   └── ui/
│   ├── lib/
│   │   ├── api.ts
│   │   ├── supabase.ts
│   │   ├── types.ts
│   │   └── utils.ts
│   ├── middleware.ts
│   ├── .env.example
│   ├── package.json
│   └── vercel.json
├── docs/
│   ├── LAUNCH.md
│   ├── SETUP.md
│   └── STRUCTURE.md
└── README.md
```
