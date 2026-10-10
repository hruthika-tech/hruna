/**
 * Refreshes the Supabase auth session cookie on every matched request, AND enforces page-level
 * route protection (Phase 3 — see lib/auth/routes.ts's classifyRoute()). Phase 2 deliberately left
 * this file session-refresh-only ("role-based route protection is Phase 3, not this one") — that
 * phase boundary is exactly where this now picks up.
 *
 * Why session refresh needs to exist at all: Supabase's auth tokens are short-lived and stored in
 * cookies. Server Components can read cookies but — per Next.js — cannot reliably write them back
 * (lib/supabase/server.ts's setAll swallows that failure for exactly this reason). Without
 * something refreshing the session cookie on the way in, a long-lived browser session would
 * eventually start reading with an expired token in every Server Component. Middleware runs
 * before rendering and CAN write cookies, so it's the correct place for this.
 *
 * What the route-protection half deliberately does NOT do: gate "customer"/"designer" routes on
 * whether a customer_profiles/designer_profiles row exists (see lib/auth/routes.ts's scope note),
 * or gate anything on approved-designer status (that's an ACTION-level check via
 * requireApprovedDesigner(), not a page-level one — no current DESIGNER route in §15 requires it
 * just to view the page). Admin status is checked against real, trusted database state here, via
 * the same is_admin() SQL function the RLS policies use — never a client-supplied value — both to
 * gate /admin and to keep admin accounts out of every customer/designer/onboarding page.
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseConfig } from "./config";
import type { Database } from "./types";
import { classifyRoute } from "@/lib/auth/routes";

/** Copies the (possibly refreshed) session cookies from `from` onto a new response, so a redirect
 *  never discards a token refresh that just happened on this same request. */
function withCookies(from: NextResponse, to: NextResponse): NextResponse {
  from.cookies.getAll().forEach((cookie) => to.cookies.set(cookie));
  return to;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(supabaseConfig.url(), supabaseConfig.anonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  // Touching auth.getUser() here is what actually triggers the token refresh + cookie rewrite
  // above when the current token is stale. Its return value is now ALSO used for the route check
  // below — one round trip serves both jobs.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const level = classifyRoute(request.nextUrl.pathname);

  if (level === "public") {
    return supabaseResponse;
  }

  if (!user) {
    // Every non-public level requires at minimum a valid session. Never trust anything from the
    // request itself for identity — this redirect fires purely off the verified `user` above.
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return withCookies(supabaseResponse, NextResponse.redirect(loginUrl));
  }

  // Admin status is resolved from public.users.is_admin via the same trusted SQL helper RLS itself
  // uses (see supabase/migrations/20260829180013_rls.sql), never from anything the client sent.
  const { data: isAdmin } = await supabase.rpc("is_admin");

  if (level === "admin") {
    if (!isAdmin) {
      return withCookies(supabaseResponse, NextResponse.redirect(new URL("/home", request.url)));
    }
  } else if (isAdmin) {
    // ADMIN is its own role, never also CUSTOMER or DESIGNER: an admin account is kept out of the
    // customer/designer areas AND the role-selection/onboarding pages (/choose-role,
    // /designer-onboarding, ...), which is exactly how an admin previously ended up with a
    // designer profile of its own. The API routes enforce the same rule (assertNotAdmin in
    // lib/supabase/authorization.ts); this just sends the admin somewhere useful instead.
    return withCookies(supabaseResponse, NextResponse.redirect(new URL("/admin", request.url)));
  }

  // "authenticated" / "customer" / "designer" — a valid session is all this phase requires at the
  // route level (see file comment and lib/auth/routes.ts for why).
  return supabaseResponse;
}
