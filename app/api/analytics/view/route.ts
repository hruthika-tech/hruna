/**
 * Records a view of a public studio or dress page (components/analytics/TrackView.tsx calls this
 * once per page view). Body: { "type": "studio" | "dress", "id": "<uuid>" } — nothing else is
 * accepted; the designer is looked up server-side (lib/analytics/tracking.ts).
 *
 * Abuse controls: same-origin JSON only; crawlers/automation ignored; one counted view per visitor
 * per page per day (database unique index); a daily per-network ceiling; the owner's and admins'
 * own visits are never counted. Always answers 204 with no body — whether a view counted is not
 * revealed, and the page never waits on or breaks because of it.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuthContext } from "@/lib/supabase/authorization";
import { clientIp, isLikelyNonHuman, newVisitorId, recordView, VISITOR_COOKIE, VISITOR_COOKIE_MAX_AGE } from "@/lib/analytics/tracking";
import { isUuid } from "@/lib/moderation/reports";
import { isMissingSchemaObject } from "@/lib/supabase/schema-readiness";

export const dynamic = "force-dynamic";

const noContent = () => new NextResponse(null, { status: 204 });

export async function POST(request: Request) {
  // Same-origin only: a browser always sends Origin on a cross-site POST.
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ status: "error", message: "Not allowed." }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ status: "error", message: "Expected JSON." }, { status: 415 });
  }
  const body = await request.json().catch(() => null);
  const type = body?.type;
  const id = body?.id;
  if ((type !== "studio" && type !== "dress") || typeof id !== "string" || !isUuid(id) || Object.keys(body).length !== 2) {
    return NextResponse.json({ status: "error", message: "Expected { type, id }." }, { status: 400 });
  }

  if (isLikelyNonHuman(request.headers.get("user-agent"))) return noContent();

  const jar = cookies();
  const existing = jar.get(VISITOR_COOKIE)?.value ?? null;
  const cookieId = existing && isUuid(existing) ? existing : newVisitorId();

  try {
    const viewer = await getAuthContext();
    await recordView({ kind: type, id, viewer, cookieId, ip: clientIp(request.headers) });
  } catch (err) {
    // Analytics must never break a page: log and move on (quietly while the analytics migrations
    // aren't on this database yet — every view would otherwise log the same error).
    if (!isMissingSchemaObject(err)) console.error("[analytics] view not recorded", err instanceof Error ? err.message : err);
  }

  const response = noContent();
  if (cookieId !== existing) {
    response.cookies.set(VISITOR_COOKIE, cookieId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/analytics",
      maxAge: VISITOR_COOKIE_MAX_AGE,
    });
  }
  return response;
}
