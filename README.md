# LILIRVE — Customer + Designer Journeys (Phase 1 + 2 + Data Consistency Fixes)

A Next.js 14 (App Router) + TypeScript + Tailwind frontend for LILIRVE, a premium fashion
marketplace connecting customers with verified designers, boutiques and tailors.

This delivery covers the **complete customer journey (Phase 1)**, the **complete designer
core journey (Phase 2)**, and a **data-architecture correction pass** that replaces
disconnected demo arrays with one shared client-side store — so a request the customer
submits is the exact same object the designer sees, accepts, and turns into a project.

## Getting started

```bash
npm install
npm run dev
```

Then open https://hruna.in .

> This project was written directly (no `npm install` was run in the build sandbox, which
> has no network access) — install locally to run and verify it. If you hit a dependency
> resolution issue, run `npm install --legacy-peer-deps`.

## Data-consistency correction (this delivery)

Earlier phases had customer requests, designer requests, and project data living in separate
static arrays with no real connection between them. This pass replaces that with:

- **`lib/seed-data.ts`** — pure initial data, never mutated directly. Includes one fully
  consistent demo chain: `req-1` ("Pastel Silk Reception Gown") → `prop-1` → `proj-1`, so the
  exact same title/budget/fabric/description/measurements can be traced from the customer's
  original submission through the designer's inbox, the accepted proposal, and the project
  workspace. Also includes `req-2` (a fresh, unclaimed request) so the designer swipe feed
  has something to discover on first load.
- **`lib/store.ts`** — the single shared state tree (designers, collections, dresses,
  previous creations, requests, proposals, projects, conversations), with reactive hooks
  (`useRequestByIdLive`, `useProjectByIdLive`, etc.) for pages that must update immediately
  without a navigation, plain snapshot getters for read-only pages, and typed actions for
  every mutation — `addRequest`, `addProposal`, `acceptProposal` (which builds the Project
  **directly from** the request + proposal that already exist, never a hand-typed copy),
  `addProjectUpdate`, `setProjectStage`, `sendMessage`, `getOrCreateConversation`, and the
  full Manage Studio CRUD set.
- **`lib/mock-data.ts`** — trimmed to only genuinely static/session data (the logged-in
  customer and designer, earnings, reviews), re-exporting the store's accessor functions
  under their original names so most pages needed no import-path changes.

Concretely, this fixes:
- The customer request form now calls `addRequest(...)`, so a submitted request actually
  appears in the designer's Home feed and My Requests — using the customer's exact field
  values, not a second hard-coded version.
- **Designer Home** is now a Tinder-style swipeable discovery feed (drag, or use the ✕ / view
  / ♥ buttons) reading live from the shared request pool, filtered to requests not yet
  addressed to another designer.
- Accepting a proposal (checkout) calls `acceptProposal(...)`, which creates the Project
  from that same request + proposal and routes to the real new project — not a hardcoded id.
- Designer and customer **Project Workspaces** read the same live project; progress updates,
  stage changes, edits and deletes all go through store actions so both sides see the same
  state.
- **Messages** are shared `Conversation` objects — the designer's "Message Customer" button
  and the customer's "Open Chat" button both resolve to the same conversation via
  `getOrCreateConversation`, and deep-link to it with `?conversationId=`.
- **Manage Studio** edits (highlights, meet-the-designer, collections/dresses, previous
  creations, contact info) mutate the shared designer record, so My Studio and the public
  customer-facing Studio page reflect them immediately. The "View as Customer" button has
  been removed from My Studio per the correction brief.

## What's included (Phase 2 — designer journey, new in this delivery)

- **Auth flow correction**: account creation no longer routes straight into customer
  onboarding. After OTP verification, `/choose-role` lets the person pick "Commission
  Fashion" (customer) or "Showcase My Craft" (designer) — role selection happens *after*
  the account exists, per the spec.
- **Designer onboarding**: professional info (type, experience, specializations) → studio
  details → portfolio upload → verification document upload, ending in a submit-for-review
  step.
- **Verification states**: `/verification-pending` and `/verification-rejected` (with a
  resubmit path back into onboarding). A designer cannot claim "verified" status themselves.
- **Designer app shell**: separate `DesignerNavbar` and `(designer)` route group, visually
  consistent with the customer shell.
- **Designer Home/Feed**: stat cards (new requests, active projects, available earnings),
  incoming requests and active projects at a glance.
- **Requests inbox**: status-tab list → request detail with customer info, full requirements,
  Save/Like/Decline/Message actions, and a "Send Proposal" form (price, estimated days,
  description, notes) that posts inline.
- **My Studio** (designer's own view, with a "Manage Studio" entry point and a "View as
  Customer" link into the public studio page) and **Manage Studio** — a full CRUD-style
  interface across five tabs: Highlights (max 3), Meet the Designer (max 2), Collections →
  Dresses (add/edit/delete at both levels), Previous Creations, and Studio Info.
- **Project Workspace (designer view)**: same design-details/timeline layout as the customer
  workspace, plus the ability to add/edit/delete progress updates (stage + note + images),
  which updates the visible progress percentage.
- **Messages, Reviews, Earnings, Profile & Settings** — designer-side equivalents,
  each reusing the same component library. Earnings includes total/pending/available splits,
  a transaction list with commission shown, and payout history. Settings surfaces
  verification status and payout bank details; "Manage Studio" is only reachable from the
  designer's own profile/studio, never from the public studio page.

## What's included (Phase 1 — customer journey)

- **Design system**: Tailwind tokens for color, type (Playfair Display + DM Sans), spacing,
  radius and shadow (`tailwind.config.ts`, `app/globals.css`), plus a shared component
  library in `components/ui` (Button, Card, Input, Badge/StatusBadge, Avatar, Tabs, Modal,
  Toast, ProgressBar/Stepper/Timeline, ImageUploader, Rating).
- **Public**: Landing page, Designer Discovery (search + filters), Public Designer Studio
  (view-only), Collection Details, Dress Details.
- **Auth**: Create Account → OTP verification (with resend/invalid/expired states) → Login →
  Forgot Password. Account creation never asks for a role up front, per the LILIRVE spec.
- **Customer onboarding**: multi-step profile, location, style-preference flow.
- **Customer home**: editorial discovery dashboard (recommended designers, collections,
  dresses).
- **Fashion Request**: 5-step request form (basics → measurements → inspiration images →
  fabric/budget → review) with working image upload/preview/remove.
- **My Requests**: status-tab filtered list → Request Details → Proposal review → Accept/
  Decline (with confirmation modal) → Checkout.
- **Payment**: full checkout simulation with processing/successful/failed/retry states and
  a receipt-style order summary (commission line included, ready to wire to a real gateway).
- **My Projects → Project Workspace**: timeline, stage-based progress updates with images,
  measurements/design details, and a link into Messages.
- **Messages**: conversation list + live chat (sending updates local state).
- **Notifications**: click-through to the relevant screen, with read/unread state.
- **Fashion Diary**: private creative journal with mood tags, image uploads, and a
  card → detailed entry view (edit/delete included).
- **Profile & Settings**: personal details, security, notifications, privacy tabs.

## Designer verification & onboarding system

Replaced the old single `verified: boolean` / `verificationStatus` model with a proper
three-track state machine, matching the product requirement that identity, portfolio, and
overall profile review are independent facts:

- **`IdentityStatus`**: `not_started` → `pending` → `verified` | `failed` | `requires_action`
- **`PortfolioStatus`**: `not_submitted` → `submitted` → `under_review` → `approved` |
  `rejected` | `revision_required`
- **`OverallProfileStatus`**: `draft` → `submitted` → `under_review` → `verified` | `rejected`
  | `suspended`

No formal fashion degree is ever required — `LearningBackground` includes self-taught,
apprenticeship, and family/business alongside formal education, and none of them gate
approval. Optional credentials (degree/diploma/certification) can be attached but are never
required.

**Onboarding** (`/designer-onboarding`) is a real 8-step flow — Account (phone OTP) →
Professional Profile → Experience → Portfolio (min. 3 items + an explicit ownership
declaration) → Identity (DOB + a simulated KYC hand-off) → Studio (writes directly into the
same `Designer` record Manage Studio already edits — no duplicate studio system) → Review →
Submit. Every step persists to the shared store as it's completed, so back/forward
navigation or a page refresh never loses data.

**Admin area** (`/admin/verification`, `/admin/designers/[id]`) — a queue listing every designer's
verification status, and a review page with Approve/Reject/Request-Revision actions for
portfolio, Verify/Fail for identity, and Approve/Reject/Suspend for the overall profile.
Rejections and revisions require a reason, which the designer sees verbatim. Every admin
action is appended to a lightweight audit log. Approving the overall profile is *guarded in
the store function itself* — it's impossible to approve a profile whose identity isn't
verified or whose portfolio isn't approved, matching the required approval logic.

**Trusted Professional** is computed on the fly from identity + portfolio status + completed
project count + rating (thresholds live in one `TRUSTED_PROFESSIONAL_CRITERIA` constant in
`lib/store.ts`) — it is never a stored, directly-settable field, so it can't be awarded at
registration and can't drift out of sync with reality.

**Important honesty note**: this is a frontend-only Next.js app with an in-memory client-side
store — there is no real backend, database, authentication, or KYC provider here. Every
function prefixed `admin` in `lib/store.ts` is the *only* place that can move a status to an
approved/verified/rejected state, and no designer-facing page calls one of those functions —
but that separation is enforced by convention in this codebase, not by real server-side
authorization. **A production deployment must move every `admin`-prefixed function to
authenticated, role-checked backend endpoints** — a determined user could otherwise open the
browser console and call these functions directly. The three-state data model, the UI flows,
and the approval-guard logic are all correct and reusable; the missing piece is a real server.

## Completing the site — Saved Items, admin expansion

Closed out several gaps left over from earlier phases:

- **Saved Items** (`/saved`) — previously promised in the original spec but never built. Customers
  can now heart a designer (Discover/Home cards), a dress, or a collection, and pin a project
  from its workspace; all four show up in tabbed buckets on `/saved`, resolved live from the
  same designer/dress/collection/project records used everywhere else — no separate "saved"
  copies of the data. Added a reusable `SaveToggleButton` component and a `Heart` icon in the
  customer nav for quick access.
- **Admin, expanded beyond verification**: added a nav (`Verification Queue` / `Users` /
  `Subscriptions & Payments`) to the admin shell and a Users page listing every designer with
  quick suspend/reinstate (reusing the existing `adminSuspendProfile`/`adminApproveProfile`
  guards — reinstating still requires identity verified + portfolio approved, same as initial
  approval).

A standalone **Moodboard** feature (`/moodboard`) was briefly added in this phase as an
image/note/color board, but it duplicated the customer's existing **Fashion Diary** (`/diary`) —
same job (collecting inspiration images, notes, references) via a second UI and a second store
slice. It has since been removed: the route, its store slice (`moodboardItems`) and actions
(`addMoodboardItem`/`deleteMoodboardItem`/`getMoodboardItemsForCustomer`), the `MoodboardItem`
type, and every nav link/dashboard teaser pointing at it. Fashion Diary remains the one place
customers collect inspiration — nothing was added in Moodboard's place.

A social-media-style **Community** feature (customer feed at `/community`, designer content
management at `/designer/community`, and admin moderation at `/admin/community`) was also built
in this phase — posts, likes, and a lightweight follow toggle — then deliberately removed as a
product decision: LILIRVE isn't a social network, and a designer's work belongs in **My Studio**
(Highlights, Meet the Designer, Collections, Dresses, Previous Creations, Reviews), not in a post
feed. Removed entirely: all three routes, the `communityPosts` store slice and every action on it
(`addCommunityPost`/`updateCommunityPost`/`deleteCommunityPost`/`toggleCommunityPostLike`/
`adminHideCommunityPost`/`adminRestoreCommunityPost`), the `CommunityPost` type, the "Community"
nav items (customer nav, designer nav, admin nav), and the Community teaser sections on the
landing page and customer home page. Nothing was added in its place — designer discovery still
runs entirely through Discover → Studio → Collections/Previous Creations/Reviews → Request, and a
designer's external Instagram/social link (already collected during onboarding as
`instagramUrl`) can simply point off-platform, exactly as before.


## Subscription / payment architecture (off by default)

Built the full monthly-subscription architecture for both customer and designer roles,
**disabled by default** — nothing here charges anyone or blocks access until an admin
explicitly turns it on.

- **`PaymentSettings`** (`lib/seed-data.ts` → `lib/store.ts`) is the master config:
  `paymentSystemEnabled: false` at seed, plus independent `customerSubscriptionsEnabled` /
  `designerSubscriptionsEnabled` flags and a platform `currency`. `isSubscriptionRequiredForRole(role)`
  is the single source of truth for "does this role need to pay right now" — false whenever
  either the global switch or that role's switch is off.
- **`SubscriptionPlan`** — one editable plan per role (`plan-customer-monthly`,
  `plan-designer-monthly`), with name/price/currency/description/features/isActive, all
  admin-editable from `/admin/subscriptions`. Nothing about the price is hardcoded in any
  page — every page reads `plan.price` live.
- **Access control**: `hasActiveSubscriptionAccess(userId, role)` (and its reactive twin
  `useHasActiveSubscriptionAccessLive`) is the actual gate. A new `<SubscriptionGate>`
  component wraps the customer and designer app layouts — when access is allowed (which is
  always true while the system is off), it's a no-op passthrough; when it's not, it renders a
  paywall screen instead of the page. Admin routes live outside both gated route groups
  entirely, so admins always retain access, per the spec.
- **`lib/payment-service.ts`** — the seam for a real provider (Razorpay/Stripe). It exposes
  exactly the methods requested (`createCheckout`, `verifyPayment`, `createSubscription`,
  `cancelSubscription`, `handleWebhook`); right now they're safe, storage-only mocks with a
  security note at the top of the file spelling out what a real backend must add before going
  live (secret keys server-side only, webhook signature verification, never trusting a
  frontend "success" response).
- **Subscription pages** live at the top level (`/subscription`, `/designer-subscription`) —
  deliberately *outside* the gated layouts, so the page that lets someone subscribe can never
  itself be paywalled. Both reuse one `<SubscriptionPageContent>` component. Reachable from
  Profile → "Manage Subscription" on both sides even while the system is off.
- **Admin panel** (`/admin/subscriptions`) — the master switch, per-role toggles, currency
  selector, both plan editors, active/expired/cancelled subscription counts, and a full
  Payment Transactions section (filters, today/month/total/per-role revenue summary) covered
  in the admin panel section below.

**What's left to connect for a real payment gateway**: everything inside
`lib/payment-service.ts`'s method bodies needs to move to a real backend endpoint that calls
Razorpay/Stripe directly, verifies webhooks with the provider's signing secret, and only then
calls the same `createUserSubscription`/`recordPayment` functions this mock version already
calls. The subscription/access-control logic and every UI surface stay exactly as they are —
only the inside of those five methods changes.

## Completing the admin panel — Dashboard, payment monitoring, disputes, notifications, settings

Audited what already existed (Verification Queue, Users, Subscriptions & Payments — all kept,
none rebuilt) before adding the pieces that didn't: a real overview dashboard, transaction-level
payment monitoring, Reports & Disputes, platform Notifications, and Admin Settings. Nothing here
duplicates a route, nav item, or store slice that already existed.

- **Dashboard** (`/admin`) — this URL used to *be* the Verification Queue (mislabeled as a
  "dashboard" in its own header). That list moved, unchanged, to its own route,
  **`/admin/verification`** (the nav item, the "Verification Queue" label, and every link to it
  — including the back-link on `/admin/designers/[id]` — now point there). `/admin` is now a
  genuine overview: 9 stat cards (customers, designers, verified/pending designers, active/
  completed projects, active subscriptions, monthly revenue, pending disputes), a Recent
  Activity feed, and a 6-month revenue bar chart — all computed live from the existing store
  (requests, projects, verifications, subscriptions, payments, disputes), nothing hardcoded or
  duplicated into a separate "activity log."
- **Payment Transactions** — added as its own clearly-separated section *inside*
  `/admin/subscriptions` (not a new top-level page/nav item, per the instruction not to fork the
  existing Subscriptions & Payments architecture): Transaction ID, user + user type
  (customer/designer, resolved by lookup — no new field needed), payment type (derived from the
  plan's role), amount, status, and date, with All/Successful/Pending/Failed/Refunded filters and
  a Today/Month/Total/Customer-revenue/Designer-revenue summary row. `StatusBadge`'s shared
  status→tone map (`components/ui/Badge.tsx`) gained the payment and dispute statuses so this
  reuses the same badge component every other status pill in the app uses. Backed by
  `seedUserSubscriptions`/`seedPayments` — realistic historical records (a mix of
  succeeded/pending/failed/refunded, tied to the same designers who already appear in
  Verification/Users/Projects) so the monitoring view has real numbers to show even though the
  live payment system is off by default.
- **Reports & Disputes** (`/admin/disputes`) — new `Dispute`/`DisputeNote` types and store slice.
  Status only ever moves forward through Open → Under Review → Resolved → Closed (one contextual
  action button at a time — no illegal jumps). Each dispute shows the customer, designer, related
  project, issue, evidence/details, and a running list of timestamped admin notes that can only
  be added to, never edited/deleted, so the history stays honest. Seeded with 4 realistic
  disputes across all four statuses, tied to the real cust-1 and des-1..4 records. There's
  deliberately no customer/designer-facing "file a dispute" flow yet — see the note on the
  `Dispute` type for why.
- **System Notifications** (`/admin/notifications`) — new `AdminNotification` type/store slice
  for platform-wide announcements (title, message, audience: all/customers/designers), with a
  compose form and a history list. This is separate from the per-user activity notifications
  customers/designers already see on `/notifications` (proposal received, new message, etc.) —
  those pages are untouched local mock state, out of scope here; wiring an admin announcement
  into those inboxes is future backend work.
- **Admin Settings** (`/admin/settings`) — admin profile fields (name/email, local state, matches
  the same save-shows-a-toast pattern the customer/designer Personal Details tabs already use),
  a password section explicitly presented as a disabled placeholder (there's no real admin
  account to change a password for yet — see the RBAC note below), a live read-only summary of
  the payment settings with a shortcut into `/admin/subscriptions` to actually change them, and a
  short explanation of the store-backed architecture.
- **Customer detail page** (`/admin/customers/[id]`) — designers already had one
  (`/admin/designers/[id]`); customers didn't. Mirrors it at a simpler scale (no verification
  workflow to show): contact info, project list with counts, subscription, Fashion Diary/saved-item
  counts, and Suspend/Reactivate. New `Customer.status` field (`"active" | "suspended"`, optional)
  and `adminSuspendCustomer`/`adminReactivateCustomer` store actions, mirroring the designer
  suspend pattern exactly.
- **Users page** — kept the existing customer card and designer list; added the fields the spec
  called out that weren't there yet (registration date, subscription status, active/completed
  project counts, rating was already shown), a "View" link to the profile detail page for both
  sides, and search + status filters for the designer list (skipped for the single seeded
  customer — a filter/search bar over one row has nothing to do). Suspend on both sides now goes
  through a confirmation modal instead of firing instantly (the designer detail page's
  reason-required modal already served as one; the Users *list* row didn't have one before).
- **`Customer.joinedAt` / `Designer.joinedAt`** — added (optional) so "registration date" is a
  real seeded field instead of a fabricated display string, and so the Dashboard's "new
  customer/designer registered" activity items are computed from real data.
- **Admin nav** — now `Dashboard / Verification Queue / Users / Subscriptions & Payments /
  Reports & Disputes / Notifications / Admin Settings`, exactly seven items, no duplicates. The
  admin header previously had no mobile nav at all (`hidden sm:flex` with nothing else) — with
  seven items that gap was no longer acceptable, so it now gets the same full-screen slide-in
  mobile menu pattern the customer/designer navbars already use.

**RBAC note (unchanged from before, now applies to the new sections too)**: this remains a
frontend-only prototype — no real backend, database, or authenticated admin session. Every
`admin`-prefixed function in `lib/store.ts` (including the new `adminSuspendCustomer`,
`adminUpdateDisputeStatus`, `sendAdminNotification`, etc.) is the *only* place that moves that
kind of state, and no customer/designer-facing code path calls one — but, exactly as documented
above for verification, that separation is enforced by convention in this codebase, not by real
server-side authorization. `UserRole` (`"customer" | "designer" | "admin"`) already exists in
`types/index.ts` for exactly this purpose but isn't wired to anything yet. **A production
deployment must put every `admin`-prefixed function behind an authenticated, role-checked backend
endpoint** (and add real route-level middleware/session checks in front of every `/admin/*`
page) — nothing here fakes that protection on the frontend.

## What's deliberately stubbed / not yet built

Full-site responsive/accessibility polish pass, a real payments/delivery-tracking system
(deliberately out of scope per the business-model correction — LILIRVE connects people, it
doesn't process money), and real backend/auth/KYC infrastructure (see the verification system
section above) remain as follow-up work. The admin area covers verification, users, and
subscriptions; a reports/disputes workflow is not yet built. The architecture (`types/`,
`lib/store.ts`, the shared component library) is built so those layer on without reworking
what's already here.

## Project structure

```
app/
  page.tsx                 → landing page
  login/, create-account/, verify-otp/, forgot-password/  → shared auth
  choose-role/              → post-verification role selection (customer vs designer)
  onboarding/               → customer onboarding
  designer-onboarding/       → designer onboarding
  verification-pending/, verification-rejected/
  (app)/                    → authenticated customer shell (Navbar)
    home/, discover/, studio/[id]/, collections/[id]/, dresses/[id]/
    requests/, requests/new/, requests/[id]/
    checkout/[id]/
    projects/, projects/[id]/
    messages/, notifications/, profile/, diary/, diary/[id]/
  (designer)/               → authenticated designer shell (DesignerNavbar)
    designer/home/, designer/requests/, designer/requests/[id]/
    designer/projects/, designer/projects/[id]/
    designer/studio/, designer/studio/manage/
    designer/messages/, designer/reviews/, designer/earnings/
    designer/profile/, designer/notifications/
  admin/                    → admin shell (own dark-themed layout, no Navbar/DesignerNavbar)
    page.tsx                 → Dashboard (overview cards, recent activity, revenue chart)
    verification/             → Verification Queue (designer list)
    designers/[id]/            → designer verification review + approve/reject/suspend
    users/                    → customer + designer account management
    customers/[id]/            → customer profile detail (mirrors designers/[id])
    subscriptions/             → billing settings + Payment Transactions monitoring
    disputes/                 → Reports & Disputes
    notifications/             → platform announcements (compose + history)
    settings/                 → admin profile / security placeholder / platform settings summary
components/
  ui/        → design-system primitives (shared by both sides)
  layout/    → Navbar, DesignerNavbar, Footer, AuthShell
  designer/  → DesignerCard
  diary/     → DiaryEntryModal (shared by the diary list and detail pages)
lib/
  mock-data.ts   → typed mock data + accessor functions (swap for real API calls later)
  utils.ts
types/
  index.ts   → all domain types (Customer, Designer, FashionRequest, Proposal, Project,
               CurrentDesigner, Transaction, Payout, DiaryEntry, Dispute, AdminNotification, ...)
hooks/
  use-toast.tsx
```

## Supabase database (Phase 1 — schema)

`supabase/` now holds a complete, migration-reproducible Postgres schema for the real backend —
**database only**; the frontend above still runs entirely on `lib/store.ts`'s in-memory mock and
is not wired to Supabase yet (that's a later phase). See `BACKEND_ARCHITECTURE.md` for the full
design rationale; this is the as-built summary.

- **36 tables**, 15 enum types, 69 foreign keys, 104 indexes, 74 RLS policies, 6 Storage buckets —
  across `supabase/migrations/*.sql` (14 files, applied in order) + `supabase/seed.sql` (dev-only
  test data, clearly out of scope for anything production).
- **One account, optional profiles**: `public.users` (a thin extension of Supabase Auth's
  `auth.users` — no password/email duplicated as an authority, just a synced display copy) with
  optional 1:1 `customer_profiles` and `designer_profiles`. A person can hold either, both, or
  neither; `users.is_admin` is separate and flat (no tiers), and is blocked from ever being
  changed through the client API (enforced by trigger, not just a policy).
- **The canonical request chain is real, not just documented**: `fashion_requests` →
  `proposals` → `projects` references `request_id`/`proposal_id` only, no copied content; a
  partial unique index makes two `accepted` proposals on one request physically impossible; a
  trigger blocks a private/directed request from ever targeting an unapproved designer.
- **RLS is enabled on every table**, tested against a real local instance (10 targeted policy/
  constraint tests — ownership visibility, privilege-escalation attempts, the verified-designer
  rule, the double-accept guard — all passing). Fashion Diary has zero admin read policy, by
  design. Two column-level `REVOKE`s (`is_admin`, designer `rating`/`review_count`) were tried
  first and found not to work — Supabase's own default privilege provisioning re-grants broad
  column access to `authenticated` on every new table — replaced with triggers instead; see the
  comments in `20260829180010_reviews.sql` and `20260829180013_rls.sql` for the full explanation.
- **Local dev**: `npm run db:start` (needs Docker Desktop running), `npm run db:reset` to
  re-apply migrations + seed from a clean slate, `npm run db:types` to regenerate
  `types/supabase.ts`. Test accounts (password `password123` for all): `admin@lilirve.dev`,
  `aanya@lilirve.dev` (customer), `meera@lilirve.dev` (approved designer),
  `ramesh@lilirve.dev` (pending designer).
- **Deliberately not built in this phase**: any business API route, the proposal-accept/
  sibling-decline orchestration (the schema *guarantees* it can't be done unsafely, but doesn't
  implement the transaction itself), request/project status-transition validation, Razorpay
  integration, and — until Phase 2 below — a way for the Next.js app to even talk to this
  database. All intentional — see `BACKEND_ARCHITECTURE.md` §15 for the phase order.

## Supabase connection (Phase 2 — backend foundation)

The Next.js app can now actually reach the Phase 1 database — client plumbing only, still no
business logic and the frontend still renders from `lib/store.ts`'s mock data exactly as before
(nothing in `(app)/`, `(designer)/`, or `admin/` was touched).

- **`lib/supabase/`** — `client.ts` (browser, "use client" only), `server.ts` (cookie-aware, for
  Server Components/Route Handlers/Server Actions — reads the signed-in user's own session, so
  RLS applies as *that* user), `admin.ts` (service-role, bypasses RLS — guarded with the
  `server-only` package, which turns "imported from client code" into a hard build error instead
  of a leaked secret; not called from anywhere yet, no privileged operation exists to need it),
  `config.ts` (the one place env vars are read from), `types.ts` (`Tables<>`/`TablesInsert<>`/
  `TablesUpdate<>`/`Enums<>` generics derived from `types/supabase.ts` — no schema shape is
  hand-typed a second time), `storage.ts` (bucket registry + public/signed URL helpers — no
  upload workflow yet), `errors.ts` (normalizes any Postgrest/Auth/Storage error into a safe,
  generic `AppError`; always logs the real error server-side first), `auth.ts`
  (`getCurrentUser()` — session retrieval only, no role/profile resolution yet).
- **`middleware.ts`** refreshes the Supabase session cookie on every request. At the time this
  phase shipped it did not check roles or redirect anyone — role-based route protection was
  explicitly deferred to Phase 3. **See the Phase 3 section below: this is no longer the current
  behavior** — middleware now enforces real route protection.
- **`GET /api/health`** — a real connectivity probe (reads the public `subscription_plans` table
  through RLS, reports whether a session is present), not a business endpoint. Verified live:
  `{"status":"ok","database":"connected","subscriptionPlansSeeded":2,"authenticated":false}`.
- **`.env.example`** (committed, placeholders) / **`.env.local`** (gitignored, real local dev
  values) — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`. Verified by grepping the actual production client bundle
  (`.next/static/`) after a real build: the service-role key and its env var name appear
  **nowhere** in it; the public anon key would (nothing currently imports `client.ts` from any
  page yet, so there's nothing pulling it in — expected, not a bug, per "don't wire up the
  frontend yet").
- **Not built yet**: any upload workflow, any business API, role/profile resolution, and —
  Phase 3 — the rest of authentication and RBAC.

## Authentication + authorization + RBAC (Phase 3)

Real Supabase Auth, real sessions, real server-side route protection. Still no business APIs
(request/proposal/project/messaging/studio/review/subscription/payment/upload — all later phases)
and the frontend still renders mostly from `lib/store.ts`'s mock data; only the minimum
authentication surface needed to prove auth/authz actually work was wired into the UI.

- **Method: email OTP only**, per the finalized architecture — no passwords exist anywhere in this
  system. `public.users` never stores a credential (see `supabase/migrations/20260829180003_users_and_profiles.sql`);
  Supabase Auth (`auth.users`) owns the credential entirely.
- **`lib/supabase/authorization.ts`** — the authorization foundation (§12): `getAuthContext()`
  resolves `{ user, isAdmin, customerId, designerId, isApprovedDesigner, designerOverallStatus }`
  by calling the exact same SECURITY DEFINER SQL functions RLS itself uses
  (`current_customer_id()`, `current_designer_id()`, `is_admin()`, `is_approved_designer()` — see
  `supabase/migrations/20260829180013_rls.sql`), so there is one definition of "who can do what" in
  the whole system. `requireUser()` / `requireCustomer()` / `requireDesigner()` /
  `requireApprovedDesigner()` / `requireAdmin()` throw a typed `AuthorizationError` (401/403) that
  every route funnels through `lib/supabase/errors.ts`'s new `errorResponse()` — no route
  re-implements a permission check from scratch.
- **`lib/auth/routes.ts`** — classifies every real route (inspected directly from `app/`, nothing
  invented) into `public` / `authenticated` / `customer` / `designer` / `admin`. Public catalog
  pages that happen to live inside the `(app)` route group for shared layout only — `/discover`,
  `/studio/[id]`, `/dresses/[id]`, `/collections/[id]` — are correctly classified `public`, matching
  the landing page's own nav and `PublicStudioPage`'s explicit framing (§16).
- **`lib/supabase/middleware.ts`** now enforces that classification on every request, reusing the
  same `auth.getUser()` call that already refreshes the session token (no extra round trip for most
  routes). Unauthenticated access to a protected route redirects to `/login?next=<path>`; a
  non-admin hitting `/admin/*` is redirected to `/home`. `customer`/`designer` levels require only a
  valid session, not yet a completed profile — see the file's scope note for why (`/onboarding` and
  `/designer-onboarding` are still mock wizards this phase deliberately didn't rewire; profile
  completion stays separate from authentication per §19).
- **`app/api/auth/{otp/request,otp/verify,logout,session}/route.ts`** — the registration+login+
  logout+session-check foundation. `otp/request` serves both registration and login in one call
  (`shouldCreateUser: true`); the `on_auth_user_created` trigger auto-provisions the matching
  `public.users` row, so there's no separate "create account" endpoint and no way to duplicate an
  auth identity. `otp/verify` is what actually writes the session cookie (Route Handlers can write
  cookies; Server Components can't). `session` returns the caller's own resolved auth context —
  used by the frontend and by the test suite below.
- **`app/api/profile/{customer,designer}/route.ts`** — optional profile initialization (§7–§10).
  `user_id` always comes from the authenticated session, never the request body, so a client cannot
  create a profile for someone else — enforced independently at the database layer too, by RLS's
  `customer_profiles_insert_self` / `designer_profiles_insert_self` policies. Creating a designer
  profile does not set any verified/approved state — `designer_verifications` is auto-provisioned
  at `not_submitted` and only an admin can move it to `approved` (§9, §13).
- **Minimum frontend wiring** (§24 — not a redesign): `/login` and `/create-account` now call
  `otp/request` and route to `/verify-otp` instead of a fake `setTimeout`; `/verify-otp`'s
  `OtpForm` calls `otp/verify` for real instead of checking a hardcoded `"1234"`. Password fields
  were removed from both forms (there is nothing for them to authenticate against — see "Method"
  above); `/forgot-password` is left in place, unlinked, since a passwordless system has no
  password to reset (§ "do not remove existing pages" — the page still exists, just nothing links
  to it anymore).
- **Local dev email OTP delivery**: the default Supabase magic-link template only renders a
  clickable link, not digits — but this app's UI is a type-the-code form. Added
  `supabase/templates/magic_link.html` + a `[auth.email.template.magic_link]` block in
  `supabase/config.toml` so local dev email (viewable at Mailpit, `http://127.0.0.1:54324`) shows
  the actual `{{ .Token }}` code `verifyOtp()` expects.
- **`supabase/seed.sql`** additions — two more designer test accounts (`priya@lilirve.dev` =
  rejected, `kabir@lilirve.dev` = suspended) alongside the existing approved/pending ones, so all 5
  `designer_overall_status` values have a real seeded account for testing (dev-only data, no schema
  change).
- **Testing** (§22) — `scripts/test-phase3-auth.mjs` drives the real app (real email OTP through
  Mailpit, real middleware, real API routes) through all 8 required personas — unauthenticated,
  fresh customer, and the 4 seeded designer verification states plus admin — checking both positive
  and negative access (28 checks, all passing). `scripts/test-phase3-rls.mjs` bypasses the app
  entirely and hits PostgREST directly with supabase-js to prove RLS — not just the API routes — is
  what actually stops identity spoofing and self-admin-promotion (6 checks, all passing). Run either
  with `node scripts/<file>.mjs` while `npm run db:start` and `npx next dev -p 3100` are up.
- **Not built yet**: any business API, any RLS/schema change, full frontend integration (still
  `lib/store.ts` mock data everywhere else), the `/onboarding`/`/designer-onboarding` wizards wired
  to real profile creation, and — Phase 4 — the customer backend.

## Customer backend + customer journey (Phase 4)

The customer side of LILIRVE is now real. The canonical chain — **request → proposal → accepted
proposal → project → workspace** — is enforced end to end by real Supabase data, RLS, and one
narrowly-scoped database function; nothing along that chain is a second, independently-editable
copy of the request.

- **Connected for real**: Profile (view/edit/photo), request creation (with image upload) + list +
  detail, proposals (view + accept), the accept→project workflow, Projects (list + workspace),
  Messages (list + send/receive), project updates (view-only), Fashion Diary (full CRUD + images),
  Saved Items, and review submission.
- **`supabase/migrations/20260830000001_accept_proposal.sql`** — the one new migration this phase
  needed: a `SECURITY DEFINER` `accept_proposal(p_proposal_id)` function, exactly what Phase 1's
  own RLS comments flagged as still-needed ("no client-facing INSERT policy on projects... will run
  as a privileged operation in the backend phase"). It re-verifies request ownership itself (RLS is
  bypassed inside a SECURITY DEFINER function), accepts the proposal, auto-declines siblings, moves
  the request to `accepted`, and creates the project — referencing `request_id`/`proposal_id` only.
  `proposals_one_accepted_per_request` (Phase 1's partial unique index) remains the final guarantee
  against a concurrent double-accept; verified live by accepting the same proposal twice.
- **`lib/customer/data.ts`** — the "no duplicated request content" principle in code: `mapProject()`
  builds a project's full detail by joining `projects` + its `fashion_requests` + accepted
  `proposals` row fresh on every read, never from a stored copy. Image resolution
  (`request_images`/`diary_entry_images`/`project_update_images` → `files` → signed Storage URLs)
  and designer-summary lookups live here too, shared by every route.
- **`app/api/{requests,proposals,projects,conversations,diary,reviews,saved-items,uploads}/`** —
  one route tree per resource. Every one uses `lib/supabase/server.ts` (RLS-scoped as the caller,
  never `lib/supabase/admin.ts`) and derives ownership from `requireCustomer()`
  (`lib/supabase/authorization.ts`, Phase 3) — no route trusts a client-supplied `customerId`.
- **Uploads** (`app/api/uploads`) — real files, real Storage, real `files` metadata rows; no binary
  data in Postgres. A new `components/ui/UploadingImageGrid.tsx` /
  `components/profile/UploadingProfilePhotoSection.tsx` pair handles the real-upload UI — kept
  deliberately separate from the existing `ImageUploader`/`ProfilePhotoSection` components, which
  are still used by several designer-side pages that remain fully mock this phase; changing those
  components' contracts in place would have broken pages Phase 4 has no business touching.
- **Project updates**: customer can VIEW (`GET /api/projects/[id]/updates`) but there is no
  create/edit endpoint — per the brief, authoring a designer progress update is Phase 5 scope.
  Verified live that a customer session also can't insert one directly (RLS denies it independent
  of any API route existing).
- **Deliberately still mock this phase**: declining an individual proposal (RLS has no
  customer-write policy on `proposals` at all — only "accept," which needed the new privileged
  function, was in scope); the two-sided project-completion actions (confirm/request changes) —
  no real project can reach `awaiting_confirmation` yet since that requires a Phase 5 designer
  action; Notifications/Privacy toggles on the Profile page; and the designer/dress/collection
  catalog itself (`lib/mock-data.ts`) everywhere it's only being *read* (Discover, Studio pages,
  Saved Items' referenced entities) — that catalog is Phase 5 (Designer Backend) scope.
- **Testing** — `scripts/test-phase4-customer.mjs` drives the real running app through all 19
  required scenarios (§28) plus a saved-items check: create/view/isolate requests, upload+link an
  image, view/isolate proposals, accept (+ reject a double-accept, + reject another customer
  accepting), project isolation, message isolation, update view/no-create, diary CRUD + isolation,
  eligible review + duplicate rejection + cross-customer rejection (33 checks, all passing). Uses a
  one-time SQL test fixture (a second completed, unreviewed project) for the review scenarios,
  since nothing in Phase 4 alone can mark a project completed yet.
- **Not built yet**: any designer-facing API, any admin business API, full frontend integration
  everywhere else, and — Phase 5 — the designer backend.

## Designer backend + designer journey (Phase 5)

The designer side of LILIRVE now runs on the same real Supabase data as the customer side — same
`fashion_requests`/`proposals`/`projects` rows, never a designer-specific copy. The existing
designer UI (swipe feed, requests, projects, workspace, messages, Manage Studio, onboarding) was
reused as-is; only data sources, missing actions, and loading/empty/error states changed.

- **Connected for real**: Discover Requests (the Tinder-style swipe feed), designer Requests page,
  request detail + proposal creation, designer Projects (list + workspace), progress-update
  create/edit/delete, the designer half of two-sided project completion (+ the customer half Phase
  4 left stubbed, now wired), designer Messages, Reviews (view-only), designer Profile +
  verification status display, Manage Studio (Highlights/Meet the Designer/Collections/Dresses/
  Previous Creations, all full CRUD), the public/own Studio pages, and the designer onboarding
  wizard's backend (draft save, portfolio items, portfolio/identity/profile submission).
- **No new migration needed beyond one**: `supabase/migrations/20260830000001_accept_proposal.sql`
  was already Phase 4's — Phase 5 added zero schema changes. Every designer feature maps onto
  Phase 1's existing tables (`designer_profiles`, `designer_onboarding`, `designer_credentials`,
  `designer_portfolio_items`, `designer_verifications`, `designer_request_interactions`,
  `studio_highlights`, `meet_the_designer_entries`, `collections`, `dresses`, `dress_images`,
  `previous_creations`, `previous_creation_images`).
- **`lib/designer/data.ts`** / **`lib/designer/studio-bundle.ts`** — the designer-side mirror of
  `lib/customer/data.ts`, deliberately importing (not redefining) the request/proposal/project
  mappers: a designer must see EXACTLY what the customer submitted. `getStudioBundle()` is shared,
  unmodified, by three consumers: `app/api/studio/[id]` (public API), the customer-facing
  `/studio/[id]` page, and the designer's own `/designer/studio` preview — one real bundle, not a
  second read implementation for "my own" view.
- **`app/api/designer/`** — feed, requests interaction (swipe/save), proposals, projects (+
  complete), onboarding (+ portfolio items, submit-portfolio, start-identity, submit-profile),
  profile, verification (read-only, no write method exists at all), studio (+ highlights,
  meet-entries, collections, dresses, previous-creations), reviews (read-only), conversations.
  Every mutating route derives designer identity from `requireDesigner()`/
  `requireApprovedDesigner()` (Phase 3) — never a client-supplied `designerId` — and re-scopes
  every update/delete with `.eq("designer_id", ctx.designerId)` as defense in depth on top of RLS.
- **Shared routes generalized, not duplicated**: `app/api/conversations/[id]/messages` and
  `app/api/projects/[id]` (Phase 4) were extended to work for either participant type instead of
  spawning designer-specific clones — one conversation/project detail implementation, reused by
  both sides.
- **Request feed security** (§44): the swipe feed is never `SELECT * FROM fashion_requests` — it's
  gated by `requireApprovedDesigner()` server-side AND by `fashion_requests_select` RLS
  independently (a non-approved designer can't see public requests even if the route had no check
  at all). Verified live: pending/rejected/suspended designers all correctly denied.
- **Two-sided project completion, completed**: `POST /api/designer/projects/[id]/complete` (active
  → awaiting_confirmation only) plus `POST /api/projects/[id]/{confirm-completion,request-changes}`
  (Phase 4's stubbed customer buttons, now real). No RPC needed — each is one guarded, WHERE-scoped
  UPDATE.
- **Storage**: designer uploads now use `studio-images` (public — highlights, meet-the-designer,
  collection covers, dress images, previous creations), `project-updates` (private, both
  participants can read), and `verification-documents` (private, owner-only — portfolio items,
  since they're pre-approval submission material, not yet part of the public studio).
  `components/ui/UploadingImageGrid.tsx`/`UploadingProfilePhotoSection.tsx` (Phase 4) were reused
  as-is; the shared upload endpoint just gained more allowed bucket keys.
- **A real correctness fix along the way**: dress image edits used to risk wiping a dress's photos
  if saved without touching images (the PATCH endpoint does a full ordered replace, and the edit
  modal had no way to know the existing images' file ids). Fixed the same way Phase 4 already
  fixed the identical class of bug for diary entries/project updates — resolve images as
  `{fileId, url}` pairs, not bare urls, so "didn't touch images" round-trips correctly.
- **§32 (remove "View as Customer")**: inspected the entire existing Manage Studio page and
  designer layout — no such button exists in this codebase. Nothing to remove; noted here so the
  inspection itself is on record.
- **Deliberately still mock/unconnected**: designer-side "Decline Request" for a *directly
  addressed* request (RLS has no designer-write policy on `fashion_requests` at all, by Phase 1's
  original design — declining a public request via swipe IS real); designer Settings' password
  fields and notification toggles (no passwords exist in this system at all — Phase 3 — and no
  notification-preference schema exists); the single onboarding "credential" fields (institution/
  qualification/year — `designer_credentials` exists in the schema but no CRUD route was built for
  it this phase, a deliberate scope cut given its minor role in the existing UI); a dedicated
  Earnings page (no such page exists anywhere in the current frontend to connect — inspected and
  confirmed absent, so none was invented, per the phase's own "do not create a new dashboard"
  rule); Designer Subscription (`payment_settings.payment_system_enabled` stays `false`, untouched,
  per explicit instruction).
- **Testing** — `scripts/test-phase5-designer.mjs` drives the real running app through all 30
  required scenarios (§49) plus onboarding and completion-workflow checks (44 checks, all passing
  on a clean run). Re-ran `scripts/test-phase3-auth.mjs` (28/28) and `scripts/test-phase4-customer.mjs`
  (33/33) against the same Phase-5-modified codebase to confirm zero regression to authentication
  or the customer journey.
- **Not built yet at the time of this phase**: any admin business API, real payment/subscription
  activation — see "Admin backend + admin management (Phase 6)" below, which built the former.

## Admin backend + admin management (Phase 6)

The existing LILIRVE Admin Panel (Dashboard, Verification, Designer detail, Users, Customer
detail, Disputes, Notifications, Settings, Subscriptions) is now a real administrative system
backed by Supabase — same visual language, same 9 pages, no redesign, no new pages. Every button,
form, and confirmation modal that used to write to `lib/store.ts` now calls a real, `requireAdmin()`-
gated API route.

- **Connected for real**: Dashboard (real counts, 6-month revenue bars, recent-activity feed),
  Designer Verification Management (queue + full designer review: identity verify/fail, portfolio
  approve/request-revision/reject, profile approve/reject), Suspend/Unsuspend Designer, User
  Management (ALL customers + ALL designers, not the old single hardcoded demo customer), User
  Account Actions (customer suspend/reactivate with optional reason), Designer Management (detail +
  audit history), Reports/Disputes (list/filter/detail/notes/status-advance), Payment Monitoring
  (read-only, no gateway), Subscription Settings (master + per-role toggles, currency),
  Subscription Plans (per-plan editor), Payment Record Monitoring, System Notifications
  (create + history), Admin Audit Log (recorded on every state-changing action), Admin Dashboard
  Counts, search/filter/sort, admin detail views, and confirmation UI for every destructive action
  (suspend, reject, etc.).
- **No new migration needed**: every admin feature maps onto tables Phase 1 already created
  (`disputes`, `dispute_notes`, `admin_notifications`, `admin_audit_log`, `subscription_plans`,
  `user_subscriptions`, `payments`, `payment_settings`, plus the existing customer/designer/project
  tables). `npx supabase db reset` after this phase applied zero new migrations.
- **The central design discovery**: Phase 1's RLS policies already carry an `is_admin()` OR-clause
  on nearly every table's SELECT/UPDATE/INSERT policy. An admin session using the regular
  authenticated server client (`lib/supabase/server.ts` + `requireAdmin()`) can therefore read/write
  almost everything this phase needs — **no service-role client** for the vast majority of admin
  operations, directly satisfying the brief's "service-role only where a legitimate operation
  requires bypassing RLS" constraint.
- **The one legitimate service-role use case**: the private `verification-documents` bucket's
  `storage.objects` RLS is owner-only by Phase 1's explicit design (admin review is meant to go
  through a signed URL from a privileged backend process, not a broad `storage.objects` SELECT
  policy). `lib/admin/data.ts`'s `resolvePortfolioItemImageAsAdmin()` is the single call site that
  uses `createAdminClient()` (service role) — and only after first verifying the `files` metadata
  row through the caller's own RLS-respecting authenticated client, so the service-role client is
  never asked to sign an arbitrary client-supplied path. It is never imported into a Client
  Component.
- **`lib/admin/audit.ts`** — `logAdminAction()` writes to `admin_audit_log` on every state-changing
  admin route; failures are logged server-side but never block the already-succeeded admin action.
  The table itself has no UPDATE/DELETE RLS policy for any role — append-only/immutable is a
  database-level guarantee, not something application code has to separately enforce.
- **`lib/admin/data.ts`** — re-exports the designer/customer mapping functions from
  `lib/designer/data.ts` rather than redefining them (an admin sees the SAME real data everyone
  else does, never a parallel "admin view" of the same facts), plus admin-only mappers
  (`mapAdminUser`, `mapDispute`, `mapDisputeNote`, `mapAdminNotification`, `mapSubscriptionPlan`,
  `mapUserSubscription`, `mapPayment`).
- **`app/api/admin/`** (~24 routes) — dashboard; verification queue; designer detail + 8 review
  actions (verify/fail identity, approve/request-revision/reject portfolio, approve/reject profile,
  suspend); users (all customers + designers); customer detail + suspend/reactivate; disputes (list,
  detail, status-advance, notes); notifications (list/create); subscriptions bundle (settings +
  plans + all subscriptions + all payments); payment settings PATCH; plan PATCH; admin's own
  profile (display name).
- **Suspension mechanics — no duplicate status systems**: customer suspension is
  `customer_profiles.status` (already gated by Phase 1's `enforce_customer_status_admin_only`
  trigger); designer suspension is `designer_verifications.overall_status = 'suspended'` — the same
  5-value enum used everywhere else, not a second column. "Reinstate" reuses the same
  `approve-profile` route as a first-time profile approval (it already guards on
  identity/portfolio being verified/approved).
- **No dispute-creation endpoint anywhere** (customer, designer, or admin side) — this matches
  Phase 1's RLS design (`disputes_admin_all` is the only policy on `disputes`) and the existing UI,
  which never had one either. Disputes are admin-managed-only records; a fresh install's disputes
  list is legitimately empty.
- **Frontend pages rewired, same design**: all 9 admin pages (`layout`, dashboard, verification,
  designer detail, users, customer detail, disputes, notifications, settings, subscriptions) are now
  fetch-based against the routes above, with loading/empty/error states added where the mock
  versions had none. The two false "prototype, no real backend" disclaimers in the admin layout and
  the Settings page were replaced with accurate text.
- **Testing** — `scripts/test-phase6-admin.mjs` drives the real running app through 26+ scenarios
  (dashboard access + 5 negative role checks, verification view/approve/reject, non-admin/self-
  approval denial, suspend + suspended-loses-access, user management view + non-admin denial,
  dispute management + non-admin denial, payment/subscription view + non-admin settings denial,
  notification create + non-admin denial, audit-log creation + no tamper endpoint, private-document
  protection, no service-role leakage, no Community/Moodboard/Delivery, and customer/designer
  workflow regression sanity) — 50/50 passing on a clean run. Disputes have no creation endpoint, so
  two dispute rows are seeded directly via SQL fixture (see `scripts/test-phase6-admin.mjs`'s header
  comment) — the same ad hoc fixture pattern Phase 4's review tests already used. Re-ran
  `scripts/test-phase3-auth.mjs` (28/28), `scripts/test-phase3-rls.mjs` (6/6),
  `scripts/test-phase4-customer.mjs` (33/33), and `scripts/test-phase5-designer.mjs` (44/44, run
  against its own fresh reset — it and Phase 4's suite intentionally can't share one reset, since
  both accept the same seeded proposal fixture) against the Phase-6-modified codebase to confirm
  zero regression.
- **Not built yet**: real payment gateway integration, deployment, and — explicitly out of scope for
  this phase — any Community/Moodboard/Delivery Agent functionality (none was added; the codebase
  was audited for references and has none).

## Full-site audit, integration QA, security hardening & production readiness (Phase 7)

An AUDIT → IDENTIFY → FIX → TEST → VERIFY pass over the entire app after Phases 1–6, not a new
feature phase. No redesign, no new architecture, no payment gateway, no Community/Moodboard/
Delivery. The single biggest finding: large parts of the customer-facing browse/discovery surface
and the persistent nav/subscription-gate layer were still reading `lib/mock-data.ts`/`lib/store.ts`
even after Phases 4–6 — this phase found every remaining one and reconnected it to real Supabase
data, then found and fixed two deeper bugs those fixes exposed.

- **Customer discovery surface reconnected** (previously 100% mock, confirmed broken for any real
  id): Landing page and Home's "Recommended designers"/"Collections to explore"/"Ready-made
  pieces", the Discover page's designer directory, and — most severely — `/dresses/[id]` and
  `/collections/[id]`, which used mock `getDressById`/`getCollectionById` lookups that could never
  match a real UUID, so clicking into a dress or collection from an already-real Studio page
  (`/studio/[id]`) 404'd every time. All five now read real `designer_profiles`/`collections`/
  `dresses` via a new `lib/customer/discovery.ts` (reusing `lib/designer/data.ts`'s existing
  mappers — one source of truth, not a parallel "customer's view" of the catalog), exposed through
  new public routes `GET /api/designers` (+`?ids=`), `GET /api/dresses` (+`[id]`), `GET
  /api/collections` (+`[id]`).
- **The Navbar/DesignerNavbar/SubscriptionGate were driven by the seeded mock user, not whoever was
  actually signed in** — every real customer and every real designer saw the mock "Aanya
  Reddy"/"Meera Kapoor" name and avatar in their own header, on every page, and the subscription
  gate wrapping the entire customer/designer app checked the mock store's independent
  `paymentSettings`/`userSubscriptions`, completely disconnected from the real, admin-controlled
  `payment_settings`/`user_subscriptions` tables Phase 6 built — an admin's real toggle would have
  done nothing. Fixed by resolving both server-side in `app/(app)/layout.tsx`/
  `app/(designer)/layout.tsx` (new `lib/subscription-access.ts`, `getOwnCustomerIdentity`/
  `getOwnDesignerIdentity`) and passing them down as props; `SubscriptionGate` is now a pure
  presentational component. Uses the non-throwing `getAuthContext()`, not `requireCustomer()`/
  `requireDesigner()` — middleware deliberately allows a signed-in user onto these routes before
  their profile row exists yet (mid-onboarding), and this layout has to render gracefully in that
  same window rather than hard-crash.
- **Saved Items page was resolving real saved ids through the same mock lookups** — which items are
  saved was always real (`customer_saved_items`), but what they resolve to used
  `getDesignerById`/`getDressById`/`getCollectionById`/`getProjectById` from `lib/mock-data.ts`,
  so the page always looked empty no matter what a customer actually saved. Now resolves via the
  new batch `?ids=` routes (projects reuse the existing real `GET /api/projects`).
- **Two deeper, previously-undetected bugs found while fixing the above** (both are database/config
  fixes, not new features):
  1. `designer_verifications` RLS is intentionally owner-or-admin-only (protects review notes/
     rejection reasons) — correct, and untouched. But the Phase 1 convenience view built specifically
     so *other* callers could read the one non-sensitive derived fact ("is this designer approved"),
     `designer_public_profiles`, was created with `security_invoker = on`, which made it respect that
     same strict RLS for its join against `designer_verifications` — so for any customer or
     anonymous visitor (the exact audience the view exists for), the joined status read NULL and
     `is_approved` always evaluated to `false`. It had zero callers anywhere in the app (grep
     confirmed), so this went unnoticed since Phase 1. This silently broke the "verified"/"Trusted
     Professional" badge on the public Studio page and every designer summary a customer ever saw
     (proposal cards, conversation list, project list — `getDesignerSummaries` in
     `lib/customer/data.ts`) since Phases 4/5. **Migration**:
     `20260831000001_fix_designer_public_profiles_invoker.sql` flips `security_invoker` off — safe
     because `designer_profiles` is already fully public-read, and the view's own two-column select
     list (`id`, `is_approved`) is what keeps `profile_review_note`/`identity_failure_reason`/
     timestamps/granular status private, not the invoker setting. No RLS policy on any base table
     changed. `getDesignerSummaries`, `getStudioBundle`, and the new discovery helpers all read this
     view now instead of hand-joining `designer_verifications`.
  2. `next.config.js` only allow-listed `images.unsplash.com`/`images.pexels.com` (the mock seed
     data's placeholder hosts) in `images.remotePatterns` — `next/image` throws a hard 500 for any
     other hostname, so the moment a page rendered a REAL Supabase Storage image (any avatar, studio
     photo, request/diary/project-update photo with an actual upload), the page crashed. This was
     site-wide, not specific to this phase's changes, and was only surfaced now because this phase's
     fixes were the first to reliably exercise real, non-empty image URLs end-to-end in a real page
     render. Fixed by deriving the remote pattern from `NEXT_PUBLIC_SUPABASE_URL` at config-load time
     (works for local dev and any real deployed project's storage host, no per-environment edit
     needed) instead of hardcoding.
- **The three build errors carried since earlier phases were genuinely fixed, not suppressed**:
  `/messages`, `/designer/messages`, `/requests/new` all called `useSearchParams()` directly in the
  page's default export, which requires a Suspense boundary for Next's static analysis. Each page's
  body moved into a `*Content` component wrapped in `<Suspense>` by the exported page — the standard
  Next.js App Router fix. `next build` now completes with zero errors (previously 3).
- **Full mock-data sweep result**: `lib/store.ts`, `lib/store-hooks.ts`, `lib/mock-data.ts`,
  `lib/seed-data.ts`, and `lib/payment-service.ts` are now genuinely unreferenced by any page or
  component anywhere in `app/` or `components/` (verified by grep) — the entire user-facing surface
  is real. Left in place per this phase's explicit "do not blindly delete" instruction rather than
  removed; `lib/payment-service.ts` is additionally kept as the documented, self-labeled seam for a
  future real payment-gateway integration.
- **Subscription/payment pages made honest**: `app/subscription/page.tsx`/`app/designer-subscription/
  page.tsx` now read the real `payment_settings`/`subscription_plans`/`user_subscriptions` (via
  `getSubscriptionSummary`) instead of the mock store, and no longer call the mock
  `PaymentService.createSubscription`/`cancelSubscription` (which would have shown a "Subscribed!"
  success message with no real transaction) — both actions now show "Checkout isn't available yet"
  regardless of the `enforced` flag, so the page can never claim a transaction occurred without a
  real gateway. `payment_settings.payment_system_enabled` remains `false`; no gateway integrated.
- **Community/Moodboard/Delivery**: repo-wide search found zero functional references — every hit
  was either a generic English use of the word ("the LILIRVE community", a Fashion Diary entry
  titled "Moodboard for..."), a historical comment explaining why the feature was never built, or
  this phase's own test assertions confirming their absence.
- **Database**: one migration, described above — no table/column/RLS-policy changes, a single view
  attribute flip. `npx supabase db reset` applies cleanly; types regenerated via `npm run db:types`.
- **Testing** — `scripts/test-phase7-audit.mjs` (28 checks: real discovery data end-to-end, no
  mock-catalog fingerprints on Landing/Home/Discover/designer-Home, real per-designer verification
  data isolation, Saved Items round-trip through the real resolve-by-ids path, the subscription
  gate not blocking real users, the three Suspense-boundary fixes) — 28/28 passing. Re-ran
  `scripts/test-phase3-auth.mjs` (28/28), `scripts/test-phase3-rls.mjs` (6/6),
  `scripts/test-phase4-customer.mjs` (33/33), `scripts/test-phase6-admin.mjs` (50/50) together, and
  `scripts/test-phase5-designer.mjs` (44/44) against its own fresh reset (shares a seeded-proposal
  fixture with Phase 4's suite by design) — zero regressions. `npx tsc --noEmit` clean; `next build`
  clean with zero errors (down from 3); a full manual smoke sweep across every customer/designer/
  admin/public page returned 200 with no server-side errors logged.
- **Not built/changed**: any payment gateway, deployment, Community/Moodboard/Delivery, or new
  architecture — all explicitly out of scope for this phase.

## Subscriptions + Razorpay payment integration (Phase 8)

A real Razorpay TEST-mode payment integration on top of the existing schema — `subscription_plans`,
`user_subscriptions`, `payments`, `payment_settings` are unchanged in shape except for two new
nullable columns (below). No redesign, no duplicate payment architecture, no new business model.

- **Integration model**: Razorpay **Orders + Checkout** (one paid period per successful checkout,
  `end_date`/`renewal_date` = now + 1 month) — not Razorpay's Subscriptions/recurring-mandate API.
  Nothing in the existing schema commits to true auto-recurring billing
  (`user_subscriptions.payment_provider_subscription_id` stays unused, reserved for that future
  upgrade), and the mandate flow needs a public webhook + bank approval step that can't be tested
  in this environment. `subscription_plans.billing_interval` stays `"monthly"` as the plan's
  informational cadence; renewal today means checking out again next month.
- **Database**: one migration, `20260901000001_razorpay_payment_fields.sql` — adds
  `payments.provider_order_id` (the Razorpay order id, set at checkout time before a payment id
  exists) and two partial unique indexes (`provider_order_id`, and the already-existing
  `provider_reference`) for DB-level idempotency. No RLS changes — `payments_admin_write`/
  `user_subscriptions_admin_write` already gate these tables per-row, automatically covering the
  new column.
- **The RLS architecture already anticipated this phase**: `user_subscriptions`/`payments` writes
  are admin-only by explicit Phase 1 design — that migration's own comment reads *"the real
  subscribe/charge flow will run through a privileged service (payment webhook handler), not a raw
  client insert."* `lib/supabase/admin.ts` (service-role) was likewise pre-built naming "a webhook
  handler" as an expected caller. This phase's service-role usage is exactly that anticipated case
  — isolated to `lib/payments/activate.ts` (the one place a payment turns into a subscription) and
  the checkout/cancel routes' own writes — never used for reads (those go through the regular
  authenticated client + RLS).
- **`lib/payments/`** (new) — `config.ts` (server-only env accessors, mirrors
  `lib/supabase/config.ts`'s pattern exactly), `razorpay.ts` (the only file that imports the
  `razorpay` SDK or computes HMAC signatures — order creation, payment-signature verification,
  webhook-signature verification, all checked against Razorpay's current documented Node.js
  integration steps rather than assumed), `activate.ts` (the single place a verified payment
  becomes an active subscription, called by both `/verify` and the webhook, using an atomic
  `UPDATE ... WHERE status = 'pending'` as the idempotency guarantee — a duplicate call finds zero
  rows to update and safely no-ops rather than double-processing).
- **`app/api/payments/`** (new): `POST /checkout` (validates session + role-eligibility + plan +
  `payment_settings` server-side, rejects an existing active subscription, creates a `pending`
  payments row, then a real Razorpay order — the price is always read fresh from the database,
  never accepted from the client); `POST /verify` (recomputes the HMAC signature server-side;
  the browser's reported "success" is never trusted on its own); `POST /webhook` (no session —
  trust comes entirely from verifying `x-razorpay-signature` against the RAW request body; handles
  only `payment.captured` and `payment.failed`, the two events this project's lifecycle actually
  needs; every other event type is acknowledged 200 and ignored); `POST /cancel` (immediate
  cancellation — no grace-period state was added, since the existing status vocabulary
  (`none/active/expired/cancelled`) has no such state and inventing one would be exactly the
  duplicate status system the brief warns against).
- **Idempotency/duplicate protection** (§14): a double-clicked Subscribe button can't create two
  orders for the same checkout attempt (client-side `busy` guard) or two active subscriptions (the
  pre-existing partial unique index `user_subscriptions_one_active_per_role` is the real backstop —
  `activate.ts` catches its 23505 violation and links the payment to the already-active row instead
  of erroring, since the charge is real either way); duplicate webhook delivery is a verified no-op
  (tested); the two new partial unique indexes make a duplicate order/payment id a database-level
  impossibility, not just an application-logic promise.
- **Customer/designer subscription pages** — `SubscriptionPageContent` (shared by both) gained a
  real interactive checkout/cancel flow; visual design, copy, and layout are unchanged from Phase
  7's honest "checkout isn't available yet" version, now genuinely wired instead of that placeholder
  text. Loading ("Opening checkout…"), verifying ("Confirming payment…"), cancelled-checkout (modal
  dismissed, silently resets — not an error), and error states all present; the UI only ever shows
  a subscription as active after `router.refresh()` re-reads real database state post-verification,
  never merely because Checkout.js reported success client-side.
- **Designer eligibility**: unchanged from the existing architecture — a designer subscription is
  gated on holding a designer profile at all (`ctx.designerId`), the same eligibility
  `SubscriptionGate` already used for the entire `/designer/**` route group regardless of
  verification status. No new restriction tying subscription purchase to
  `designer_verifications.overall_status` was added — nothing in the existing app ties those two
  concerns together (a pending/rejected/suspended designer already reaches `/designer/home` etc.
  today; subscription and verification are and remain orthogonal), so adding one now would be
  inventing a business rule, not preserving one.
- **Admin monitoring** — `GET /api/admin/subscriptions` needed zero route changes (it already
  selects `payments.*`); `mapPayment` (`lib/admin/data.ts`) now also exposes `orderId`, shown as a
  hover title on the existing transaction-id cell in `app/admin/subscriptions/page.tsx` (one line
  changed, no layout change). Admin's ability to change payment settings/plans (Phase 6) is
  unaffected and remains admin-only; there is still no "mark this payment as succeeded" control
  anywhere in the admin UI — the only way a payment ever becomes `succeeded` is a verified Razorpay
  signature, and this phase didn't add an escape hatch around that.
- **Fixed as part of this phase, not new scope**: `lib/subscription-access.ts`'s
  `getSubscriptionSummary` used `.maybeSingle()` on an unfiltered `user_subscriptions` query — safe
  while no real subscription rows existed (Phase 7), but a real latent bug once real
  checkouts/cancellations start accumulating multiple historical rows per user+role (PostgREST
  errors on >1 row). Now orders by `created_at desc` + takes the most recent. Also added a
  read-only, lazy "past `end_date` displays as expired" computation for the summary page — no cron
  exists in this environment, and `getSubscriptionAccess` (the actual access gate) already
  independently ignored a past-end_date row regardless of stored status, so this is cosmetic only,
  never a second source of truth for access.
- **Environment variables** — `.env.example` documents `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`/
  `RAZORPAY_WEBHOOK_SECRET`, all server-only (no `NEXT_PUBLIC_` prefix on any of them — the key id,
  while not secret by Razorpay's own design, is handed to the client inside the `/checkout` JSON
  response rather than baked into the client bundle). `.env.local` here holds placeholder values
  only — no real Razorpay account/TEST credentials are available in this environment; see the test
  suite's own header comment for exactly what that does and doesn't allow verifying.
- **Testing** — `scripts/test-phase8-payments.mjs` (27 checks: full auth/role/plan/feature-flag
  validation, real HMAC signature verification for both `/verify` and the webhook using the actual
  configured secret, webhook idempotency, DB-level duplicate-id rejection, subscription
  date/status correctness, `SubscriptionGate` responding to real activated state, admin monitoring
  + non-admin denial, no secret leakage) — 27/27 passing. Re-ran `scripts/test-phase3-auth.mjs`
  (28/28), `scripts/test-phase3-rls.mjs` (6/6), `scripts/test-phase4-customer.mjs` (33/33),
  `scripts/test-phase6-admin.mjs` (50/50), `scripts/test-phase7-audit.mjs` (28/28) together, and
  `scripts/test-phase5-designer.mjs` (44/44) against its own fresh reset — zero regressions.
- **Explicitly NOT verified, honestly**: an actual Razorpay order created against Razorpay's real
  servers (checkout correctly reaches that call and fails safely — 502, generic message — with the
  placeholder credentials here; a real TEST-mode key is required to see it succeed), and a real
  Checkout.js browser payment. Real Razorpay TEST credentials (and, for genuine webhook delivery, a
  publicly reachable URL registered in the Razorpay Dashboard) are required to exercise those.
- **Not built/changed**: production Razorpay credentials, deployment, recurring/mandate billing,
  refunds, any Community/Moodboard/Delivery functionality — all out of scope for this phase.

## Storage/Uploads gap-fill

A targeted inspection-then-fix pass over Storage/Uploads, which had already been built
incrementally across Phases 4–7 (not built from scratch here). No new buckets, no new upload
route, no rewrite — the six buckets, `files` table, `app/api/uploads`, and
`lib/supabase/storage.ts` were all already real and working; this pass found and fixed two genuine
gaps in what was already there.

- **Critical bug found and fixed — an approved designer could not see a customer's uploaded
  request-reference images at all** (confirmed live: the owning customer's own view of a request
  showed the real signed image URL; an eligible approved designer viewing the exact same public
  request saw an empty array, no error). Root cause: `files_select` RLS only ever granted a
  private file to its `owner_id` or an admin — correct for diary-images (never shared) and
  verification-documents (owner+admin only, by design), but request-images and project-updates are
  meant to be visible to an eligible designer/the other project participant too, not just whoever
  uploaded them. The join back out to `request_images`/`fashion_requests` (or
  `project_update_images`/`project_updates`/`projects`) needed to actually check that eligibility
  the same way `fashion_requests_select`/`projects_select` already do — it wasn't merely a
  narrower RLS bug, it silently broke real functionality every real designer was supposed to have.
- **A second, coupled bug in the opposite direction, found while fixing the first**:
  `request_images_select`, `project_update_images_select`, and the storage.objects
  `request_images_read`/`project_updates_read` policies were all written as
  `exists (select 1 from <parent> where id = <fk>)` — which only confirms the parent row exists at
  all, not that the caller has any relationship to it. In practice `files_select`'s
  over-restriction masked this (the embedded file still came back null for anyone), but it meant
  the wrong layer was carrying the real protection — a raw, authenticated `supabase-js` call
  bypassing the app's own routes entirely could otherwise sign a URL for or read the join row of
  ANY request/project-update image, not just an eligible one. Confirmed via a direct RLS test
  (a freshly signed-up, completely unrelated customer denied `createSignedUrl()` on a known real
  path). Fixed together, consistently, using the exact same eligibility rule the table-level
  policies already encode — one migration,
  `20260902000001_fix_shared_image_visibility.sql`, five policies corrected, no table/column
  changes, no RLS on diary-images/verification-documents/avatars/studio-images touched at all.
- **Avatar-replace orphaning fixed** — re-uploading a customer or designer avatar previously left
  the OLD photo's storage object and `files` metadata row behind forever (no cleanup on replace).
  New `deleteFileIfOwnedBy()` helper (`lib/supabase/storage.ts`) — best-effort, ownership-checked,
  never throws — wired into both profile PATCH routes; confirmed the old object is genuinely
  deleted from Storage (not just unlinked), not merely a metadata change.
- **Confirmed still correct, unchanged**: diary-images (strictly owner-only, never shared, by
  design), verification-documents (owner+admin only — admin's real access route is the existing
  Phase 6 service-role-signed URL, not a broadened RLS clause), avatars/studio-images (public,
  owner-write), file type/size validation (10MB limit, JPEG/PNG/WebP — enforced once, in the one
  shared upload route, so it's consistent everywhere), failed-upload rollback (an orphaned storage
  object is removed if the `files` row insert fails), unauthenticated upload rejection.
- **Noted, not built this pass** (genuinely out of scope, not silently skipped): message image
  attachments — `messages.image_file_id` and the `'message_image'` entity_type exist in the schema
  (anticipated since Phase 1), and the messages page's "Attach image" button has always been
  present-but-disabled, but no bucket/RLS/route/UI wiring exists for it anywhere; building it would
  be a new upload surface, not a fix to an existing one. Also noted: the broader pattern of
  studio-content array-replace routes (dresses/collections/highlights/meet-entries/previous-
  creations) not cleaning up a removed image's old `files` row/storage object the same way avatars
  now do — a real but lower-priority resource-hygiene gap (no functional or security impact, RLS
  still protects an orphan exactly as before), left as a known limitation rather than rewritten
  across eight routes in this pass; `verification-documents`' bucket-level `allowed_mime_types`
  includes `application/pdf`, but no upload UI anywhere currently offers a PDF option (image-only
  end to end) — a harmless, forward-looking mismatch, not a bug.
- **Testing** — `scripts/test-storage-uploads.mjs` (new, 18 checks: the fixed shared-image
  visibility bug from both the app's own routes AND a direct RLS bypass test, project-update image
  visibility for both participants, diary/verification-document isolation regression, avatar
  orphan cleanup, upload validation, unauthenticated rejection) — 18/18 passing. Re-ran
  `scripts/test-phase3-auth.mjs` (28/28), `scripts/test-phase3-rls.mjs` (6/6),
  `scripts/test-phase4-customer.mjs` (33/33), `scripts/test-phase7-audit.mjs` (28/28),
  `scripts/test-phase8-payments.mjs` (27/27), `scripts/test-phase6-admin.mjs` (50/50 — run last,
  since two of its own checks reinstate a seeded designer's verification state that an earlier
  Phase 3 auth check depends on staying untouched — same shared-fixture-ordering constraint already
  documented for Phase 4/5), and `scripts/test-phase5-designer.mjs` (44/44, its own fresh reset) —
  zero regressions.

## Full frontend integration & real-data connection (Phase 9)

An inspect-then-connect pass over the ENTIRE frontend, after Phases 1–8 and the Storage gap-fill.
Confirmed via a fresh repo-wide sweep: zero remaining `lib/mock-data.ts`/`lib/store.ts`/
`lib/store-hooks.ts`/`lib/seed-data.ts` imports anywhere in `app/` or `components/` — the earlier
mock-data cleanup held. This phase's real findings were different in kind: pages with **inline**
hardcoded fake data (never imported from the shared mock files, so invisible to an import-based
search) and one real form whose submit action never called any API at all.

- **Critical bug found and fixed — the customer onboarding wizard never saved anything.**
  `app/onboarding/page.tsx`'s "Finish & Explore LILIRVE" button did `router.push("/home")` with no
  API call whatsoever — the name/city/avatar collected across all three steps was silently
  discarded. Confirmed live: a brand-new signup completing onboarding ended up with **no
  `customer_profiles` row at all**, meaning every real customer feature (requests, diary, saved
  items — everything gated by `requireCustomer()`) rejected them with 403 immediately afterward.
  This had never been caught by any prior phase's tests because every test script created its test
  customers via a direct `POST /api/profile/customer` call, never by driving the actual onboarding
  UI. Fixed: Finish now calls the existing `POST /api/profile/customer` for real (extended with an
  optional `avatarFileId`, reusing the same real upload flow — `lib/customer/upload-client.ts` —
  designer onboarding already used), with a loading state and only navigating to `/home` after the
  real save succeeds. The style-preference step (categories/occasions) has no matching column
  anywhere in the schema — left as an honestly-non-persisted personalization touch (its own copy
  never promises it's saved) rather than inventing new backend storage for it.
- **Two more pages found rendering entirely fake data — customer and designer Notifications.**
  Both were a hardcoded local array of invented events ("Meera Kapoor sent a proposal for...")
  linking to mock ids (`/requests/req-1`) that don't exist in the real, UUID-routed app — every
  link on both pages 404'd. No dedicated notifications table exists in the schema, and building one
  (plus wiring an insert at every event source) would be new business functionality, not a
  connection of something already there. Instead, both now aggregate real, timestamp-sorted events
  from tables the signed-in user already has real access to — mirroring the exact pattern
  `app/api/admin/dashboard`'s "recent activity" feed already established in Phase 6 (no new table,
  RLS already scopes every underlying query to the caller's own rows). New `GET /api/notifications`
  (customer: proposals received, designer messages, project stage changes, awaiting-confirmation
  completions) and `GET /api/designer/notifications` (designer: new eligible requests — only when
  actually approved, matching the swipe feed's own eligibility rule — completions, reviews,
  verification status changes). "Read" state stays exactly as ephemeral as the original mock's own
  behavior (plain `useState`, resets on reload) — not persisted, since the mock never did either.
- **A genuinely fake success state found and fixed — `/forgot-password`.** Confirmed completely
  unreferenced anywhere in the app (no page links to it — `/login`'s real OTP flow never grew a
  link to it). Its form previously faked success ("We've sent a password reset link to...") with no
  real email sent — meaningless anyway, since LILIRVE has no passwords at all (Phase 3, email-OTP
  only). Kept the route (an old bookmark/direct link could still land here) but replaced the fake
  form with an honest explanation and a link to real sign-in, instead of deleting the page.
- **Confirmed intentional, not a bug**: designer onboarding's phone-verification step is a
  documented, self-labeled client-side simulation ("For this demo, use 1234") — Phase 5's own
  comment explains no SMS provider is part of this architecture, while the actual verified/
  not-verified RESULT is genuinely persisted to `designer_onboarding.phone_verified`. Left
  unchanged — it already discloses its own demo nature to the user, unlike the two fake-success
  cases above.
- **Full cross-persona smoke test**: every customer/designer(all 4 verification states)/admin/
  public page (70 checks) returned 200 with nothing logged server-side, both before and after this
  phase's fixes. Every `fetch()` call found across `app/`/`components`/`lib` (~90 distinct API
  paths, including calls routed through local `call()` helper wrappers) was cross-checked against
  the real `app/api/**/route.ts` tree — zero stale/nonexistent endpoint references found.
- **Testing** — `scripts/test-phase9-integration.mjs` (new, 11 checks: onboarding creates a real
  profile end to end — verified 403-before/200-after — both notification feeds return real seeded
  data with real UUIDs, a pending designer's feed correctly omits the approved-only request
  section, unauthenticated rejection, the forgot-password page no longer claims a fake send) —
  11/11 passing. Re-ran `scripts/test-phase3-auth.mjs` (28/28), `scripts/test-phase3-rls.mjs`
  (6/6), `scripts/test-phase4-customer.mjs` (33/33), `scripts/test-phase7-audit.mjs` (28/28),
  `scripts/test-phase8-payments.mjs` (27/27), `scripts/test-storage-uploads.mjs` (18/18) together,
  `scripts/test-phase6-admin.mjs` (50/50, run last per its established ordering constraint), and
  `scripts/test-phase5-designer.mjs` (44/44, its own fresh reset) — zero regressions.
- **Not built this phase**: any new business feature — every fix here connects a page to backend
  functionality that already fully exists; no new tables beyond what Storage/Uploads already added,
  no new third-party integrations, no Community/Moodboard/Delivery.

## Final validation, security hardening & production-readiness (Phase 10)

An AUDIT → TEST → FIND REAL GAPS → FIX ONLY REAL GAPS pass. Unlike every prior phase, this one
found **zero bugs requiring a code fix** — every genuinely new adversarial test written for this
phase passed against the existing architecture on the first real run. No migration, no RLS change,
no application code change. The only addition is one new test file.

- **The critical test**: a REAL concurrent proposal-acceptance race — two independent pending
  proposals on one request, both `POST /api/proposals/[id]/accept` calls fired via `Promise.all`
  (dispatched before either resolves), against the live database. Result: exactly one succeeded,
  the other failed with a clean "no longer eligible" error (no deadlock, no raw DB error surfaced),
  and the database ended in exactly the correct final state (one accepted + one declined proposal,
  exactly one project, request status `accepted`) — confirmed directly via SQL, not just the API
  responses. `accept_proposal()`'s existing `for update` row-locking (Phase 4) held under real
  concurrency; nothing about it was changed.
- **Dual-role account security** (one identity holding both a customer AND a designer profile —
  previously untested): confirmed a single identity can genuinely use real customer-only and real
  designer-only actions independently, and that holding one profile grants zero privilege on the
  other (a dual-role designer with no approval yet is still correctly denied the approved-only
  feed, exactly like any other unapproved designer).
- **Invalid/malformed OTP handling**: confirmed a wrong or malformed code is safely rejected with a
  generic message (no stack trace, no internal detail), and that a wrong attempt never blocks the
  real code from working afterward.
- **Message sender-identity spoofing**: confirmed a client-supplied `senderId`/`sender_id` field in
  a message POST body is silently ignored — `sender_id` is always the authenticated caller's own
  id (already the case; verified, not changed).
- **Directed-request-to-non-approved-designer**: confirmed the existing DB trigger
  (`enforce_preferred_designer_is_approved`, Phase 3) rejects it for real, not just via
  application-layer logic that a direct Supabase call could bypass.
- **Admin audit log immutability**: confirmed directly against `pg_policies` that no UPDATE/DELETE
  policy exists on `admin_audit_log` at all (append-only by construction, Phase 6), and that an
  attempted UPDATE under the `authenticated` role leaves the row genuinely unchanged.
- **Rate limiting**: Supabase Auth's own built-in limits (`supabase/config.toml`'s
  `[auth.rate_limit]` — `token_verifications`/`sign_in_sign_ups` = 30 per 5 min per IP,
  `email_sent` = 2/hour, `max_frequency` = 1s between OTP sends) are the existing, unmodified
  defaults and are the appropriate protection for this attack surface — documented rather than
  duplicated with new application-level infrastructure. Production deployment needs a real SMTP
  provider with its own send-rate configuration (a launch-time config item, not a code gap).
- **Everything else this phase's 20-section scope asked for** (IDOR across customer/designer/
  admin, verification-state authorization, request/project lifecycle, storage bucket privacy,
  Razorpay signature/webhook security, subscription edge cases, input validation, error-message
  safety, RLS coverage) was already exhaustively covered by the Phase 3–9 suites, re-run here as
  standing regression evidence rather than rebuilt.
- **Testing** — `scripts/test-phase10-security.mjs` (new, 20 checks, detailed above) — 20/20
  passing. Full regression, each suite run cleanly against its own correctly-ordered fresh reset:
  Phase 3 auth 28/28, Phase 3 RLS 6/6, Phase 4 33/33, Phase 5 44/44 (isolated), Phase 6 50/50,
  Phase 7 28/28, Phase 8 27/27, Storage 18/18, Phase 9 11/11 — zero regressions anywhere.
- **Not built this phase**: any code fix (none was needed), any new feature, any change to the
  Razorpay/payment architecture — `payment_system_enabled` confirmed still `false` after all
  testing (every test that toggles it does so only within its own run and restores it before
  finishing).

## Swapping in a real backend

Every page reads from `lib/mock-data.ts` through small accessor functions
(`getDesignerById`, `getRequestById`, etc.) — replace those with real API/service calls
(e.g. in a new `services/` folder) and the pages themselves shouldn't need to change shape.
Once that migration happens, `lib/mock-data.ts`'s accessors become thin wrappers around
Supabase queries (see `supabase/` above) instead of the in-memory store.
