# Razorpay — Live Mode go-live checklist

**Do not start until** the Test Mode run in `RAZORPAY_TEST_SETUP.md` has passed end to end, and each
step below has explicit approval. Do the steps in order. Payments stay switched **off** until step 7.

## 1. Pre-flight (read-only)

- [ ] Hosted database backup taken (Supabase Dashboard → Database → Backups, or `pg_dump`).
- [ ] No duplicate Razorpay payment ids. The migration adds a unique index and fails if any exist:
      `select provider_reference, count(*) from payments where provider_reference is not null group by 1 having count(*) > 1;`
      Expected: no rows.
- [ ] Payment switches confirmed off: `select payment_system_enabled, designer_subscriptions_enabled from payment_settings;`
- [ ] Plans confirmed: Designer Plus ₹199 INR and Designer Pro ₹299 INR, both active.

## 2. Production database migration

- [ ] `npx supabase db push --dry-run` lists **only** `20261101000001_payment_hardening.sql`.
- [ ] Apply it (`npx supabase db push`) after approval.
- [ ] Verify:
      `select to_regclass('public.payment_events');` returns the table, and the three functions
      `activate_designer_payment`, `record_payment_failure`, `apply_payment_refund` exist and are
      executable by `service_role` only.
- [ ] (Optional) regenerate `types/supabase.ts`.

## 3. Razorpay Live account settings

- [ ] KYC approved (done).
- [ ] Account & Settings → Payment capture → **automatic capture on**. HRUNA never captures payments itself.
- [ ] Live API key generated (`rzp_live_…`). Store the secret only in Vercel (step 4), never in a file or chat.

## 4. Vercel — Production environment only

| Variable | Value | Scope |
|---|---|---|
| `RAZORPAY_KEY_ID` | `rzp_live_…` | Production only |
| `RAZORPAY_KEY_SECRET` | Live key secret | Production only, marked Sensitive |
| `RAZORPAY_WEBHOOK_SECRET` | new random value, used only for the Live webhook | Production only, Sensitive |

- [ ] Preview and Development keep **Test** keys (or none). Never Live.
- [ ] `RAZORPAY_API_BASE_URL_FOR_TESTS` is **not set** in any Vercel environment.
- [ ] No `NEXT_PUBLIC_RAZORPAY_*SECRET` variable exists anywhere.
- [ ] A redeploy is needed for env changes to take effect.

## 5. Deploy the code

- [ ] Hardening changes reviewed, committed and pushed (after approval). The branch auto-deploys to Vercel.
- [ ] Production build succeeds; `/api/payments/webhook` responds `400` to an unsigned POST.

## 6. Live webhook

Dashboard in **Live Mode** → Account & Settings → Webhooks → *Add New Webhook*:

- [ ] URL: `https://<production domain>/api/payments/webhook`
- [ ] Secret: the Live `RAZORPAY_WEBHOOK_SECRET` from step 4.
- [ ] Events: `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`.
- [ ] Alert email set.

## 7. Switch payments on

- [ ] Admin → Payment settings → payment system **on**, designer subscriptions **on**.
- [ ] Customer subscriptions stay off. Customers are always free, and the app refuses this switch.

## 8. Controlled first real transaction

With a designer account the team controls:

- [ ] Buy **Designer Plus (₹199)** with a real card or UPI.
- [ ] App: plan shows Designer Plus, active until 30 days from now.
- [ ] DB: payment `succeeded` with `provider_reference` set; subscription `end_date - start_date = 30 days`;
      `payment_events` has `payment.captured` / `order.paid` with status `processed`.
- [ ] Razorpay Dashboard: payment **Captured**, webhook deliveries **200**.
- [ ] Issue a **full refund** in the Dashboard: payment becomes `refunded`, the plan ends, and the designer is back on Free.
- [ ] Optionally repeat for Designer Pro (₹299).

## Rollback

1. Admin → Payment settings → payment system **off**. Checkout stops immediately.
2. Disable the Live webhook in Razorpay if the issue is webhook-related.
3. The migration only adds objects. Leave it in place; nothing depends on reverting it.
4. Refund any affected payment from the Razorpay Dashboard. The refund webhook updates access.

## Ongoing monitoring

```sql
select event_type, status, error, count(*) from payment_events where received_at > now() - interval '1 day' group by 1,2,3;
select id, provider_order_id, status, failure_reason from payments where status in ('pending','failed') and created_at < now() - interval '1 hour';
```

`rejected` or `failed` events, and old `pending` payments that Razorpay shows as captured, need a look.
