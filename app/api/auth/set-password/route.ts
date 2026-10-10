/**
 * Sets the password on the CURRENT session's user — used by /setup-password (a freshly
 * email-verified signup): supabase.auth.updateUser({ password }). /reset-password calls
 * updateUser() from the browser instead (app/reset-password/ResetPasswordFlow.tsx), because the
 * recovery session may only exist in the browser at that point. The password is never
 * written anywhere except Supabase Auth's own auth.users — public.users has no password column and
 * never will (see supabase/migrations/20260829180003_users_and_profiles.sql).
 *
 * requireUser() (401 JSON) is the correct guard HERE, unlike the pages themselves — this is an API
 * route, and there is no session to redirect from; a caller with no valid session simply isn't
 * allowed to call this at all. The pages additionally gate at the Server Component level (see
 * app/setup-password/page.tsx) so an unverified visitor never even
 * sees the form this posts to.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/authorization";
import { validatePasswordConfirmation } from "@/lib/auth/password";
import { errorResponse } from "@/lib/supabase/errors";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const ctx = await requireUser();

    const body = await request.json().catch(() => null);
    const password = typeof body?.password === "string" ? body.password : "";
    const confirmPassword = typeof body?.confirmPassword === "string" ? body.confirmPassword : "";

    const validationError = validatePasswordConfirmation(password, confirmPassword);
    if (validationError) {
      return NextResponse.json({ status: "error", message: validationError }, { status: 400 });
    }

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({
      password,
      // Marks this identity as having a real, user-chosen password — this is exactly what lets
      // app/setup-password/page.tsx tell "just verified, needs a password" apart from "already has
      // one, browsing back here" without any extra table/column. Also read by
      // app/api/auth/session/route.ts's `passwordSet` field, which app/create-account/page.tsx uses
      // to route a refreshed/returning visitor correctly (see that file's comment).
      data: { password_set: true },
    });
    if (error) throw error;

    // Best-effort: persist the full name collected at signup (app/api/auth/signup/route.ts stored
    // it in user_metadata since there's no dedicated signup-time write to public.users). The row
    // itself already exists by now — auto-provisioned by the on_auth_user_created trigger the
    // moment signUp() ran — and users_update_self RLS (id = auth.uid()) permits this ordinary,
    // request-scoped write. Recovery-only sessions (no full_name in metadata) skip this harmlessly.
    const fullName = ctx.user.user_metadata?.full_name;
    if (typeof fullName === "string" && fullName) {
      await supabase.from("users").update({ display_name: fullName }).eq("id", ctx.user.id);
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    return errorResponse(err, "api.auth.set-password");
  }
}
