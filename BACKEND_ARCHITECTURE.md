# LILIRVE — Backend & Database Architecture

**Status: this is the pre-implementation PLANNING document.** The schema, API routes, auth and
frontend integration have since been built — `supabase/migrations/` and `README.md` are the
as-built record. Where this plan and the code differ, the code wins. For authentication in
particular, read **Current Authentication Implementation** directly below instead of §9/§9a.

## Current Authentication Implementation

*As built — verified against the code; supersedes §9 and §9a. Full flow table in `README.md`.*

- **Provider: Supabase Auth** (`@supabase/ssr`), cookie-based sessions refreshed in
  `lib/supabase/middleware.ts`. Auth.js / NextAuth (planned in §9) was never used.
- **Sign in: email + password.** `POST /api/auth/login` → `supabase.auth.signInWithPassword()`.
  There is no OTP / magic-link / code-based sign-in.
- **Register:** `POST /api/auth/signup` → `supabase.auth.signUp()` (name, email, password) — one
  Auth account per email; roles are added afterwards as customer/designer profiles on that account.
- **Email confirmation: a link.** Supabase emails a `token_hash` link → `/auth/confirm`
  (`verifyOtp({ type, token_hash })` validates the *link token*) → session created.
- **Forgot / reset password: a link.** `POST /api/auth/forgot-password` →
  `resetPasswordForEmail()` → `/reset-password` → `updateUser({ password })`.
- **Change password:** customers only, via the Change Password card on `/profile`
  (`POST /api/auth/change-password`, which re-checks the current password). Designers have no
  change-password form (they use *Forgot password?*). Admin passwords are changed in **Supabase
  Dashboard → Authentication → Users**.
- **Credentials and verification state live only in `auth.users`.** `public.users` holds `id`,
  `email`, `display_name`, `is_admin`, `created_at` — no password, no `email_verified_at`.
  Email-confirmed status is read from `auth.users.email_confirmed_at`.
- **Authorization:** `lib/supabase/authorization.ts` (`requireUser/Customer/Designer/Admin`) over
  the SQL helpers `is_admin()`, `current_customer_id()`, `current_designer_id()`, enforced again by
  RLS. Admins (`users.is_admin`, set out-of-band only) are kept out of customer/designer areas.

**Planned but never implemented:** the `verification_codes` table (§9a), `users.email_verified_at`,
`users.phone_verified_at`, and any SMS/phone verification. Supabase Auth's own email tokens replaced
the custom-code design.

This document has gone through three passes:
- **Phase 0** — full frontend audit + first-draft architecture, every genuine ambiguity flagged
  instead of guessed.
- **Round 1** — 18 final business decisions applied (dual-profile accounts, request visibility,
  proposal auto-decline, cancellation lifecycles, review rules, roadmap restructure, etc.).
- **Round 2 (this update)** — 8 corrections applied after final review, listed in §0a below. One
  of them (#1) fixes a genuine internal contradiction Round 1 had left in place — see §0a and §6.3.

---

## 0. Decisions applied — Round 1 *(unchanged, kept for history)*

| # | Decision | Status |
|---|---|---|
| 1 | Dual-profile accounts (Customer + Designer optional, one login identity). | Applied |
| 2 | One Designer = one Studio, no multi-studio. | Confirmed |
| 3 | Requests are PUBLIC or PRIVATE/DIRECTED, explicit non-duplicated field. | Applied |
| 4 | One canonical Request record everywhere; edit/lock rule defined. | Applied |
| 5 | Accepting a proposal auto-declines siblings, transactional + DB-constraint enforced. | Applied |
| 6 | Request lifecycle supports cancellation, allowed transitions defined. | Applied |
| 7 | Project lifecycle supports cancellation, allowed transitions + roles defined. | Applied |
| 8 | Review rules finalized. | Applied |
| 9 | Keep subscriptions/payments, master OFF switch. | Confirmed |
| 10–12 | Community / delivery agents / Moodboard confirmed absent. | Confirmed |
| 13 | Fashion Diary stays private, customer-profile-owned. | Confirmed |
| 14 | Only verified designers eligible for the public request feed. | Applied |
| 15 | Admin scope kept, no Community/Delivery admin. | Confirmed |
| 16 | Explicit ownership rules for all three roles. | Applied |
| 17 | DB design principles (no duplicate sources of truth, FKs, cascades, canonical chain). | Applied |
| 18 | 10-phase implementation roadmap. | Applied |

## 0a. Corrections applied — Round 2 (this update)

| # | Correction | Where |
|---|---|---|
| 1 | **Fixed a real contradiction**: Round 1's `projects` table was described as a "snapshot" that copies request/proposal fields, directly contradicting the "one canonical Request, no duplication" principle stated elsewhere in the same document. `projects` now references `request_id` + `proposal_id` only — no request content is copied. | §6.3 (rewritten), §7, §6.12, §16 |
| 2 | Image storage **finalized** as normalized child tables (id, parent id, `file_id` → `files`, position, created_at) for every multi-image entity — no more "array column" alternative left open. | §6.3, §6.5-ish (n/a), §11 (rewritten) |
| 3 | Payment provider **finalized**: Razorpay, India-first, behind the existing `PaymentService` abstraction (provider-swappable). Master OFF switch behavior reaffirmed. | §6.8, new §11a |
| 4 | Admin model **finalized**: flat `users.is_admin` boolean, no tiers. | §0a, §10 (reaffirmed) |
| 5 | OTP **finalized**: email-only for MVP, full verification-code schema defined, never stores raw codes, shaped to add phone later without a redesign. *(Never implemented — superseded by Supabase Auth email + password; see Current Authentication Implementation.)* | New §9a |
| 6 | Private/directed requests **can only target a verified designer** — resolves the one open sub-case from Round 1. | §6.3, §13 |
| 7 | Review ↔ Project relationship **reconfirmed** exactly as Round 1 defined it (0..1, customer-authored, immutable, non-anonymous, one per project). No designer→customer reviews. | §6.5 (unchanged) |
| 8 | Canonical-source-of-truth principle **explicitly reconfirmed** end-to-end, now consistent everywhere including `projects`. | §7, new §18 |

---

## 1–5. Existing project, backend status, pages, data structures, missing functionality

**Unchanged from Phase 0/Round 1** — no corrections in this round touch the frontend audit
itself. Summary retained for continuity:

Next.js 14.2.5 App Router / TypeScript / Tailwind, hand-rolled in-memory store (`lib/store.ts`),
zero backend today (no `app/api`, no `.env*`, no ORM, no auth, no session). 55 pages across
Public/Auth, Onboarding, Customer app, Designer app, Admin. ~30 domain types in `types/index.ts`,
all backed by real seed data. Missing: persistence, real auth/session, RBAC enforcement, real file
upload, payment gateway integration, server-side validation, notification delivery, an API layer.
Full detail in the version history of this document; nothing here changed in Round 2.

---

## 6. Database schema — corrections applied

### 6.1 Identity & accounts *(unchanged from Round 1)*

`users` (no `role` column; `is_admin` boolean — **reconfirmed flat, no tiers, correction 4**;
`display_name`, `email_verified_at` *(planned; not built — confirmation lives in
`auth.users.email_confirmed_at`)*, no account-level `status`), `customer_profiles` (0..1 per
user, own `status`), `designer_profiles` (0..1 per user, standing via
`designer_verifications.overall_status`), `designer_verifications`,
`designer_onboarding_credentials`, `designer_portfolio_items`, `admin_audit_log` — all unchanged.
Studio remains folded into `designer_profiles` + its child tables, not a separate table.

### 6.2 Studio content — **one shape finalized (correction 2)**

`studio_highlights`, `meet_the_designer_entries`, `collections`, `previous_creations` — unchanged
structurally (each row already has at most one image, which is a single-image field, not a
gallery — no change needed there).

**`dresses`** — unchanged core fields. Its images now formally use the finalized pattern:

**`dress_images`** — `id`, `dress_id` (FK), **`file_id`** (FK → `files.id` — see §11), `position`
(smallint), `created_at`. *(This was already recommended in Round 1; now it's the mandatory
pattern, not a "recommended over the array alternative" choice — the array alternative is
removed, see §11.)*

**`previous_creation_images`** — **new table**, replacing `previous_creations.image` as a bare
single-value field. Today's frontend only ever renders one image per previous creation (`image:
string`), so this table will only ever have one row per parent for a while — but modeling it as a
proper child table now (same shape: `id`, `previous_creation_id`, `file_id`, `position`,
`created_at`) costs nothing and means "let a designer add more than one photo of a past creation"
later is a UI change only, not a schema migration.

### 6.3 Requests, proposals, projects — **rewritten (corrections 1, 2, 6)**

**`fashion_requests`** — unchanged from Round 1 (`visibility` generated column, status enum
including `cancelled`, edit-lock rule), **plus one new constraint (correction 6):**

- **`preferred_designer_id` may only reference a currently-verified designer.** A private/directed
  request cannot be created against a designer whose `designer_verifications.overall_status !=
  'verified'`. This can't be expressed as a portable single-table `CHECK` constraint (it depends
  on another table's current value), so it's enforced as:
  1. **Application-layer validation** at request-creation time — reject with `400` if the chosen
     `preferred_designer_id` isn't currently verified. This is the primary enforcement point.
  2. Optionally, a **`BEFORE INSERT/UPDATE` trigger** on `fashion_requests` re-checking the same
     condition at the database level, for defense-in-depth against a bug in the application layer.
     Recommended but not mandatory for the MVP.
  - This closes the one sub-case Round 1 flagged as unresolved: a directed request can now never
    exist against an unverified designer at all, so there's no "visible but can't propose" edge
    case to handle downstream.

**`request_images`** — now explicitly shaped per §11: `id`, `request_id`, `file_id` (→ `files`),
`position`, `created_at`.

**`proposals`** — unchanged from Round 1: fields, unique-per-designer-per-request constraint, the
transactional accept-with-sibling-decline flow, and the partial unique index guaranteeing at most
one `accepted` proposal per request.

**`projects` — corrected to remove the request-data duplication (correction 1):**

The Round 1 draft described this table as "a snapshot of the request + proposal at acceptance
time" that copies title/category/occasion/gender/description/fabric_preference/measurements/
budget/location/due_date/confirmed_price/reference-images onto the row. **This directly
contradicted** the document's own "one canonical `fashion_requests` row, no duplicated fields"
principle — flagged and corrected now, not carried forward.

`projects` is now a thin, purely relational table:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `request_id` | uuid, FK → `fashion_requests.id` | **not null, unique** — one project per request |
| `proposal_id` | uuid, FK → `proposals.id` | **not null, unique** — the one accepted proposal |
| `customer_id` | uuid, FK → `customer_profiles.id` | not null — denormalized *reference*, not content (see note below) |
| `designer_id` | uuid, FK → `designer_profiles.id` | not null — same |
| `stage` | text (one of `ProjectStage`) | project-specific timeline state — genuinely belongs here, not on the request |
| `stages` | text[] | the ordered stage list — still flagged (unchanged from Round 1) as a possible future simplification (a shared constant/template rather than duplicated per row), not part of this correction |
| `progress_percent` | int | derived from `stage`'s position in `stages`, could be computed rather than stored — implementation detail, not a source-of-truth issue since it's project-specific, not request-specific |
| `status` | text (§8 enum) | `active/on_hold/awaiting_confirmation/completed/cancelled` |
| `completed_at`, `changes_requested_at` | nullable timestamptz | |
| `created_at`, `updated_at` | timestamptz | |

**No columns for title, category, occasion, gender, description, fabric_preference,
measurements, budget_min/max, location, due_date, confirmed_price, or reference images.** All of
that is read by joining:
- **Request content** → `projects.request_id` → `fashion_requests.*` (+ `request_images` for
  photos).
- **Agreed price / proposal terms** (`price`, `estimated_days`, `description`, `notes`) →
  `projects.proposal_id` → `proposals.*`.

**Why `customer_id`/`designer_id` staying on `projects` is not the same problem**: these are
single-scalar *relationship pointers* used for ownership/RLS-style query scoping
(`WHERE customer_id = session.customerId`), not *content* copied from the request. They're exactly
derivable from the same two joins above (`request.customer_id`, `proposal.designer_id`) and will
never disagree with them by construction (both are set once, atomically, in the same
proposal-acceptance transaction described in §6.3/Round 1, and neither the request's customer nor
the proposal's designer can ever change afterward). Keeping them as direct columns is a
performance/query-simplicity choice, not a second source of truth for *what the project is about*
— which is the actual concern the "no duplication" principle protects against, and which this
correction fully resolves.

**Read-model note for API design**: this means the "customer request page," "designer request
feed," "designer request detail," "designer requests page," "proposal context," and "project
workspace" (both sides) — the exact list the brief calls out — must all be built by reading
through this same `request_id`/`proposal_id` chain, never by an endpoint independently formatting
project-specific request fields. Building the customer's and designer's project-detail responses
from the same join guarantees the identical-data requirement structurally, not just by convention.

*(Note: today's in-memory frontend `Project` **type** does still carry copied fields — that's a
detail of how the current mock store happens to build a plain JS object, not something this
document is proposing to keep. The frontend is out of scope for this update; the real API can and
should shape its JSON response to match whatever the frontend currently expects, computed from the
join, without the *database* ever storing the duplicate.)*

**`project_updates`** (+ `project_update_images`, now `file_id`-based per §11) — unchanged.

### 6.4 Communication *(unchanged)*

### 6.5 Reviews — **reconfirmed unchanged (correction 7)**

No changes. Re-stating for the record since correction 7 asked for explicit reconfirmation:
`projects (1) ── (0..1) reviews`; customer-authored only; only after `status = 'completed'`;
immutable (no `updated_at`, no update endpoint); never anonymous (`customer_id` not null); exactly
one per project (unique FK on `project_id`); `designer_profiles.rating`/`review_count` always
derived from `reviews`, never independently writable. **No designer-to-customer review path
exists or is planned for the MVP** — the schema has no field that would even represent one
(there's no "reviewer role" column, by design).

### 6.6–6.10 Fashion Diary, Saved items, Subscriptions & payments, Disputes, Admin notifications

*(Unchanged, except §6.8 gets an explicit payment-provider note — see §11a.)* Fashion Diary
images now formally `diary_entry_images` with `file_id` per §11 (was already a child table in
Round 1; only the "reference a `files` row instead of a bare URL" detail is new, per §11).

### 6.11 Files — **unchanged as the metadata source of truth**, now the anchor for §11's finalized image pattern. See §11 for the full linkage.

### 6.12 Cascade / delete behavior — **one line added (correction 1)**

Unchanged from Round 1, plus: **`fashion_requests` deletion is also `RESTRICT`ed if a `projects`
row references it via `request_id`** (in addition to the existing `RESTRICT` when any `proposals`
exist) — now a direct, first-class reason to block deletion rather than something only indirectly
covered through proposals.

---

## 7. Entity relationships — **updated for correction 1**

```
users (1) ──── (0..1) customer_profiles
users (1) ──── (0..1) designer_profiles
users.is_admin (flag) ──── admin capability

designer_profiles (1) ──── (1)  designer_verifications
designer_profiles (1) ──── (*)  {portfolio items, credentials, highlights, meet-the-designer,
                                   collections → dresses → dress_images, previous_creations →
                                   previous_creation_images}

customer_profiles (1) ──── (*)  fashion_requests
fashion_requests   (1) ──── (*)  request_images
fashion_requests   (1) ──── (*)  proposals
fashion_requests   (1) ──── (0..1) projects                    ← by request_id
fashion_requests.preferred_designer_id → designer_profiles      ← MUST be verified (correction 6)

proposals           (1) ──── (0..1) projects                    ← by proposal_id (the accepted one)
customer_profiles (1) ──── (*)  projects   [FK: reference only, not content — correction 1]
designer_profiles (1) ──── (*)  projects   [FK: reference only, not content — correction 1]
projects            (1) ──── (*)  project_updates → project_update_images
projects            (1) ──── (0..1) reviews

customer_profiles (1) ──┐
designer_profiles (1) ──┴── (*) conversations → messages

customer_profiles (1) ──── (*)  diary_entries → diary_entry_images
customer_profiles (1) ──── (*)  customer_saved_items

users                (1) ──── (*)  user_subscriptions → payments

customer_profiles (1) ──┐
designer_profiles (1) ──┴── (*) disputes → dispute_notes

users (admin) (1) ──── (*)  admin_audit_log, admin_notifications

files (1) ──── (*)  {dress_images, request_images, previous_creation_images,
                       diary_entry_images, project_update_images}   ← §11
```

**The canonical chain, now fully consistent end-to-end (correction 1 + 8):**

```
ONE fashion_requests row
   → MANY proposals (if public; exactly one if a specific verified designer was chosen)
      → exactly ONE reaches status='accepted' (partial unique index)
         → exactly ONE projects row, referencing request_id + proposal_id — NOT copying either
```

Every "request content" read anywhere in the system — customer's own request page, designer's
feed, designer's request detail, the proposal context, the project workspace on both sides —
resolves through this same chain to the same `fashion_requests` row. There is no point in the
schema where a second copy of request content could exist or drift.

---

## 8. Status systems *(unchanged from Round 1 — none of the 8 corrections touch enum values)*

Verification (three-track, unchanged), Request (`draft/submitted/reviewed/proposal_received/
accepted/declined/cancelled/expired`), Proposal (`pending/accepted/declined`), Project
(`active/on_hold/awaiting_confirmation/completed/cancelled`), Payment
(`succeeded/failed/refunded/pending`), Dispute (`open/under_review/resolved/closed`), Account
status (per-profile, unchanged), Subscription (`none/active/expired/cancelled`) — all exactly as
Round 1 finalized them.

---

## 9. Authentication architecture *(unchanged from Round 1)* + 9a. OTP — **finalized (correction 5)**

> **Planning history — not as built.** Authentication was implemented with **Supabase Auth and
> email + password**, not Auth.js and not a custom OTP. The `verification_codes` table below was
> **never created** (it exists in no migration), and the `/verify-otp` screen it refers to no
> longer exists. See **Current Authentication Implementation** at the top of this document.

Auth.js (NextAuth v5), Credentials provider, httpOnly session cookie; dual-profile registration
flow, session shape `{userId, isAdmin, hasCustomerProfile, hasDesignerProfile}`, route-group-based
context resolution, `middleware.ts` protection — all unchanged from Round 1.

### 9a. OTP — email-only for MVP, full schema

**Channel decision**: **email only** for the initial implementation — no SMS provider is
introduced for the MVP. The schema is shaped so phone/SMS verification is a config-level addition
later, not a redesign (see the `channel` column below).

**`verification_codes`** table (used for the signup email-OTP flow now; the same shape covers a
future password-reset-by-code flow or phone verification later without a new table):

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | the OTP/request identifier |
| `user_id` | uuid, FK → `users.id`, not null | which account this code verifies |
| `purpose` | text: `'email_verification'` (only value used for MVP; `'password_reset'` reserved for later reuse) | |
| `channel` | text: `'email'` for MVP; `'sms'` reserved | how it was delivered — enables phone verification later purely by adding a value here plus an SMS send integration, no schema change |
| `destination` | text, not null | the email address (or later, phone number) the code was actually sent to — audit trail, and what a "resend" re-targets |
| `code_hash` | text, not null | **hash of the code, never the raw code** — e.g. `HMAC-SHA256(code, server_secret)` or bcrypt; verification re-hashes the submitted code and compares hashes, exactly like a password check |
| `attempt_count` | int, not null, default `0` | incremented on every failed verify attempt; the endpoint rejects further attempts once this hits an application-level max (e.g. 5) — locks out brute-forcing a 6-digit code |
| `consumed_at` | nullable timestamptz | set the moment a code is successfully verified; a consumed code can never be verified again, even if resubmitted |
| `expires_at` | timestamptz, not null | typically 5–10 minutes from `created_at`; an expired code is rejected regardless of `attempt_count` |
| `created_at` | timestamptz, not null | |

**Explicitly, per the instruction**: raw OTP values are **never** persisted anywhere — only
`code_hash`. The 6-digit code itself exists only in the email sent to the user and briefly in
request memory while it's being hashed/compared.

**Rate limiting** (application-level, not a schema column): the "resend OTP" action the frontend's
`/verify-otp` screen already has UI for should be throttled per `user_id`/`destination` (e.g., one
new code per 30–60 seconds, invalidating the previous unconsumed one for that `user_id` +
`purpose`) to prevent spamming the email provider — noted here as a business rule for the auth
phase, not a table addition.

**Future phone verification**: add a `phone_verified_at` column to `users` (mirroring
`email_verified_at`, which already exists) when that feature is built; `verification_codes` needs
no structural change — only a new `channel = 'sms'` row plus an SMS provider integration.

---

## 10. RBAC / ownership rules *(unchanged from Round 1)*

Customer/Designer/Admin ownership table, dual-profile independence note — all unchanged. Admin
model reconfirmed flat (`users.is_admin`, correction 4) — no super-admin/moderator/finance-admin/
verification-admin tiers, since nothing in the existing frontend distinguishes admin capabilities
by tier. The architecture doesn't block adding finer-grained admin permissions later (a
`admin_permissions` join table would slot in without touching any other table), it's just not
built now, per the explicit instruction.

---

## 11. File & image architecture — **finalized (correction 2)**

**One pattern, no more "array column" alternative.** Every multi-image entity uses a normalized
child table shaped exactly as specified:

```
<entity>_images
  id            uuid, PK
  <parent>_id   uuid, FK → the owning row (dress_id / request_id / previous_creation_id /
                            entry_id / update_id)
  file_id       uuid, FK → files.id
  position      smallint, not null   — ordering, powers the frontend's carousels/sliders
  created_at    timestamptz
```

Applies to, finalized (no exceptions left open): **`dress_images`, `request_images`,
`previous_creation_images`, `diary_entry_images`, `project_update_images`.**

**Why not a `text[]`/`jsonb` array** (the alternative Round 1 left open per-case): an array column
can't carry per-image metadata (uploader, moderation state, or even a stable id to reference one
specific image in an API response/URL), and reordering/removing one image means rewriting the
whole array rather than updating one row. The only real cost of the child-table approach — an
extra join — is trivial at this scale and is outweighed by keeping `files` as a genuine single
source of truth for file metadata (see next). No compelling reason to keep the array option open
any further, so it's removed as an alternative.

**`files` stays exactly as designed** (unchanged from Phase 0) — owner, entity type, storage key,
public URL or private+signed, mime type, size, `is_private`. Every `*_images` child table points
into it via `file_id` rather than duplicating a bare URL string, so **file metadata has exactly
one home** regardless of how many entities reference the same underlying upload (relevant for
future dedup, moderation, or right-to-be-forgotten deletion — a `files` row can be located and
removed once, and every child-table row referencing it goes with it via cascade).

**Single-image fields** (avatar, banner, collection cover image, a portfolio item's own photo, a
studio highlight's photo) are unaffected by this correction — they're genuinely one-image-per-row
already, not galleries, and stay as plain `*_url` columns exactly as Phase 0 designed them; this
correction only concerns entities that display **multiple** images.

Everything else from Phase 0's upload-surface audit (which pages upload what, public vs. private
visibility per surface, presigned-upload flow, KYC documents kept private) is unchanged.

---

## 11a. Payment architecture — **finalized (correction 3)**

**Provider: Razorpay**, confirmed India-first (the codebase's existing INR/+91 conventions match
this). This resolves the payment-provider ambiguity Round 1 left open.

**The `PaymentService` abstraction is kept and reinforced, not bypassed**:

```
PaymentService (unchanged public interface — createCheckout, verifyPayment,
                 createSubscription, cancelSubscription, handleWebhook)
        │
        ▼
PaymentProviderAdapter (new — a thin interface: create an order/subscription, verify a
                          payment signature, cancel a subscription, parse a webhook payload)
        │
        ▼
RazorpayAdapter (implements PaymentProviderAdapter using Razorpay's Orders/Subscriptions API)
```

Application code (checkout flows, subscription management, admin payment settings) calls
`PaymentService` only — it never references Razorpay-specific types or calls directly. Swapping to
a different provider later means writing a new adapter behind the same
`PaymentProviderAdapter` interface; nothing above that line changes. This directly satisfies "do
not tightly couple the entire application to Razorpay-specific code."

**Master switch behavior, reconfirmed exactly as already designed** (no change, restated for
completeness since correction 3 explicitly asked): `payment_settings.payment_system_enabled =
false` remains the seeded default. While `false`:
- No customer subscription charge is attempted.
- No designer subscription charge is attempted.
- No checkout/order is created with Razorpay at all — `PaymentService.createCheckout` returns
  early with `{ ok: false, reason: "Payment system is currently disabled." }`, exactly matching
  the existing mock's behavior today.
- No automatic/recurring billing attempt occurs.

Admin can flip `payment_system_enabled` (and the independent `customer_subscriptions_enabled` /
`designer_subscriptions_enabled` flags) on later via the existing `/admin/subscriptions` page's
already-built UI — no new admin surface needed.

**Not implemented in this phase**: no real Razorpay API keys, webhook endpoint, or signature
verification code is being written now — this section is architecture only, per instruction. The
schema (`payments.payment_provider`, `payments.transaction_id`,
`user_subscriptions.payment_provider_subscription_id`) is already provider-agnostic and needs no
change to accept Razorpay's identifiers once real integration begins.

---

## 12. API architecture *(unchanged from Round 1's touch-point list — nothing in this round adds/removes an endpoint group)*

One clarification: `POST /requests` validates `preferred_designer_id` against
`designer_verifications.overall_status = 'verified'` when present (correction 6) — `422`/`400` if
not, with a clear "this designer isn't verified" error rather than a silent fallback to public.

---

## 13. Business rules — **updated (correction 6)**

All Round 1 rules unchanged, plus rule 3 (public feed eligibility) is now **fully resolved**
rather than partially flagged:

> **Only verified designers are eligible for requests, full stop** — for a **public** request,
> only designers with `overall_status = 'verified'` see it in their feed at all; for a
> **private/directed** request, the customer can only *choose* a verified designer as
> `preferred_designer_id` in the first place (enforced at request-creation time, correction 6) —
> so there is no longer any scenario where a directed request exists against a designer who then
> can't act on it. The "should a directed request to an unverified designer be allowed to exist at
> all" question from Round 1 is closed: **no, it can't be created that way.**

Every other business rule (two-sided project completion, Studio owner-only edits, Fashion Diary
privacy, admin-only destructive actions, append-only audit/dispute-note tables, subscription
system off-by-default per-role, etc.) is unchanged.

---

## 14. Frontend → backend mapping *(unchanged from Round 1, with one clarification)*

The project-workspace rows (`(app)/projects/[id]`, `(designer)/projects/[id]`) now explicitly read
through `projects.request_id`/`projects.proposal_id` per §6.3's correction — same pages, same API
group (PROJECTS), just a note that the response is assembled via those two joins rather than
flattened project columns.

---

## 15. Implementation roadmap *(unchanged 10 phases from Round 1)*

Phase 1's schema step now explicitly includes: the corrected `projects` table shape (§6.3), the
finalized `*_images` child-table pattern with `file_id` (§11), the `verification_codes` table
(§9a — *planned; never built*), and the `preferred_designer_id` verified-only constraint (§6.3) — all part of "build
directly from §6" as already stated; no reordering of the 10 phases.

---

## 16. Removed / confirmed-absent features + resolved internal conflict

**Community, delivery agents, Moodboard** — unchanged from Round 1: none were ever in this plan,
nothing to remove.

**Internal conflict found and corrected in this round**: the Round 1 draft's `projects` table
described itself as a "snapshot... copied at creation time" in the same document that also stated
"no table anywhere duplicates request fields." That was a real contradiction, not just loose
wording — flagged explicitly here rather than silently patched, and resolved by correction 1
(§6.3): `projects` now holds only `request_id`/`proposal_id` references, never copied content.

Other Phase-0/Round-1 risk notes (in-memory store's per-runtime behavior, the stale
`designer/earnings` README mention, the orphaned `proj-past-1` demo review, the
`admin_review_log` field rename, the wide mechanical footprint of replacing
`currentCustomer`/`currentDesigner`, file/image handling being the largest true implementation
gap, the illustrative-only payment/subscription seed data) all still stand, unaffected by this
round.

---

## 17. Remaining ambiguities — **all previously-open items now resolved**

Round 1 left four open plus one small item. This round closes all five:

| Former ambiguity | Resolution |
|---|---|
| Image storage shape (array vs. child table) | **Closed — correction 2**: child tables, finalized, no array alternative. |
| Payment provider / market | **Closed — correction 3**: Razorpay, India-first, behind `PaymentService`. |
| Admin account model (flat vs. tiered) | **Closed — correction 4**: flat `is_admin`, no tiers. |
| OTP delivery channel | **Closed — correction 5**: email only for MVP, schema allows SMS later. *(Moot as built: no OTP sign-in exists; see Current Authentication Implementation.)* |
| Directed request to an unverified designer | **Closed — correction 6**: cannot be created; enforced at request-creation time. |

**No blocking ambiguities remain.** The one thing worth naming going into implementation isn't an
ambiguity so much as a standing engineering note already captured in §6.3/§16: the current
frontend's in-memory `Project` object still carries copied request fields for its own convenience,
and that's fine to leave alone (frontend is out of scope for this document) — the real schema and
real API responses are what must follow the corrected, non-duplicated shape.

---

## 18. Final confirmation — one canonical source of truth, end-to-end

Explicitly, as requested:

- **Customer request** → exactly one `fashion_requests` row. Nothing else stores request content.
- **Proposals** → reference that request (`proposals.request_id`); never copy its fields.
- **Project** → references the request **and** the accepted proposal
  (`projects.request_id`, `projects.proposal_id`); copies neither.
- **Designer workspace** (feed, request detail, proposal composer, project workspace) → reads the
  same `fashion_requests`/`proposals` rows via those references.
- **Customer workspace** (my requests, proposal review, project workspace) → reads the same rows,
  through the same references.
- **No separate designer-side copy of a request exists anywhere in the schema.**

This is now true without exception, including inside `projects` — which was the one place it
wasn't true as of Round 1, corrected in this update.

---

*End of this update. No backend/database was implemented. No existing frontend file was modified.
Next instruction, per the brief, will begin the actual database implementation phase.*
