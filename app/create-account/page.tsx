import { CreateAccountForm } from "./CreateAccountForm";
import { AccountSwitchPanel } from "./AccountSwitchPanel";
import { confirmationErrorMessage } from "@/lib/auth/confirm-errors";
import { getAuthContext } from "@/lib/supabase/authorization";
import { roleHomePath } from "@/lib/auth/routes";

// Registration. ?error= is set by app/auth/confirm/route.ts when a confirmation link fails; only known
// reasons map to a message.
//   - signed out: the registration form.
//   - signed in as a customer/designer: an account-switch step instead (sign out first) — otherwise the
//     new account's confirmation link would arrive in a browser that is still someone else's.
//   - signed in as an admin: the form, for registering someone else; the admin session is never touched
//     (app/api/auth/signup/route.ts uses an isolated client) and the new user confirms in their own browser.
export const dynamic = "force-dynamic";

export default async function CreateAccountPage({ searchParams }: { searchParams: { error?: string | string[] } }) {
  const ctx = await getAuthContext();
  if (ctx && !ctx.isAdmin && ctx.user.email) {
    const role = ctx.designerId && ctx.customerId ? "customer and designer" : ctx.designerId ? "designer" : ctx.customerId ? "customer" : null;
    const home = roleHomePath({ isAdmin: false, hasCustomerProfile: ctx.customerId !== null, hasDesignerProfile: ctx.designerId !== null });
    return <AccountSwitchPanel email={ctx.user.email} role={role} home={home} />;
  }
  return <CreateAccountForm notice={confirmationErrorMessage(searchParams.error)} adminEmail={ctx?.isAdmin ? ctx.user.email ?? null : null} />;
}
