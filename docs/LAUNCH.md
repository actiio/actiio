# Launch Checklist

- [ ] Supabase: schema.sql fully applied including stripe_customer_id column
- [ ] Supabase: RLS policies active on all tables
- [ ] Stripe: product and price created in Stripe dashboard
- [ ] Stripe: STRIPE_PRICE_ID copied from Stripe dashboard
- [ ] Stripe: webhook endpoint registered at https://yourdomain.com/api/stripe/webhook
- [ ] Stripe: webhook events enabled: checkout.session.completed, customer.subscription.deleted, invoice.payment_failed
- [ ] Railway web service: all env vars set
- [ ] Railway worker service: all env vars set
- [ ] Vercel: NEXT_PUBLIC_API_BASE_URL set to Railway web service URL
- [ ] Vercel: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY set
- [ ] Google Cloud: OAuth redirect URI updated to production Railway URL
- [ ] Google Cloud: Pub/Sub push subscription URL updated to production Railway URL
- [ ] Stripe: switch from test mode keys to live mode keys before real users
- [ ] End to end test: sign up -> subscribe -> onboard -> connect Gmail -> receive draft -> approve -> send
