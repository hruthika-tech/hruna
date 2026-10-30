# Designer plans: deployment notes

**Model:** customers use HRUNA for free. Designers choose one of three plans:

- Free: ₹0
- Designer Plus: ₹199/month
- Designer Pro: ₹299/month

There are no commissions.

None of the migrations below has been applied to the hosted project. Review them and apply them in order. The hosted database was last seen at `20261020000001`, so don't assume it matches local.

| # | Migration | Needs | What it does |
|---|-----------|-------|--------------|
| 1 | `20261021000001_lock_completed_project_progress.sql` | — | Project progress locks once a project is complete. |
| 2 | `20261022000001_proposal_race_and_completion_workflow.sql` | 1 | Proposal race guard and the completion workflow. |
| 3 | `20261023000001_project_withdrawn_status.sql` | 2 | Adds the `withdrawn` project status. |
| 4 | `20261023000002_request_deletion_and_project_withdrawal.sql` | 3 | Request deletion and project withdrawal. |
| 5 | `20261028000001_designer_analytics.sql` | — | Analytics events and the `designer_analytics()` function. |
| 6 | `20261029000001_designer_subscription_plans.sql` | — | Plan columns, the three plans, triggers that enforce limits, entitlements, the trial, and retiring the old plans. |
| 7 | `20261029000002_designer_analytics_plan_limits.sql` | 5 and 6 | Limits analytics history and comparisons by plan. |

## What migration 6 changes in data

- **New plan rows:** it adds Free, Designer Plus and Designer Pro, keyed by `plan_key`. A unique index on `plan_key` blocks a second copy of any plan. Like every migration here it runs once; it is not written to be re-run.
- **Old ₹499 designer plan:** it is set to `is_active = false`. The row stays, along with its payments and subscriptions. A designer with a running subscription on it keeps Pro-level access until that subscription ends.
- **Old customer plan:** the row is not touched and is not deleted. The app no longer sells it:
  - the checkout API refuses `role: "customer"`;
  - the admin API refuses `customerSubscriptionsEnabled: true`;
  - customer routes are never gated.
- **Columns:** none are dropped. `payment_settings.customer_subscriptions_enabled` remains but has no effect. Admins can still turn it off.

## Settings

Designer limits apply only when both `payment_system_enabled` and `designer_subscriptions_enabled` are true. The admin sets these under **Admin → Subscriptions & Payments**. With either switch off, nobody is limited and nothing is sold.

## Deploy order

Code and migrations can ship in either order:

- **Before the migrations:** the new code detects that the plan functions and columns are missing. It then behaves as before plans existed: no limits, no trial, no checkout. The admin page shows a "plans aren't set up yet" notice.
- **After the migrations:** the new code works as designed.
- **Old code with the new migrations:** the old code still gates customers and designers while `payment_system_enabled` is on. So deploy the code before switching payments on.

## Types

`types/supabase.ts` has not been regenerated. That file also carries uncommitted project-withdrawal work. Until it is regenerated against a database with these migrations applied, the plan columns and functions are accessed through untyped clients.
