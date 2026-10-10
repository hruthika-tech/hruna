import "server-only";

/**
 * Shared server-side shaping helpers for the admin API routes (Phase 6). Reuses Phase 4/5's
 * mappers wherever the underlying row shape is identical (designer verification, onboarding,
 * portfolio items, customer/designer summaries) rather than redefining them — an admin must see
 * the SAME real data everyone else does, never a parallel "admin view" of the same facts.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/lib/supabase/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { STORAGE_BUCKETS } from "@/lib/supabase/storage";
import { emailConfirmed } from "@/lib/designer/data";

export {
  mapVerification,
  mapOnboarding,
  mapPortfolioItem,
  mapCredential,
  getDesignerSummaries,
  getCustomerSummaries,
  type DesignerSummary,
  type CustomerSummary,
} from "@/lib/designer/data";

type Supa = SupabaseClient<Database>;

/* ------------------------------------------------------------------ */
/* Portfolio-item images, viewed by an ADMIN — the one place this      */
/* phase genuinely needs the service-role client (§2/§25): storage.    */
/* objects RLS for the private "verification-documents" bucket is      */
/* owner-only by Phase 1's own explicit design (see the storage        */
/* migration's comment on verification_documents_owner_rw) — there is  */
/* no admin bypass at the storage-policy layer, on purpose, so a       */
/* signed URL for an admin reviewer has to come from a privileged      */
/* backend process rather than a broad RLS policy every admin session  */
/* could otherwise use to list every designer's documents.             */
/*                                                                      */
/* This still checks the `files` metadata row first, through the       */
/* CALLER's own authenticated (RLS-respecting) client — files_select   */
/* already allows admin reads — so the service-role client is only     */
/* ever asked to sign a path that a real, existing, admin-visible      */
/* files row already named. It never signs an arbitrary client-        */
/* supplied path.                                                      */
/* ------------------------------------------------------------------ */

export async function resolvePortfolioItemImageAsAdmin(supabase: Supa, fileId: string | null): Promise<string> {
  if (!fileId) return "";
  const { data: file } = await supabase
    .from("files")
    .select("bucket_id, storage_path")
    .eq("id", fileId)
    .eq("bucket_id", STORAGE_BUCKETS.verificationDocuments.id)
    .maybeSingle();
  if (!file) return "";

  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(file.bucket_id).createSignedUrl(file.storage_path, 60 * 15);
  if (error || !data) return "";
  return data.signedUrl;
}

/* ------------------------------------------------------------------ */
/* A designer's account email-verification state, as an ADMIN sees it. */
/* Read from Supabase Auth (auth.users.email_confirmed_at) — the only  */
/* trustworthy source — which needs the service-role Auth admin API.   */
/* ------------------------------------------------------------------ */

export async function getDesignerEmailVerifiedAsAdmin(supabase: Supa, designerId: string): Promise<boolean> {
  const { data: profile } = await supabase.from("designer_profiles").select("user_id").eq("id", designerId).maybeSingle();
  if (!profile) return false;

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(profile.user_id);
  if (error || !data.user) return false;
  return emailConfirmed(data.user);
}

/* ------------------------------------------------------------------ */
/* users -> minimal admin-facing shape. Never includes anything        */
/* auth-secret (no password/OTP/token exists on this row at all — see  */
/* supabase/migrations/20260829180003_users_and_profiles.sql).         */
/* ------------------------------------------------------------------ */

export function mapAdminUser(row: Tables<"users">) {
  return {
    id: row.id,
    email: row.email ?? "",
    displayName: row.display_name ?? "",
    isAdmin: row.is_admin,
    createdAt: row.created_at,
  };
}

/* ------------------------------------------------------------------ */
/* disputes / dispute_notes -> frontend shapes.                        */
/* ------------------------------------------------------------------ */

export function mapDispute(row: Tables<"disputes">) {
  return {
    id: row.id,
    customerId: row.customer_id,
    designerId: row.designer_id,
    projectId: row.project_id ?? undefined,
    issue: row.issue,
    details: row.details ?? "",
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapDisputeNote(row: Tables<"dispute_notes">, adminName: string) {
  return {
    id: row.id,
    text: row.note,
    adminName,
    timestamp: row.created_at,
  };
}

/* ------------------------------------------------------------------ */
/* admin_notifications -> frontend AdminNotification shape.            */
/* ------------------------------------------------------------------ */

export function mapAdminNotification(row: Tables<"admin_notifications">, createdByName: string) {
  return {
    id: row.id,
    title: row.title,
    message: row.message,
    audience: row.audience,
    createdAt: row.created_at,
    createdBy: createdByName,
  };
}

/* ------------------------------------------------------------------ */
/* subscription_plans / user_subscriptions / payments -> frontend      */
/* shapes.                                                              */
/* ------------------------------------------------------------------ */

export function mapSubscriptionPlan(row: Tables<"subscription_plans">) {
  return {
    id: row.id,
    role: row.role,
    name: row.name,
    price: Number(row.price),
    currency: row.currency,
    billingInterval: row.billing_interval,
    description: row.description ?? "",
    features: row.features,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapUserSubscription(row: Tables<"user_subscriptions">) {
  return {
    id: row.id,
    userId: row.user_id,
    role: row.role,
    planId: row.plan_id,
    status: row.status,
    startDate: row.start_date ?? undefined,
    endDate: row.end_date ?? undefined,
    renewalDate: row.renewal_date ?? undefined,
    cancelledAt: row.cancelled_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapPayment(row: Tables<"payments">) {
  return {
    id: row.id,
    userId: row.user_id,
    subscriptionId: row.subscription_id ?? undefined,
    planId: row.plan_id ?? undefined,
    amount: Number(row.amount),
    currency: row.currency,
    status: row.status,
    paymentProvider: row.payment_provider,
    transactionId: row.provider_reference ?? undefined,
    // Razorpay order id (Phase 8) — set at checkout time, before a payment id exists. Shown to
    // admin alongside transactionId (the payment id) for support/audit lookups in the Razorpay
    // Dashboard; never anything more sensitive than an id either app ever stores.
    orderId: row.provider_order_id ?? undefined,
    paidAt: row.paid_at ?? undefined,
    createdAt: row.created_at,
  };
}
