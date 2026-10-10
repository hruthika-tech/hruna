import { AuthShell } from "@/components/layout/AuthShell";
import { ResetPasswordFlow } from "./ResetPasswordFlow";

// Password-recovery landing page. Deliberately has NO server-side session guard (and
// lib/auth/routes.ts classifies it as public): recovery links arrive here before a session exists
// (?code=… / #error_code=…), and only the browser can establish that session or see a hash-fragment
// error — see ResetPasswordFlow.tsx. The form inside only renders once a recovery (or normal)
// session is confirmed, and Supabase Auth rejects updateUser() without one.
export default function ResetPasswordPage() {
  return (
    <AuthShell>
      <ResetPasswordFlow />
    </AuthShell>
  );
}
