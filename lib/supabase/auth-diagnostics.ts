import "server-only";

/**
 * Diagnostic fetch wrapper for Supabase Auth calls — pass to createClient({ fetch }) at a call site
 * whose failures need investigating. Exists because auth-js turns every HTTP 5xx from GoTrue into an
 * AuthRetryableFetchError that keeps only the message and drops GoTrue's error `code` (e.g.
 * "unexpected_failure" for a mailer/SMTP failure behind "Error sending confirmation email").
 *
 * Logs ONLY for non-2xx /auth/v1/ responses, and only an allow-listed set of fields: HTTP status,
 * the endpoint path (no query string), GoTrue's error code/message, and request-correlation headers
 * (so the line can be matched to the entry in Supabase Dashboard → Logs → Auth, which holds the
 * real SMTP error). Never logs request bodies (password, email, metadata), response tokens,
 * apikey/Authorization headers, or cookies.
 */

const CORRELATION_HEADERS = ["sb-request-id", "x-sb-error-code", "x-request-id", "cf-ray"];

function pickString(value: unknown): string | undefined {
  return typeof value === "string" ? value.slice(0, 300) : undefined;
}

export function authDiagnosticFetch(context: string): typeof fetch {
  return async (input, init) => {
    const response = await fetch(input, init);
    try {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (!response.ok && url.pathname.includes("/auth/v1/")) {
        let body: Record<string, unknown> = {};
        try {
          const parsed = await response.clone().json();
          if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
        } catch {
          // Non-JSON error body (e.g. a gateway HTML page) — status + headers are still logged.
        }
        const headers: Record<string, string> = {};
        for (const name of CORRELATION_HEADERS) {
          const value = response.headers.get(name);
          if (value) headers[name] = value;
        }
        console.error(`[supabase-auth-diagnostic:${context}]`, {
          status: response.status,
          endpoint: url.pathname,
          code: pickString(body.code) ?? pickString(body.error_code),
          message: pickString(body.msg) ?? pickString(body.message) ?? pickString(body.error_description),
          error: pickString(body.error),
          headers,
        });
      }
    } catch {
      // Diagnostics must never change the request's outcome.
    }
    return response;
  };
}
