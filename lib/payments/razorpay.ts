import "server-only";

/**
 * Thin Razorpay client — the only file that reaches out to Razorpay's API. Everything else
 * (checkout/verify/webhook routes) calls through here, so there's exactly one place that knows
 * Razorpay's request/response shapes.
 *
 * Integration model: Orders + Checkout (a one-time payment for 30 days of access), not Razorpay's
 * Subscriptions/recurring-mandate API. Uses Razorpay's documented REST API directly
 * (POST /v1/orders, GET /v1/payments/:id, HTTP Basic auth with key id + secret).
 *
 * Local tests can point the API at a mock server via RAZORPAY_API_BASE_URL_FOR_TESTS — honoured
 * ONLY outside production builds, ONLY with a test-mode key id (rzp_test_…) and ONLY for a
 * loopback address, so it can never redirect a deployed site's payment traffic.
 */

import crypto from "node:crypto";
import { razorpayConfig } from "./config";

const LIVE_API = "https://api.razorpay.com/v1";

function apiBase(): string {
  const override = process.env.RAZORPAY_API_BASE_URL_FOR_TESTS;
  if (!override || process.env.NODE_ENV === "production") return LIVE_API;
  if (!razorpayConfig.keyId().startsWith("rzp_test_")) return LIVE_API;
  try {
    const host = new URL(override).hostname;
    if (host === "127.0.0.1" || host === "localhost" || host === "[::1]") return override.replace(/\/$/, "");
  } catch {}
  return LIVE_API;
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const auth = Buffer.from(`${razorpayConfig.keyId()}:${razorpayConfig.keySecret()}`).toString("base64");
  const res = await fetch(`${apiBase()}${path}`, {
    method,
    headers: { Authorization: `Basic ${auth}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    // Only the status and Razorpay's error code — never the request, headers or credentials.
    const detail = await res.json().catch(() => null);
    throw new Error(`Razorpay ${method} ${path.split("/").slice(0, 2).join("/")} failed: ${res.status} ${detail?.error?.code ?? ""}`.trim());
  }
  return (await res.json()) as T;
}

export interface CreateOrderParams {
  /** Rupees (or the plan's currency's major unit) — converted to the provider's minor unit (paise) internally. */
  amount: number;
  currency: string;
  /** Razorpay requires receipt <= 40 chars. */
  receipt: string;
  notes: Record<string, string>;
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
}

export async function createRazorpayOrder(params: CreateOrderParams): Promise<RazorpayOrder> {
  // Razorpay amounts are always in the smallest currency unit (paise for INR) — Math.round guards
  // against floating-point drift on values like 299.00 * 100.
  return call<RazorpayOrder>("POST", "/orders", {
    amount: Math.round(params.amount * 100),
    currency: params.currency,
    receipt: params.receipt,
    notes: params.notes,
  });
}

/** The fields of Razorpay's payment entity this app relies on. */
export interface RazorpayPayment {
  id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  amount_refunded?: number;
}

/** The payment as Razorpay itself reports it (server-to-server) — never the browser's account of it. */
export async function fetchRazorpayPayment(paymentId: string): Promise<RazorpayPayment> {
  if (!/^pay_[A-Za-z0-9]+$/.test(paymentId)) throw new Error("Invalid Razorpay payment id.");
  return call<RazorpayPayment>("GET", `/payments/${paymentId}`);
}

/** Constant-time comparison — never use `===` for secrets/signatures (timing side-channel). */
function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verifies a Checkout success response server-side — never trust `razorpay_payment_id`/
 * `razorpay_order_id` reported by the browser without this. Formula per Razorpay's docs:
 * generated_signature = HMAC-SHA256(order_id + "|" + payment_id, key_secret).
 */
export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
  const expected = crypto.createHmac("sha256", razorpayConfig.keySecret()).update(`${orderId}|${paymentId}`).digest("hex");
  return timingSafeEqualHex(expected, signature);
}

/**
 * Verifies an incoming webhook request server-side. Formula per Razorpay's docs:
 * signature = HMAC-SHA256(raw_request_body, webhook_secret). MUST be computed over the exact raw
 * request body bytes/text — never the re-serialized parsed JSON, which can differ byte-for-byte
 * (key order, whitespace) and would make a genuine webhook fail verification.
 */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const expected = crypto.createHmac("sha256", razorpayConfig.webhookSecret()).update(rawBody).digest("hex");
  return timingSafeEqualHex(expected, signature);
}
