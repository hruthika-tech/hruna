/**
 * Password sign-in — replaces the old OTP-based app/api/auth/otp/request+verify pair for login.
 * Uses lib/supabase/server.ts's cookie-writing client so a successful sign-in persists a real
 * session (same convention every other auth Route Handler in this app follows).
 */

import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { errorResponse } from "@/lib/supabase/errors";
import { supabaseConfig } from "@/lib/supabase/config";
import type { Database } from "@/lib/supabase/types";
import { roleHomePath } from "@/lib/auth/routes";

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
    const { data: signIn, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (error.code === "email_not_confirmed") {
        return NextResponse.json(
          { status: "error", code: "email_not_confirmed", message: "Please verify your email before signing in." },
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

    // Route by the VERIFIED role of the account that just signed in. The role RPCs run with a client
    // authorised by the access token sign-in just returned, so they evaluate as THIS user — never a
    // stale/anonymous view of the request's cookies. Same trusted SQL helpers RLS itself uses.
    //   redirectTo — forced destination (admins always land in /admin, whatever `?next=` says)
    //   home       — the role's default destination when no explicit `?next=` was given
    const asUser = createSupabaseClient<Database>(supabaseConfig.url(), supabaseConfig.anonKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${signIn.session?.access_token ?? ""}` } },
    });
    const [{ data: isAdmin }, { data: customerId }, { data: designerId }] = await Promise.all([
      asUser.rpc("is_admin"),
      asUser.rpc("current_customer_id"),
      asUser.rpc("current_designer_id"),
    ]);
    const home = roleHomePath({ isAdmin: !!isAdmin, hasCustomerProfile: !!customerId, hasDesignerProfile: !!designerId });
    return NextResponse.json({ status: "ok", redirectTo: isAdmin ? "/admin" : null, home });
  } catch (err) {
    return errorResponse(err, "api.auth.login");
  }
}
