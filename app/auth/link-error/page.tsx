import Link from "next/link";
import { AuthShell } from "@/components/layout/AuthShell";
import { LinkButton } from "@/components/ui/Button";
import { getAuthContext } from "@/lib/supabase/authorization";
import { SignOutAndContinue } from "./SignOutAndContinue";

// Where app/auth/confirm/route.ts sends links that belong to no single flow's own page:
//   mismatch       the link's flow marker and token type disagree — the token was NOT used
//   unknown        unrecognised flow/type
//   other-session  the link worked, but this browser is signed in as a different account, whose
//                  session was deliberately kept (email-change links; signup links instead get the
//                  /auth/switch-account step before they are used)
// Only these fixed reasons are rendered; the signed-in address shown is read from the live session.
export const dynamic = "force-dynamic";

export default async function LinkErrorPage({ searchParams }: { searchParams: { reason?: string; flow?: string } }) {
  const reason = searchParams.reason;
  const ctx = reason === "other-session" ? await getAuthContext() : null;

  let heading = "This link can't be used";
  let body: React.ReactNode = (
    <p className="text-sm text-error mb-8" role="alert">
      This link isn&apos;t a valid HRUNA email link. Open the full link from your most recent HRUNA email, or start again below.
    </p>
  );
  let actions: React.ReactNode = (
    <div className="flex flex-col gap-3">
      <LinkButton href="/login" className="w-full">Sign in</LinkButton>
      <LinkButton href="/create-account" variant="secondary" className="w-full">Create an account</LinkButton>
      <LinkButton href="/forgot-password" variant="secondary" className="w-full">Reset your password</LinkButton>
    </div>
  );

  if (reason === "other-session") {
    const what = searchParams.flow === "email_change" ? "That email-change link has been confirmed" : "That account's email address is now confirmed";
    heading = "Link confirmed";
    body = (
      <p className="text-sm text-ink-variant mb-8" role="status">
        {what}, but it belongs to a different account than the one signed in here
        {ctx?.user.email ? (
          <>
            {" "}(<span className="text-ink font-medium" data-testid="signed-in-email">{ctx.user.email}</span>)
          </>
        ) : null}
        . You&apos;re still signed in as before — to continue with the other account, sign out first and then sign in with it.
      </p>
    );
    actions = ctx ? (
      <SignOutAndContinue label="Sign out and sign in with the other account" />
    ) : (
      <LinkButton href="/login" className="w-full">Sign in</LinkButton>
    );
  } else if (reason === "mismatch") {
    body = (
      <p className="text-sm text-error mb-8" role="alert">
        This link&apos;s details don&apos;t match each other, so it wasn&apos;t used. Open the full link exactly as it appears in your most recent
        HRUNA email, or start again below.
      </p>
    );
  }

  return (
    <AuthShell>
      <p className="text-label-md text-outline mb-2">EMAIL LINK</p>
      <h1 className="text-headline-md mb-3">{heading}</h1>
      {body}
      {actions}
      <p className="text-sm text-ink-variant mt-8 text-center">
        <Link href="/" className="text-primary font-medium hover:underline">
          ← Back to HRUNA
        </Link>
      </p>
    </AuthShell>
  );
}
