/**
 * Paid designer plans are a one-time purchase of exactly 30 days — nothing renews and nothing is
 * charged again, so there is nothing to cancel. This route used to end paid access immediately
 * (losing days the designer had paid for); it now changes nothing and says so. Paid access always
 * runs to its end date and then falls back to Free (designer_effective_plan()). Refunds are a
 * separate, manual Razorpay action handled by the webhook (refund.processed).
 *
 * Kept (rather than removed) so an old client calling it gets a clear answer instead of a 404.
 */

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/authorization";
import { errorResponse } from "@/lib/supabase/errors";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await requireUser();
    return NextResponse.json(
      {
        status: "error",
        code: "non_renewing",
        message: "Plans don't renew automatically, so there's nothing to cancel — your plan stays active until its end date, then you're on Free.",
      },
      { status: 409 }
    );
  } catch (err) {
    return errorResponse(err, "api.payments.cancel");
  }
}
