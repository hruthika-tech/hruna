import Link from "next/link";
import { Check, ShieldCheck } from "lucide-react";
import { LinkButton } from "@/components/ui/Button";

// Customers use HRUNA for free — there is no customer plan, checkout or paywall (the checkout API
// also refuses role "customer"). This page stays so old links and the profile button still land
// somewhere useful. Old customer subscription and payment records are kept untouched in the
// database (visible to admins as retired-plan history); one-time Razorpay orders never renew.
const INCLUDED = [
  "Browse designers, dresses and collections",
  "Post requests and receive proposals",
  "Message designers and follow your projects",
  "Progress updates, reviews and notifications",
];

export default function CustomerSubscriptionPage() {
  return (
    <div className="min-h-screen flex flex-col items-center py-16 px-6">
      <div className="w-full max-w-lg">
        <div className="flex items-center justify-between mb-10">
          <Link href="/home" className="font-display text-2xl">HRUNA</Link>
          <Link href="/home" className="text-sm text-primary hover:underline">← Back</Link>
        </div>

        <p className="text-label-md text-outline mb-2">MEMBERSHIP</p>
        <h1 className="text-headline-md mb-8">HRUNA is free for customers</h1>

        <div className="flex items-center gap-3 p-4 rounded-md bg-primary-container/40 mb-8" data-testid="customer-free">
          <ShieldCheck className="text-primary shrink-0" size={20} />
          <p className="text-sm text-ink-variant">There&apos;s nothing to buy and nothing to renew. You have full access to HRUNA at no cost.</p>
        </div>

        <div className="border border-outline-variant rounded-md p-6 mb-8">
          <p className="font-display text-xl mb-4">Everything is included</p>
          <div className="flex flex-col gap-2">
            {INCLUDED.map((f) => (
              <div key={f} className="flex items-center gap-2 text-sm text-ink-variant">
                <Check size={14} className="text-primary shrink-0" /> {f}
              </div>
            ))}
          </div>
        </div>

        <LinkButton href="/home" variant="secondary" className="w-full justify-center">Continue to HRUNA</LinkButton>
      </div>
    </div>
  );
}
