import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/supabase/authorization";
import { roleHomePath } from "@/lib/auth/routes";
import { ChooseRoleOptions } from "./ChooseRoleOptions";

// Role selection for a signed-in account that has no role yet. Server-side guard (middleware already
// requires a session and keeps admins out): an account that already has a customer or designer
// profile goes to its own home instead of choosing again, so this page can't be used to pick a second,
// unintended role. `?confirmed=signup` (set by app/auth/confirm/route.ts) only adds the "email verified"
// note when Supabase itself reports the address as confirmed — the URL alone proves nothing.
export const dynamic = "force-dynamic";

export default async function ChooseRolePage({ searchParams }: { searchParams: { confirmed?: string } }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login?next=/choose-role");
  const roles = { isAdmin: ctx.isAdmin, hasCustomerProfile: ctx.customerId !== null, hasDesignerProfile: ctx.designerId !== null };
  if (roles.isAdmin || roles.hasCustomerProfile || roles.hasDesignerProfile) redirect(roleHomePath(roles));

  const justConfirmed = searchParams.confirmed === "signup" && !!ctx.user.email_confirmed_at;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-16">
      <p className="font-display text-2xl mb-2">HRUNA</p>
      {justConfirmed && (
        <p role="status" data-testid="signup-confirmed" className="text-sm text-ink bg-primary-container/40 rounded-md px-4 py-3 mb-6 text-center max-w-md">
          Your email address <span className="font-medium">{ctx.user.email}</span> is verified and your account is ready.
        </p>
      )}
      <p className="text-label-md text-outline mb-10 text-center">YOUR ACCOUNT IS READY</p>
      <h1 className="text-headline-md text-center max-w-md mb-12">How would you like to use HRUNA?</h1>

      <ChooseRoleOptions />

      <p className="text-xs text-outline mt-10 text-center max-w-sm">
        You can always set up the other side of HRUNA later from your account settings.
      </p>
    </div>
  );
}
