import { CreateAccountForm } from "./CreateAccountForm";
import { confirmationErrorMessage } from "@/lib/auth/confirm-errors";
import { getAuthContext } from "@/lib/supabase/authorization";
import { roleHomePath } from "@/lib/auth/routes";

// Registration. ?error= is set by app/auth/confirm/route.ts when a confirmation link fails; only known
// reasons map to a message.
//   - signed out: the registration form.
//   - signed in as a customer/designer: the same form, with a note naming the current account — a
//     separate account with a different email can be registered without signing out. The current
//     session is never touched (app/api/auth/signup/route.ts uses an isolated client), and the new
//     account's confirmation link is safe wherever it's opened: on another device it signs the new
//     account in there; in this browser /auth/confirm holds it and asks first (/auth/switch-account).
//   - signed in as an admin: the form, for registering someone else (same isolation).
export const dynamic = "force-dynamic";

export default async function CreateAccountPage({ searchParams }: { searchParams: { error?: string | string[] } }) {
  const ctx = await getAuthContext();
  if (ctx && !ctx.isAdmin && ctx.user.email) {
    const role = ctx.designerId && ctx.customerId ? "customer and designer" : ctx.designerId ? "designer" : ctx.customerId ? "customer" : null;
    const home = roleHomePath({ isAdmin: false, hasCustomerProfile: ctx.customerId !== null, hasDesignerProfile: ctx.designerId !== null });
    return <CreateAccountForm notice={confirmationErrorMessage(searchParams.error)} signedIn={{ email: ctx.user.email, role, home }} />;
  }
  return <CreateAccountForm notice={confirmationErrorMessage(searchParams.error)} adminEmail={ctx?.isAdmin ? ctx.user.email ?? null : null} />;
}
