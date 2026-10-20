import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { isPostgrestError } from "@/lib/supabase/errors";
import { getDesignerSummaries } from "@/lib/customer/data";
import { OPEN_REQUEST_STATUSES } from "@/lib/requests/lifecycle";

/**
 * The customer and designer notification feeds, shared by the notification pages and the navbar
 * unread badge so both always agree on WHICH items exist. There is no notifications table: each feed is
 * built on request from the user's own rows through their own (RLS-scoped) client — the same
 * aggregation the pages always used. Each item has a stable key ("proposal-<uuid>", …); which keys a
 * user has read is stored in public.notification_reads (supabase/migrations/20261018000001_…).
 *
 * Chat messages are deliberately NOT notifications: they're counted only by the Messages icon
 * (conversation unread counts, app/api/badges), so they're never queried or listed here.
 */

type Db = SupabaseClient<Database>;

export interface NotificationItem {
  id: string;
  type: "proposal" | "progress" | "completion" | "request" | "review" | "verification";
  text: string;
  href: string;
  timestamp: string;
}

const FEED_SIZE = 12;
const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) || 0 : 0);
const newestFirst = (items: NotificationItem[]) => items.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)).slice(0, FEED_SIZE);

/** The signed-in customer's feed (proposals, project progress, completion requests — not chat messages). */
export async function customerFeed(supabase: Db, ctx: { customerId: string }): Promise<NotificationItem[]> {
  const { data: myRequests } = await supabase.from("fashion_requests").select("id, title").eq("customer_id", ctx.customerId);
  const requestIds = (myRequests ?? []).map((r) => r.id);
  const requestTitleById = new Map((myRequests ?? []).map((r) => [r.id, r.title]));

  const { data: myProjects } = await supabase.from("projects").select("id, request_id, designer_id, status, updated_at").eq("customer_id", ctx.customerId);
  const projectIds = (myProjects ?? []).map((p) => p.id);

  const [{ data: recentProposals }, { data: recentUpdates }] = await Promise.all([
    requestIds.length
      ? supabase.from("proposals").select("id, request_id, designer_id, created_at").in("request_id", requestIds).order("created_at", { ascending: false }).limit(5)
      : Promise.resolve({ data: [] as { id: string; request_id: string; designer_id: string; created_at: string }[] }),
    projectIds.length
      ? supabase.from("project_updates").select("id, project_id, stage, created_at").in("project_id", projectIds).order("created_at", { ascending: false }).limit(5)
      : Promise.resolve({ data: [] as { id: string; project_id: string; stage: string; created_at: string }[] }),
  ]);

  const designerIds = [...(recentProposals ?? []).map((p) => p.designer_id), ...(myProjects ?? []).map((p) => p.designer_id)];
  const designers = await getDesignerSummaries(supabase, designerIds);
  const projectById = new Map((myProjects ?? []).map((p) => [p.id, p]));

  const items: NotificationItem[] = [];
  for (const p of recentProposals ?? []) {
    const name = designers.get(p.designer_id)?.name ?? "A designer";
    const title = requestTitleById.get(p.request_id) ?? "your request";
    items.push({ id: `proposal-${p.id}`, type: "proposal", text: `${name} sent a proposal for "${title}".`, href: `/requests/${p.request_id}`, timestamp: p.created_at });
  }
  for (const u of recentUpdates ?? []) {
    const project = projectById.get(u.project_id);
    if (!project) continue;
    const title = requestTitleById.get(project.request_id) ?? "Your project";
    items.push({ id: `update-${u.id}`, type: "progress", text: `${title} moved to the ${u.stage} stage.`, href: `/projects/${u.project_id}`, timestamp: u.created_at });
  }
  for (const p of myProjects ?? []) {
    if (p.status !== "awaiting_confirmation") continue;
    const name = designers.get(p.designer_id)?.name ?? "Your designer";
    const title = requestTitleById.get(p.request_id) ?? "your project";
    // Keyed by the moment it entered this state, so a project marked complete again later is new again.
    items.push({ id: `completion-${p.id}-${ms(p.updated_at)}`, type: "completion", text: `${name} marked "${title}" as completed. Please confirm.`, href: `/projects/${p.id}`, timestamp: p.updated_at });
  }
  return newestFirst(items);
}

/** The signed-in designer's feed (new open requests, completions, reviews, verification outcome). */
export async function designerFeed(supabase: Db, ctx: { designerId: string }): Promise<NotificationItem[]> {
  const [{ data: verification }, { data: myProjects }, { data: recentReviews }] = await Promise.all([
    supabase.from("designer_verifications").select("overall_status, reviewed_at, profile_review_note").eq("designer_id", ctx.designerId).maybeSingle(),
    supabase.from("projects").select("id, request_id, status, completed_at").eq("designer_id", ctx.designerId).eq("status", "completed").order("completed_at", { ascending: false }).limit(5),
    supabase.from("reviews").select("id, rating, created_at").eq("designer_id", ctx.designerId).order("created_at", { ascending: false }).limit(5),
  ]);

  const items: NotificationItem[] = [];
  if (verification?.overall_status === "approved") {
    // Same rule as the Discover feed (app/api/designer/feed): open requests, minus this designer's own
    // interactions and proposals — another designer's proposal doesn't end the customer's search.
    const [{ data: interactions }, { data: ownProposals }] = await Promise.all([
      supabase.from("designer_request_interactions").select("request_id").eq("designer_id", ctx.designerId),
      supabase.from("proposals").select("request_id").eq("designer_id", ctx.designerId),
    ]);
    const interactedIds = new Set([...(interactions ?? []), ...(ownProposals ?? [])].map((i) => i.request_id));
    const { data: recentRequests } = await supabase
      .from("fashion_requests")
      .select("id, title, created_at")
      .in("status", [...OPEN_REQUEST_STATUSES])
      .is("preferred_designer_id", null)
      .order("created_at", { ascending: false })
      .limit(8);
    for (const r of recentRequests ?? []) {
      if (interactedIds.has(r.id)) continue;
      items.push({ id: `request-${r.id}`, type: "request", text: `New fashion request: "${r.title}".`, href: `/designer/requests/${r.id}`, timestamp: r.created_at });
    }
  }
  for (const p of myProjects ?? []) {
    if (!p.completed_at) continue;
    items.push({ id: `completion-${p.id}`, type: "completion", text: "The customer confirmed completion of a project.", href: `/designer/projects/${p.id}`, timestamp: p.completed_at });
  }
  for (const r of recentReviews ?? []) {
    items.push({ id: `review-${r.id}`, type: "review", text: `You received a new ${r.rating}-star review.`, href: "/designer/reviews", timestamp: r.created_at });
  }
  if (verification?.reviewed_at && (verification.overall_status === "approved" || verification.overall_status === "rejected")) {
    const text = verification.overall_status === "approved" ? "Your studio verification was approved." : "Your studio verification was not approved.";
    // Keyed by outcome + review time, so a later re-review is a new notification.
    items.push({ id: `verification-${verification.overall_status}-${ms(verification.reviewed_at)}`, type: "verification", text, href: "/designer/profile", timestamp: verification.reviewed_at });
  }
  return newestFirst(items);
}


/** "Table not there yet" (the read-state migration hasn't been applied to this database). */
function isMissingReadsTable(error: unknown): boolean {
  return isPostgrestError(error) && (error.code === "42P01" || error.code === "PGRST205");
}

export type ReadState = { available: true; read: Set<string> } | { available: false };

/** Which of `keys` the CURRENT user has read (RLS limits rows to their own). */
export async function readState(supabase: Db, userId: string, keys: string[]): Promise<ReadState> {
  if (keys.length === 0) return { available: true, read: new Set() };
  const { data, error } = await supabase.from("notification_reads").select("notification_key").eq("user_id", userId).in("notification_key", keys);
  if (error) {
    if (isMissingReadsTable(error)) return { available: false };
    throw error;
  }
  return { available: true, read: new Set((data ?? []).map((r) => r.notification_key)) };
}

/** Marks keys read for the CURRENT user (idempotent). Returns false if read state isn't available. */
export async function markRead(supabase: Db, userId: string, keys: string[]): Promise<boolean> {
  if (keys.length === 0) return true;
  const { error } = await supabase
    .from("notification_reads")
    .upsert(keys.map((notification_key) => ({ user_id: userId, notification_key })), { onConflict: "user_id,notification_key", ignoreDuplicates: true });
  if (error) {
    if (isMissingReadsTable(error)) return false;
    throw error;
  }
  return true;
}
