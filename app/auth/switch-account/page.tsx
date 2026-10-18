import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/layout/AuthShell";
import { Button, LinkButton } from "@/components/ui/Button";
import { getAuthContext } from "@/lib/supabase/authorization";
import { roleHomePath } from "@/lib/auth/routes";
import { confirmPath, pickLinkParams, resolveAuthFlow } from "@/lib/auth/auth-flows";

// Account switch for a SIGNUP confirmation link opened while another account is signed in here
// (app/auth/confirm/route.ts sends it here without using the link). Nothing changes until the user
// chooses: "Sign out and continue" posts the link back to /auth/confirm, which confirms the new account,
// signs the current one out of this browser and signs the new one in; "Stay signed in" leaves both
// accounts as they are (the link stays usable until it expires).
export const dynamic = "force-dynamic";

const roleLabel = (ctx: { isAdmin: boolean; customerId: string | null; designerId: string | null }) =>
  ctx.isAdmin ? "admin" : ctx.designerId && ctx.customerId ? "customer and designer" : ctx.designerId ? "designer" : ctx.customerId ? "customer" : null;

export default async function SwitchAccountPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const params = pickLinkParams((name) => {
    const v = searchParams[name];
    return Array.isArray(v) ? v[0] : v;
  });
  const resolved = resolveAuthFlow({ flow: params.flow ?? null, type: params.type ?? null });
  if (!resolved.ok || resolved.flow !== "signup" || (!params.token_hash && !params.code)) redirect("/auth/link-error?reason=unknown");

  const ctx = await getAuthContext();
  // Nobody signed in (anymore) — nothing to switch from: confirm normally.
  if (!ctx) redirect(confirmPath(params));

  const role = roleLabel(ctx);
  const home = roleHomePath({ isAdmin: ctx.isAdmin, hasCustomerProfile: ctx.customerId !== null, hasDesignerProfile: ctx.designerId !== null });

  return (
    <AuthShell>
      <p className="text-label-md text-outline mb-2">CONFIRM NEW ACCOUNT</p>
      <h1 className="text-headline-md mb-3">Switch to your new account?</h1>
      <p className="text-sm text-ink-variant mb-4" data-testid="switch-explainer">
        This link confirms a <span className="text-ink font-medium">new HRUNA account</span>. This browser is currently signed in as{" "}
        <span className="text-ink font-medium" data-testid="signed-in-email">{ctx.user.email}</span>
        {role ? ` (${role})` : ""}.
      </p>
      <p className="text-sm text-ink-variant mb-8">
        To continue, we&apos;ll sign that account out of this browser, confirm the new account and sign you in to it. Your{" "}
        {role ?? "current"} account and everything in it stay exactly as they are — sign back in to it any time.
      </p>
      <form method="post" action="/auth/confirm" className="flex flex-col gap-3" data-testid="switch-form">
        {Object.entries(params).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <Button type="submit" className="w-full" data-testid="switch-continue">
          Sign out and continue with the new account
        </Button>
        <LinkButton href={home} variant="secondary" className="w-full">
          Stay signed in as {ctx.user.email}
        </LinkButton>
      </form>
      <p className="text-xs text-outline mt-6">
        If you stay signed in, this confirmation link keeps working until it expires — open it again later, or in another browser.
      </p>
      <p className="text-sm text-ink-variant mt-8 text-center">
        <Link href="/" className="text-primary font-medium hover:underline">
          ← Back to HRUNA
        </Link>
      </p>
    </AuthShell>
  );
}
