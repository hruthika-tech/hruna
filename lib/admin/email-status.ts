/**
 * Admin-facing label for a designer's account email-verification state. `null` means the lookup
 * failed (see getDesignerEmailVerifiedAsAdmin), which must read as "Unknown" — never as
 * "Not verified", which would be a false claim about the account. Isomorphic (no server imports).
 */
export function emailVerificationLabel(emailVerified: boolean | null | undefined): string {
  if (emailVerified === true) return "Verified ✓";
  if (emailVerified === false) return "Not verified";
  return "Unknown";
}
