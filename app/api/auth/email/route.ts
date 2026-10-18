/**
 * Change the signed-in user's OWN email address, through Supabase Auth's standard email-change flow
 * (auth.updateUser({ email })) — never the service-role admin API. The account, its user id, and
 * everything linked to it (profiles, studio, conversations, messages) stay exactly as they are; only
 * the login address changes, and only once Supabase's confirmation link(s) are clicked:
 * with "secure email change" on (the default), one link goes to the CURRENT address and one to the
 * NEW one, and the switch happens after both. Until then the old address keeps working for sign-in.
 *
 * Links land on /auth/confirm (the same, allow-listed landing route signup uses), which finishes the
 * change and sends the user to /account/email to see where it stands.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/authorization";
import { errorResponse } from "@/lib/supabase/errors";
import { supabaseConfig } from "@/lib/supabase/config";
import { authCallbackUrl } from "@/lib/auth/auth-flows";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  try {
    const ctx = await requireUser();
    const body = await request.json().catch(() => null);
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!email || !EMAIL_RE.test(email) || email.length > 254) {
      return NextResponse.json({ status: "error", message: "Enter a valid email address." }, { status: 400 });
    }
    if (email === (ctx.user.email ?? "").toLowerCase()) {
      return NextResponse.json({ status: "error", message: "That's already your email address." }, { status: 400 });
    }

    const supabase = createClient();
    const { data, error } = await supabase.auth.updateUser(
      { email },
      // flow=email_change lets /auth/confirm route default-template links (which carry no type of their
      // own) to /account/email instead of the signup pages (lib/auth/auth-flows.ts). Links already sent
      // with the older ?type=email_change tag are still recognised.
      { emailRedirectTo: authCallbackUrl(supabaseConfig.siteUrl(), "email_change") }
    );
    if (error) {
      // Never merge or take over another account: an address that's already registered is refused.
      if (error.code === "email_exists" || /already (been )?registered/i.test(error.message)) {
        return NextResponse.json({ status: "error", message: "That email address is already used by another account." }, { status: 409 });
      }
      if (error.code === "over_email_send_rate_limit" || error.status === 429) {
        return NextResponse.json({ status: "error", message: "Too many emails were sent recently. Please wait a few minutes and try again." }, { status: 429 });
      }
      if (error.code === "email_address_invalid") {
        return NextResponse.json({ status: "error", message: "Enter a valid email address." }, { status: 400 });
      }
      throw error;
    }

    return NextResponse.json({
      status: "ok",
      currentEmail: data.user?.email ?? ctx.user.email ?? null,
      pendingEmail: data.user?.new_email ?? email,
    });
  } catch (err) {
    return errorResponse(err, "api.auth.email");
  }
}
