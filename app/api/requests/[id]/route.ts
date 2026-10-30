/**
 * A single request's canonical detail — relies entirely on fashion_requests_select's own RLS
 * (owning customer, admin, an eligible approved designer if public, or the preferred designer if
 * private) rather than re-deciding visibility here: this route just queries by id and returns
 * whatever RLS lets the current session see, which is `null`/404 for anyone unauthorized.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireCustomer, requireUser } from "@/lib/supabase/authorization";
import { errorResponse, isPostgrestError } from "@/lib/supabase/errors";
import { mapRequest, resolveRequestImages } from "@/lib/customer/data";
import { getCustomerSummaries } from "@/lib/designer/data";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireUser();
    const supabase = createClient();

    const { data, error } = await supabase
      .from("fashion_requests")
      .select("*")
      .eq("id", params.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return NextResponse.json({ status: "error", message: "Request not found." }, { status: 404 });
    }

    const images = await resolveRequestImages(supabase, data.id);
    // Embedding the customer summary here (not just on the customer's own view) is what lets an
    // eligible designer see who they'd be working with — the same "who can see this row at all"
    // question is still answered entirely by fashion_requests_select RLS above; this only adds
    // display context for whoever RLS already let through.
    const customers = await getCustomerSummaries(supabase, [data.customer_id]);
    return NextResponse.json({
      status: "ok",
      request: { ...mapRequest(data, images), customer: customers.get(data.customer_id) },
    });
  } catch (err) {
    return errorResponse(err, "api.requests.detail");
  }
}

/**
 * "Delete request" — the customer only, and only before a designer is chosen. Runs
 * public.cancel_request() (migration 20261023000002): row-locked against a concurrent acceptance,
 * closes the request as 'cancelled' and declines its pending proposals; nothing is physically
 * deleted (a real DELETE would cascade away every designer's proposal). Designers get 403 from
 * requireCustomer(); a customer who doesn't own the request gets "not found".
 */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireCustomer();
    const supabase = createClient();
    const { error } = await supabase.rpc("cancel_request", { p_request_id: params.id });
    if (error) {
      // P0001 = cancel_request()'s own, user-facing refusals (not found / already deleted / has a designer).
      if (isPostgrestError(error) && error.code === "P0001") {
        const notFound = error.message === "Request not found";
        return NextResponse.json({ status: "error", message: error.message }, { status: notFound ? 404 : 409 });
      }
      throw error;
    }
    return NextResponse.json({ status: "ok" });
  } catch (err) {
    return errorResponse(err, "api.requests.delete");
  }
}
