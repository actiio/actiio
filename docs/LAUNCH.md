# Launch Checklist

- [ ] Supabase: schema.sql fully applied including Cashfree columns
- [ ] Supabase: RLS policies active on all tables
- [ ] Cashfree: App ID and Secret Key configured in env vars
- [ ] Cashfree: reusable plan created and CASHFREE_PLAN_ID configured
- [ ] Cashfree: CASHFREE_RETURN_URL configured to the frontend agents page
- [ ] Cashfree: webhook endpoint registered at https://yourdomain.com/api/cashfree/webhook
- [ ] Cashfree: payment order and subscription webhook events enabled
- [ ] Railway web service: all env vars set (including CASHFREE_APP_ID, CASHFREE_SECRET_KEY, CASHFREE_PLAN_ID, CASHFREE_RETURN_URL, CASHFREE_ENV=production)
- [ ] Railway worker service: all env vars set
- [ ] Vercel: NEXT_PUBLIC_API_BASE_URL set to Railway web service URL
- [ ] Vercel: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY set
- [ ] Google Cloud: OAuth redirect URI updated to production Railway URL
- [ ] Google Cloud: Pub/Sub push subscription URL updated to production Railway URL
- [ ] Cashfree: switch from sandbox to production (CASHFREE_ENV=production)
- [ ] End to end test: sign up -> subscribe -> authorize payment -> webhook fires -> onboard -> connect Gmail -> receive draft -> approve -> send
