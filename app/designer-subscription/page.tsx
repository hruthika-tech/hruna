import { DesignerPlansView } from "./DesignerPlansView";

// Designer plans (Free / Designer Plus / Designer Pro) and the one-time Designer Pro trial. The
// page itself is just a frame: plan data, usage and every action go through /api/designer/plan and
// the existing /api/payments/* routes, which enforce the rules server-side.
export default function DesignerSubscriptionPage() {
  return (
    <div className="min-h-screen bg-surface">
      <div className="container-editorial py-12 md:py-16 pb-section-gap">
        <DesignerPlansView />
      </div>
    </div>
  );
}
