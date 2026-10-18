/**
 * "Who am I, and what am I allowed to do" — the one endpoint that surfaces getAuthContext() to a
 * client. Returns only the requesting user's OWN resolved state (never another user's), and only
 * booleans/enums derived from trusted database RPCs — never raw table rows.
 */

import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/supabase/authorization";
import { errorResponse } from "@/lib/supabase/errors";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ authenticated: false });
    }

    return NextResponse.json({
      authenticated: true,
      userId: ctx.user.id,
      email: ctx.user.email,
      // An email change waiting for confirmation (app/api/auth/email) — the caller's own, else null.
      pendingEmail: ctx.user.new_email ?? null,
      isAdmin: ctx.isAdmin,
      hasCustomerProfile: ctx.customerId !== null,
      hasDesignerProfile: ctx.designerId !== null,
      isApprovedDesigner: ctx.isApprovedDesigner,
      designerOverallStatus: ctx.designerOverallStatus,
      // True once app/api/auth/set-password/route.ts has run at least once for this identity —
      // lets a client tell "verified email, still needs to set a password" apart from "fully signed
      // in" without exposing anything about the password itself. See app/create-account/page.tsx's
      // already-authenticated redirect and app/setup-password/page.tsx's guard.
      passwordSet: ctx.user.user_metadata?.password_set === true,
      // The caller's OWN name as given at registration — lets profile setup prefill it instead of
      // asking again. Never another user's data.
      name: typeof ctx.user.user_metadata?.full_name === "string" ? ctx.user.user_metadata.full_name : null,
    });
  } catch (err) {
    return errorResponse(err, "api.auth.session");
  }
}
