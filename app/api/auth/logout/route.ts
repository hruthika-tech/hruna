import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { errorResponse } from "@/lib/supabase/errors";

export const dynamic = "force-dynamic";

const SESSION_COOKIE = /^sb-.+-auth-token(\.\d+)?$/;

/**
 * Signs the current account out. Default scope "global" (every device — the existing Sign out button);
 * `{ "scope": "local" }` signs out only THIS browser, which is what switching to another account uses
 * (app/auth/link-error). Whatever Supabase answers — e.g. the
 * session had already expired — this browser's session cookies are always cleared, so it really ends up
 * signed out instead of keeping a half-valid session.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const scope = body?.scope === "local" ? "local" : "global";
    const supabase = createClient();
    const { error } = await supabase.auth.signOut({ scope });
    if (error) console.warn("[api.auth.logout] signOut reported an error; clearing session cookies anyway", { code: error.code, status: error.status });
    const store = cookies();
    for (const c of store.getAll()) {
      if (SESSION_COOKIE.test(c.name)) store.set(c.name, "", { path: "/", maxAge: 0 });
    }
    return NextResponse.json({ status: "ok" });
  } catch (err) {
    return errorResponse(err, "api.auth.logout");
  }
}
