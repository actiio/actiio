# Adding New Agents to Actiio

To add a new agent to Actiio:

## Step 1 — Database

```sql
INSERT INTO agents (id, name, description, icon, status, sort_order)
VALUES ('new_agent', 'Agent Name', 'Description', '🆕', 'active', 5);
```

## Step 2 — Backend

Create:

```text
backend/pipeline/new_agent/
  __init__.py
  classifier.py
  draft_generator.py
  silence_detector.py
  notifier.py
```

Create:

```text
backend/app/api/routes_new_agent.py
```

Wire it into [router.py](/Users/jishma/follow-up-agent/backend/app/api/router.py) and add `'new_agent'` to `ACTIVE_AGENTS` in [worker.py](/Users/jishma/follow-up-agent/backend/worker.py).

## Step 3 — Frontend

Create:

```text
frontend/app/agents/new_agent/
  dashboard/page.tsx
  onboarding/page.tsx
  settings/page.tsx
```

The agent will appear automatically in `/agents` from the `agents` table.

## Step 4 — Stripe

Create the product and prices in Stripe, then update the agent row:

```sql
UPDATE agents
SET stripe_free_price_id = 'price_xxx',
    stripe_pro_price_id = 'price_yyy'
WHERE id = 'new_agent';
```
