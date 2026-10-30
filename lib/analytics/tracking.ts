import "server-only";

// Server-side recording of analytics events (see supabase/migrations/20261028000001_designer_analytics.sql).
// Only this module writes public.analytics_events, with the service-role client: the table is
// closed to browser sessions. The client says only WHAT was viewed (studio or dress + its id);
// which designer it belongs to is always looked up here, so nobody can credit — or inflate —
// another designer's numbers by sending a different id.

import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminOwnedDesigner, type AuthContext } from "@/lib/supabase/authorization";
import { isUuid } from "@/lib/moderation/reports";
import { istDay } from "./ranges";

/** First-party cookie holding a random id for signed-out visitors — not a fingerprint; it carries
 *  no information about the person and is sent only to the analytics endpoint. */
export const VISITOR_COOKIE = "hruna_vid";
export const VISITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
/** Most events one network (IP) can record per day across HRUNA — an abuse ceiling, far above
 *  what real visitors produce, so shared networks aren't affected in practice. */
export const DAILY_NETWORK_EVENT_CAP = 300;
const IP_SALT = "hruna-analytics-v1";

// Crawlers, link-preview fetchers and automation. A missing user agent is treated the same way.
const NON_HUMAN_UA = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|whatsapp|telegram|discord|skype|preview|headless|lighthouse|pagespeed|curl|wget|python-requests|go-http-client|axios|node-fetch|undici|okhttp|^node$/i;

export const isLikelyNonHuman = (userAgent: string | null) => !userAgent || NON_HUMAN_UA.test(userAgent);

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** One-way visitor key: signed-in → from the user id; signed-out → from the random cookie. */
export function visitorKey(userId: string | null, cookieId: string | null): string | null {
  if (userId) return `u_${sha256(`user:${userId}`).slice(0, 40)}`;
  if (cookieId && isUuid(cookieId)) return `c_${sha256(`cookie:${cookieId}`).slice(0, 40)}`;
  return null;
}

/** Daily-rotating network hash for the abuse cap. Never stored with anything that identifies a person. */
export const networkHash = (ip: string, day: string) => sha256(`${ip}|${day}|${IP_SALT}`);

export function clientIp(headers: Headers): string | null {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || null;
}

export const newVisitorId = () => randomUUID();

// The generated Database types don't include analytics_events yet (regenerate types/supabase.ts
// after the migration is applied); until then this module talks to it untyped.
const db = () => createAdminClient() as unknown as SupabaseClient;

export type ViewKind = "studio" | "dress";
export type RecordResult =
  | { counted: true }
  | { counted: false; reason: "not_found" | "own_listing" | "admin" | "duplicate" | "rate_limited" | "no_visitor" };

interface EventRow {
  event_type: "studio_view" | "dress_view" | "item_saved";
  designer_id: string;
  target_id: string;
  dress_id: string | null;
  visitor_key: string;
  viewer_user_id: string | null;
  ip_hash: string | null;
  event_day: string;
}

async function insertOnce(row: EventRow): Promise<boolean> {
  const { data, error } = await db()
    .from("analytics_events")
    .upsert(row, { onConflict: "event_type,target_id,visitor_key,event_day", ignoreDuplicates: true })
    .select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}

/** Records one public page view, if it should count. */
export async function recordView(input: {
  kind: ViewKind;
  id: string;
  viewer: AuthContext | null;
  cookieId: string | null;
  ip: string | null;
}): Promise<RecordResult> {
  if (!isUuid(input.id)) return { counted: false, reason: "not_found" };
  const client = db();

  let designerId: string | null = null;
  if (input.kind === "studio") {
    const { data } = await client.from("designer_profiles").select("id").eq("id", input.id).maybeSingle();
    designerId = (data as { id: string } | null)?.id ?? null;
  } else {
    const { data } = await client.from("dresses").select("id, designer_id").eq("id", input.id).maybeSingle();
    designerId = (data as { designer_id: string } | null)?.designer_id ?? null;
  }
  if (!designerId || (await isAdminOwnedDesigner(designerId))) return { counted: false, reason: "not_found" };
  if (input.viewer?.isAdmin) return { counted: false, reason: "admin" };
  if (input.viewer?.designerId === designerId) return { counted: false, reason: "own_listing" };

  const key = visitorKey(input.viewer?.user.id ?? null, input.cookieId);
  if (!key) return { counted: false, reason: "no_visitor" };

  const day = istDay();
  const ipHash = input.ip ? networkHash(input.ip, day) : null;
  if (ipHash) {
    const { count, error } = await client
      .from("analytics_events")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .eq("event_day", day);
    if (error) throw error;
    if ((count ?? 0) >= DAILY_NETWORK_EVENT_CAP) return { counted: false, reason: "rate_limited" };
  }

  const counted = await insertOnce({
    event_type: input.kind === "studio" ? "studio_view" : "dress_view",
    designer_id: designerId,
    target_id: input.id,
    dress_id: input.kind === "dress" ? input.id : null,
    visitor_key: key,
    viewer_user_id: input.viewer?.user.id ?? null,
    ip_hash: ipHash,
    event_day: day,
  });
  return counted ? { counted: true } : { counted: false, reason: "duplicate" };
}

/** Records that a customer saved a designer's studio, dress or collection. Called only after the
 *  save itself succeeded; `designerId` was resolved from the item by the caller (never the client). */
export async function recordSave(input: {
  ctx: AuthContext;
  itemType: "designer" | "dress" | "collection";
  itemId: string;
  designerId: string;
}): Promise<RecordResult> {
  if (input.ctx.designerId === input.designerId) return { counted: false, reason: "own_listing" };
  const key = visitorKey(input.ctx.user.id, null);
  if (!key) return { counted: false, reason: "no_visitor" };
  const counted = await insertOnce({
    event_type: "item_saved",
    designer_id: input.designerId,
    target_id: input.itemId,
    dress_id: input.itemType === "dress" ? input.itemId : null,
    visitor_key: key,
    viewer_user_id: input.ctx.user.id,
    ip_hash: null,
    event_day: istDay(),
  });
  return counted ? { counted: true } : { counted: false, reason: "duplicate" };
}
