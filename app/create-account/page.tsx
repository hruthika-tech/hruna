import { CreateAccountForm } from "./CreateAccountForm";
import { confirmationErrorMessage } from "@/lib/auth/confirm-errors";
import { getAuthContext } from "@/lib/supabase/authorization";

// Registration. ?error= is set by app/auth/confirm/route.ts when a confirmation link fails; only known
// reasons map to a message. The page shows only the registration form, whoever is signed in:
//   - signed out: the form.
//   - signed in as a customer/designer: the same form — a separate account with a different email can
//     be registered without signing out (the form refuses the signed-in account's own email). The
//     current session is never touched (app/api/auth/signup/route.ts uses an isolated client), and the
//     new account's confirmation link is safe wherever it's opened: on another device it signs the new
//     account in there; in this browser /auth/confirm holds it and asks first (/auth/switch-account).
//   - signed in as an admin: the form, for registering someone else (same isolation).
export const dynamic = "force-dynamic";

export default async function CreateAccountPage({ searchParams }: { searchParams: { error?: string | string[] } }) {
  const ctx = await getAuthContext();
  const signedInEmail = ctx && !ctx.isAdmin ? ctx.user.email ?? null : null;
  return <CreateAccountForm notice={confirmationErrorMessage(searchParams.error)} signedInEmail={signedInEmail} />;
}
