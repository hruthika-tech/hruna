/**
 * How a dress's availability is described and whether it can be ordered — the ONE rule every customer
 * page, the designer's studio and the API use. Isomorphic, no side effects (unit-tested by
 * scripts/test-dress-availability-unit.mjs).
 *
 * Two separate fields on public.dresses (supabase/migrations/20261019000001_dress_stock_status.sql):
 *   available     "Available for purchase" — is the dress offered at all?
 *   stock_status  set by the designer — in stock / made to order / currently unavailable
 * A dress can be ordered (the customer's "Contact Designer" path — HRUNA has no checkout; orders are
 * arranged with the designer) only when it's available for purchase AND not currently unavailable.
 */

export const STOCK_STATUSES = ["in_stock", "made_to_order", "unavailable"] as const;
export type StockStatus = (typeof STOCK_STATUSES)[number];

/** Designer-facing options for the Add/Edit dress form, in display order. */
export const STOCK_STATUS_OPTIONS: { value: StockStatus; label: string }[] = [
  { value: "in_stock", label: "In stock" },
  { value: "made_to_order", label: "Made to order" },
  { value: "unavailable", label: "Currently unavailable" },
];

export function isStockStatus(value: unknown): value is StockStatus {
  return typeof value === "string" && (STOCK_STATUSES as readonly string[]).includes(value);
}

export interface DressAvailability {
  /** What customers are told, e.g. "In stock". */
  label: string;
  /** Whether the customer may start an order (Contact Designer) for this exact dress. */
  orderable: boolean;
  /** Short card badge text, or null when the card needs none (an orderable, in-stock dress). */
  badge: string | null;
}

/**
 * `stockStatus` may be missing for data from a database that doesn't have the column yet — that is
 * treated as in stock, which is exactly what customers were shown before stock statuses existed.
 */
export function dressAvailability(dress: { available: boolean; stockStatus?: string | null }): DressAvailability {
  if (!dress.available) return { label: "Not available for purchase", orderable: false, badge: "Unavailable" };
  const status: StockStatus = isStockStatus(dress.stockStatus) ? dress.stockStatus : "in_stock";
  if (status === "made_to_order") return { label: "Made to order", orderable: true, badge: "Made to order" };
  if (status === "unavailable") return { label: "Currently unavailable", orderable: false, badge: "Unavailable" };
  return { label: "In stock", orderable: true, badge: null };
}
