/**
 * Password sign-in — replaces the old OTP-based app/api/auth/otp/request+verify pair for login.
 * Uses lib/supabase/server.ts's cookie-writing client so a successful sign-in persists a real
 * session (same convention every other auth Route Handler in this app follows).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { errorResponse } from "@/lib/supabase/errors";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!email || !password) {
      return NextResponse.json(
        { status: "error", message: "Enter your email and password." },
        { status: 400 }
      );
    }

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (error.code === "email_not_confirmed") {
        return NextResponse.json(
          { status: "error", message: "Please verify your email before signing in." },
          { status: 400 }
        );
      }
      if (error.code === "invalid_credentials") {
        return NextResponse.json(
          { status: "error", message: "Incorrect email or password." },
          { status: 400 }
        );
      }
      throw error;
    }

    // ADMIN always lands in the admin area, whatever `?next=` the login page carried (a public
    // page like /discover wouldn't be caught by the middleware's admin redirect). Resolved from
    // the same trusted is_admin() SQL helper as everywhere else, using the session just created.
    const { data: isAdmin } = await supabase.rpc("is_admin");
    return NextResponse.json({ status: "ok", redirectTo: isAdmin ? "/admin" : null });
  } catch (err) {
    return errorResponse(err, "api.auth.login");
  }
}
