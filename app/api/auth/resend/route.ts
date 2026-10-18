/**
 * Re-sends the signup confirmation-link email. Separate from app/api/auth/forgot-password/route.ts
 * (`resetPasswordForEmail`) — this resends a "confirm signup" email, not a recovery email; the two
 * are different Supabase Auth email types and use different templates (supabase/templates/
 * confirmation.html vs. recovery.html).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseConfig } from "@/lib/supabase/config";
import { errorResponse } from "@/lib/supabase/errors";
import { authCallbackUrl } from "@/lib/auth/auth-flows";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || !email.includes("@")) {
      return NextResponse.json({ status: "error", message: "Enter a valid email address." }, { status: 400 });
    }

    const supabase = createClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: authCallbackUrl(supabaseConfig.siteUrl(), "signup") },
    });
    if (error) {
      if (/already.*confirmed|already been confirmed/i.test(error.message)) {
        return NextResponse.json(
          { status: "error", message: "This email is already verified — try signing in." },
          { status: 400 }
        );
      }
      throw error;
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    return errorResponse(err, "api.auth.resend");
  }
}
