/**
 * Validates a post-login destination taken from the URL (e.g. `/login?next=…`). Only same-site
 * relative paths are allowed — anything else falls back, so a crafted link can't bounce a user to
 * another site right after a real sign-in (open redirect). Isomorphic: no server-only imports.
 *
 * Rejected: missing/empty values, absolute URLs (`https://…`, `javascript:…`), protocol-relative
 * `//host`, `/\host` (browsers treat `\` as `/`), any backslash or control character, and anything
 * that resolves to a different origin.
 */
export function safeNextPath(raw: string | null | undefined, fallback = "/home"): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001F\u007F]/.test(raw)) return fallback;

  const base = "http://same-origin.invalid";
  try {
    const url = new URL(raw, base);
    if (url.origin !== base) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
