import { AuthShell } from "@/components/layout/AuthShell";
import { EmailChangePanel } from "./EmailChangePanel";

// Change the signed-in account's email (Supabase's standard, double-confirmed email change), and the
// landing page for those confirmation links (app/auth/confirm/route.ts adds ?status=). Reachable
// without a session so a link opened on another device still shows its result.
export default function AccountEmailPage({ searchParams }: { searchParams: { status?: string } }) {
  return (
    <AuthShell
      image="/images/stitch/dress-form-draping.png"
      imageAlt="A dress form sketch draped in flowing blush and gold fabric, atelier study"
      quote="“One click, and my design world opened up.”"
    >
      <EmailChangePanel status={searchParams.status ?? null} />
    </AuthShell>
  );
}
