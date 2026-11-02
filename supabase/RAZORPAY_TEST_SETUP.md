# Razorpay — Test Mode setup (keys + webhook)

For running a real Razorpay **Test Mode** checkout against HRUNA. No money moves in Test Mode.
Nothing here touches production. Live setup is a separate document: `RAZORPAY_LIVE_CHECKLIST.md`.

## 1. Test API keys

1. Razorpay Dashboard → switch the toggle to **Test Mode** (top of the dashboard).
2. Account & Settings → **API Keys** → *Generate Test Key*.
3. Copy the **Key Id** (starts with `rzp_test_`) and the **Key Secret** (shown once).

Put them only in the local app's `.env.local` (git-ignored), never in source, never with a
`NEXT_PUBLIC_` prefix:

```
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...   # see step 3
```

Never put Live keys (`rzp_live_`) in `.env.local` or in Vercel Preview.

## 2. Database for testing: never the hosted project

The repo's `.env.local` currently points `NEXT_PUBLIC_SUPABASE_URL` at the **hosted (production)**
Supabase project. A Test Mode checkout run from it would write test payments and subscriptions
into production. Run Test Mode against the local stack instead:

```
npm run db:start && npm run db:reset
# .env.local → NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 + the local anon/service keys
#              (from `npx supabase status`), plus the Test keys above
npx next dev -p 3100
```

Turn payments on locally in Admin → Payment settings (payment system + designer subscriptions).

## 3. Test webhook

Endpoint path: **`/api/payments/webhook`** (POST, raw JSON body, `x-razorpay-signature` header).

Razorpay must reach the URL over **public HTTPS**, so `localhost` cannot be registered directly.
Options, all needing approval before use:

- **A tunnel to the local app** (e.g. a temporary HTTPS tunnel to `http://127.0.0.1:3100`). Keeps the
  local database. This is the safest option.
- **A Vercel Preview URL** — only if that Preview deployment uses a **non-production** Supabase
  project and Test keys. Check which Supabase project the Preview environment uses first; if it is
  the production project, this option isn't safe. Vercel Deployment Protection would also block Razorpay's requests unless
  a protection bypass is configured.

In the Dashboard (still in **Test Mode**) → Account & Settings → **Webhooks** → *Add New Webhook*:

| Field | Value |
|---|---|
| Webhook URL | `https://<tunnel-or-preview-host>/api/payments/webhook` |
| Secret | a new random value (e.g. `openssl rand -hex 32`); same value in `RAZORPAY_WEBHOOK_SECRET` |
| Active events | `payment.captured`, `payment.failed`, `order.paid`, `refund.processed` |
| Alert email | the team inbox |

Use a different secret from the one the Live webhook will use.

## 4. Payment capture setting

HRUNA never captures payments itself. It activates a plan only for a **captured** payment. In
the Dashboard → Account & Settings → **Payment capture**, make sure **automatic capture** is on
(Test and Live). If it's off, payments stay `authorized`, no plan activates, and Razorpay
auto-refunds them later.

## 5. What to test (and what the app should do)

| Scenario | Expected |
|---|---|
| Designer buys Plus | Order for ₹199 (19900 paise); after paying, plan active for exactly 30 days |
| Designer buys Pro | Order for ₹299 (29900 paise); same |
| Pay with the success test card / UPI | `/api/payments/verify` → 200; payment `succeeded`; webhook `payment.captured` logged `processed` in `payment_events` |
| Pay with a failing test method, then retry in the same checkout | First attempt recorded `failed`; the retry activates the plan |
| Close Checkout without paying | No plan; payment row stays `pending`; buying again works |
| Webhook redelivered (Dashboard → Webhooks → resend) | `{"duplicate":true}`; nothing changes |
| Full refund from the Dashboard | `refund.processed` → payment `refunded`; that payment's 30 days removed |
| Partial refund | Amount recorded; access unchanged |

Useful checks (local database only):

```sql
select status, provider_order_id, provider_reference, amount, refunded_amount, failure_reason from payments order by created_at desc limit 5;
select event_type, status, error, received_at from payment_events order by received_at desc limit 10;
select status, start_date, end_date, end_date - start_date as length from user_subscriptions where role = 'designer' order by created_at desc limit 5;
```

## 6. Automated suites (no Razorpay account needed)

`scripts/test-payments-hardening.mjs` runs the same flows against a local mock Razorpay API. The
app must run with `RAZORPAY_API_BASE_URL_FOR_TESTS=http://127.0.0.1:55690/v1`. The app honours it
only with a `rzp_test_` key, outside production builds, on a loopback address. Never set it in Vercel.
