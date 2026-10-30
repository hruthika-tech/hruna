"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Field, Input, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { Toggle } from "@/components/ui/Toggle";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { ANALYTICS_DAY_OPTIONS, FIXED_STUDIO_LIMITS, type AdminLimitField, type PlanLimits } from "@/lib/subscriptions/plans";

// Admin billing: customers are free; designers have three plans (Free / Designer Plus / Designer
// Pro). Everything here goes through the admin-only APIs (/api/admin/subscriptions,
// /api/admin/subscriptions/plans/[id], /api/admin/settings/payment), which validate on the server.

const TXN_FILTERS = [
  { label: "All", value: "all" },
  { label: "Successful", value: "succeeded" },
  { label: "Pending", value: "pending" },
  { label: "Failed", value: "failed" },
  { label: "Refunded", value: "refunded" },
];
const CURRENCIES = ["INR", "USD", "EUR", "GBP"];
const LIMIT_ROWS: [AdminLimitField, string][] = [
  ["dresses", "Dress listings"],
  ["collections", "Collections"],
  ["previous_creations", "Previous creations"],
  ["proposals_per_month", "Proposals per calendar month"],
];

interface Settings { paymentSystemEnabled: boolean; customerSubscriptionsEnabled: boolean; designerSubscriptionsEnabled: boolean; currency: string }
interface Plan {
  id: string; role: string; name: string; price: number; currency: string; billingInterval: string; description: string;
  features: string[]; isActive: boolean; planKey: string | null; legacy: boolean; limits: PlanLimits | null;
}
interface Sub { id: string; userId: string; status: string; endDate?: string; user: { name: string; type: string } }
interface Payment {
  id: string; userId: string; planId?: string; amount: number; currency: string; status: string; transactionId?: string; orderId?: string;
  paidAt?: string; createdAt: string; user: { name: string; type: string }; planName: string | null; planRole: string | null; planLegacy: boolean | null;
}

export default function AdminSubscriptionsPage() {
  const { push } = useToast();
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState("");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [plansReady, setPlansReady] = useState(false);
  const [designerPlans, setDesignerPlans] = useState<Plan[]>([]);
  const [legacyPlans, setLegacyPlans] = useState<Plan[]>([]);
  const [subscriptions, setSubscriptions] = useState<Sub[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [txnFilter, setTxnFilter] = useState("all");
  const [settingsBusy, setSettingsBusy] = useState(false);

  const load = async () => {
    try {
      const res = await fetch("/api/admin/subscriptions");
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Couldn't load billing settings.");
      setSettings(data.settings);
      setPlansReady(data.plansReady);
      setDesignerPlans(data.designerPlans);
      setLegacyPlans(data.legacyPlans);
      setSubscriptions(data.subscriptions);
      setPayments(data.payments);
      setStatus("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load billing settings.");
      setStatus("error");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const patchSettings = async (patch: Record<string, unknown>, successMessage: string) => {
    setSettingsBusy(true);
    try {
      const res = await fetch("/api/admin/settings/payment", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Couldn't update settings.");
      push(successMessage);
      await load();
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't update settings.", "error");
    } finally {
      setSettingsBusy(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center gap-2 text-white/50 py-24">
        <Loader2 className="animate-spin" size={18} /> Loading billing settings…
      </div>
    );
  }
  if (status === "error" || !settings) {
    return (
      <div className="text-center py-24">
        <p className="text-lg font-display mb-2">Couldn&apos;t load billing settings</p>
        <p className="text-white/50 text-sm">{error}</p>
      </div>
    );
  }

  const now = Date.now();
  const running = subscriptions.filter((s) => s.status === "active" && (!s.endDate || new Date(s.endDate).getTime() > now)).length;
  const ended = subscriptions.filter((s) => s.status === "expired" || (s.status === "active" && s.endDate && new Date(s.endDate).getTime() <= now)).length;
  const cancelled = subscriptions.filter((s) => s.status === "cancelled").length;
  const plansOn = settings.paymentSystemEnabled && settings.designerSubscriptionsEnabled;

  const today = new Date();
  const isSameDay = (iso?: string) => !!iso && new Date(iso).toDateString() === today.toDateString();
  const isSameMonth = (iso?: string) => !!iso && new Date(iso).getMonth() === today.getMonth() && new Date(iso).getFullYear() === today.getFullYear();
  const succeeded = payments.filter((p) => p.status === "succeeded");
  const sum = (list: Payment[]) => list.reduce((s, p) => s + p.amount, 0);
  const transactions = [...payments]
    .filter((p) => txnFilter === "all" || p.status === txnFilter)
    .sort((a, b) => ((a.paidAt ?? a.createdAt) < (b.paidAt ?? b.createdAt) ? 1 : -1));

  return (
    <div>
      <p className="text-white/50 text-xs tracking-wide uppercase mb-2">Subscription & Payments</p>
      <h1 className="text-2xl font-display mb-2">Billing settings</h1>
      <p className="text-sm text-white/50 mb-8">Customers use HRUNA for free. Designers choose Free, Designer Plus or Designer Pro. There are no commissions or customer payments.</p>

      {/* Platform subscription settings */}
      <section className="border border-white/10 rounded-md p-6 mb-10" data-testid="platform-settings">
        <p className="text-sm font-medium mb-4">PLATFORM SUBSCRIPTION SETTINGS</p>
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-white/80">Paid designer plans</p>
            <p className="text-xs text-white/50 mt-1">
              {plansOn
                ? "On — designer plan limits apply, and designers can start the 14-day Pro trial or buy Designer Plus / Pro."
                : "Off — no designer is limited, no trial or paid plan is offered, and nothing is charged. Nobody is ever locked out of HRUNA either way."}
            </p>
          </div>
          <Toggle
            checked={settings.paymentSystemEnabled}
            disabled={settingsBusy}
            onChange={(v) => patchSettings({ paymentSystemEnabled: v }, v ? "Payments switched on." : "Payments switched off.")}
          />
        </div>
        <div className="pt-4 mt-4 border-t border-white/10 flex items-center justify-between gap-4">
          <div>
            <span className="text-sm text-white/70">Designer subscriptions</span>
            <p className="text-xs text-white/40 mt-0.5">Both switches must be on for designer plans to take effect.</p>
          </div>
          <Toggle
            checked={settings.designerSubscriptionsEnabled}
            disabled={settingsBusy}
            inactive={!settings.paymentSystemEnabled}
            onChange={(v) => patchSettings({ designerSubscriptionsEnabled: v }, "Designer subscriptions updated.")}
          />
        </div>
        <p className="text-xs text-white/40 mt-4 pt-4 border-t border-white/10">Customer subscriptions: none — customers are always free.</p>
        {settings.customerSubscriptionsEnabled && (
          <div className="mt-3 flex items-center justify-between gap-4 flex-wrap text-xs bg-white/5 rounded px-3 py-2" data-testid="legacy-customer-switch">
            <span className="text-white/60">The old customer-subscription flag is still on in the database. It has no effect (customers are never charged or blocked).</span>
            <Button size="sm" variant="secondary" disabled={settingsBusy} onClick={() => patchSettings({ customerSubscriptionsEnabled: false }, "Legacy customer flag turned off.")}>Turn off</Button>
          </div>
        )}
        <div className="pt-4 mt-4 border-t border-white/10 max-w-xs">
          <label className="text-xs text-white/50 block mb-2">Platform default currency</label>
          <select
            value={settings.currency}
            disabled={settingsBusy}
            onChange={(e) => patchSettings({ currency: e.target.value }, "Currency updated.")}
            className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white"
          >
            {CURRENCIES.map((c) => <option key={c} value={c} className="text-ink">{c}</option>)}
          </select>
        </div>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        <StatCard label="Running designer subscriptions (paid + trials)" value={running} />
        <StatCard label="Ended or expired" value={ended} />
        <StatCard label="Cancelled" value={cancelled} />
      </section>

      {/* Designer plan management */}
      <section className="mb-10" data-testid="designer-plans-admin">
        <p className="text-sm font-medium mb-1">DESIGNER PLANS</p>
        <p className="text-xs text-white/50 mb-4">
          Messaging, projects, progress updates, reviews and notifications are included on every plan. Verification is earned, never sold. Limits left empty are unlimited.
        </p>
        {!plansReady ? (
          <p className="text-sm text-white/60 border border-white/10 rounded-md p-5" data-testid="plans-not-ready">
            The designer plans aren&apos;t set up on this database yet — apply migrations 20261028000001, 20261029000001 and 20261029000002. Until then nobody is limited and nothing can be bought.
          </p>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {designerPlans.map((plan) => (
              <PlanEditor key={`${plan.id}-${plan.price}-${plan.name}`} plan={plan} onSaved={() => { push(`${plan.name} saved.`); load(); }} />
            ))}
          </div>
        )}
      </section>

      {legacyPlans.length > 0 && (
        <section className="border border-white/10 rounded-md p-6 mb-10" data-testid="legacy-plans">
          <p className="text-sm font-medium mb-1">RETIRED PLANS (HISTORY)</p>
          <p className="text-xs text-white/50 mb-4">Kept so past payments and subscriptions stay intact. They can&apos;t be bought, edited or switched back on.</p>
          <ul className="flex flex-col gap-2 text-sm">
            {legacyPlans.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-4 flex-wrap text-white/70">
                <span>{p.name} <span className="text-white/40">({p.role})</span></span>
                <span className="text-white/50">{formatCurrency(p.price, p.currency)}/{p.billingInterval === "monthly" ? "month" : p.billingInterval} · not sold</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="border border-white/10 rounded-md p-6">
        <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
          <p className="text-sm font-medium">Payment Transactions</p>
          <div className="flex gap-1.5 flex-wrap">
            {TXN_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setTxnFilter(f.value)}
                className={cn("text-xs px-3 py-1.5 rounded-full border border-white/10 transition-colors", txnFilter === f.value ? "bg-white text-ink" : "text-white/60 hover:bg-white/5")}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
          <StatCard label="Today's Revenue" value={formatCurrency(sum(succeeded.filter((p) => isSameDay(p.paidAt))))} />
          <StatCard label="Monthly Revenue" value={formatCurrency(sum(succeeded.filter((p) => isSameMonth(p.paidAt))))} />
          <StatCard label="Total Revenue" value={formatCurrency(sum(succeeded))} />
          <StatCard label="Designer plan revenue" value={formatCurrency(sum(succeeded.filter((p) => p.planLegacy === false)))} />
          <StatCard label="Retired-plan revenue (history)" value={formatCurrency(sum(succeeded.filter((p) => p.planLegacy !== false)))} />
        </div>

        {transactions.length === 0 ? (
          <p className="text-sm text-white/40">No payment transactions yet.</p>
        ) : (
          <div className="flex flex-col gap-1">
            <div className="hidden lg:flex items-center gap-4 px-3 py-2 text-[11px] uppercase tracking-wide text-white/30">
              <span className="w-28">Transaction</span>
              <span className="flex-1">User · plan</span>
              <span className="w-24 text-right">Amount</span>
              <span className="w-28">Status</span>
              <span className="w-24 text-right">Date</span>
            </div>
            {transactions.map((p) => (
              <div key={p.id} className="flex flex-col lg:flex-row lg:items-center gap-1.5 lg:gap-4 px-3 py-3 rounded border border-white/5 lg:border-none text-xs text-white/70">
                <span className="lg:w-28 font-mono text-white/50 truncate" title={p.orderId ? `Razorpay order: ${p.orderId}` : undefined}>{p.transactionId ?? p.id}</span>
                <span className="lg:flex-1">{p.user.name} <span className="text-white/40">· {p.planName ?? "unknown plan"}{p.planLegacy ? " (retired)" : ""}</span></span>
                <span className="lg:w-24 lg:text-right text-white/80">{formatCurrency(p.amount, p.currency)}</span>
                <span className="lg:w-28"><StatusBadge status={p.status} /></span>
                <span className="lg:w-24 lg:text-right text-white/40">{p.paidAt ? formatDate(p.paidAt) : formatDate(p.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-white/30 mt-6 pt-6 border-t border-white/10">Refunds and retries aren&apos;t actionable here — this is a monitoring view over real payment records.</p>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="border border-white/10 rounded-md p-5">
      <p className="text-2xl font-display">{value}</p>
      <p className="text-xs text-white/50 mt-1">{label}</p>
    </div>
  );
}

function PlanEditor({ plan, onSaved }: { plan: Plan; onSaved: () => void }) {
  const { push } = useToast();
  const isFree = plan.planKey === "designer_free";
  const limits = plan.limits!;
  const [name, setName] = useState(plan.name);
  const [price, setPrice] = useState(String(plan.price));
  const [description, setDescription] = useState(plan.description);
  const [features, setFeatures] = useState(plan.features.join("\n"));
  const [isActive, setIsActive] = useState(plan.isActive);
  const [limitValues, setLimitValues] = useState<Record<AdminLimitField, string>>({
    dresses: limits.dresses === null ? "" : String(limits.dresses),
    collections: limits.collections === null ? "" : String(limits.collections),
    previous_creations: limits.previous_creations === null ? "" : String(limits.previous_creations),
    proposals_per_month: limits.proposals_per_month === null ? "" : String(limits.proposals_per_month),
  });
  const [analyticsDays, setAnalyticsDays] = useState(limits.analytics_max_days ?? 90);
  const [comparison, setComparison] = useState(limits.analytics_comparison);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const body = {
        name,
        ...(isFree ? {} : { price: Number(price) }),
        description,
        features: features.split("\n").map((f) => f.trim()).filter(Boolean),
        isActive,
        limits: {
          ...Object.fromEntries(LIMIT_ROWS.map(([key]) => [key, limitValues[key].trim() === "" ? null : Number(limitValues[key])])),
          analytics_max_days: analyticsDays,
          analytics_comparison: comparison,
        },
      };
      const res = await fetch(`/api/admin/subscriptions/plans/${plan.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Couldn't save this plan.");
      onSaved();
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't save this plan.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-surface-lowest text-ink rounded-md p-6 flex flex-col gap-4" data-testid={`admin-plan-${plan.planKey}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-label-md text-outline uppercase">{plan.planKey?.replace("designer_", "")} plan · {plan.billingInterval}</p>
        <label className="flex items-center gap-2 text-xs" title={isFree ? "The Free plan is always on" : undefined}>
          <input type="checkbox" checked={isActive} disabled={isFree} onChange={(e) => setIsActive(e.target.checked)} /> Active
        </label>
      </div>
      <Field label="Plan name" htmlFor={`name-${plan.id}`}><Input id={`name-${plan.id}`} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label={`Monthly price (${plan.currency})`} htmlFor={`price-${plan.id}`} hint={isFree ? "Always ₹0 — the Free plan never opens a checkout." : "Charged at checkout exactly as saved here."}>
        <Input id={`price-${plan.id}`} type="number" min={0} step="0.01" value={price} disabled={isFree} onChange={(e) => setPrice(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        {LIMIT_ROWS.map(([key, label]) => (
          <Field key={key} label={label} htmlFor={`${key}-${plan.id}`}>
            <Input
              id={`${key}-${plan.id}`}
              type="number"
              min={0}
              step={1}
              placeholder="Unlimited"
              value={limitValues[key]}
              onChange={(e) => setLimitValues((v) => ({ ...v, [key]: e.target.value }))}
            />
          </Field>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 items-end">
        <Field label="Analytics history" htmlFor={`days-${plan.id}`}>
          <select id={`days-${plan.id}`} value={analyticsDays} onChange={(e) => setAnalyticsDays(Number(e.target.value))} className="w-full rounded bg-surface-low border border-outline-variant px-4 py-3 text-body-md">
            {ANALYTICS_DAY_OPTIONS.map((d) => <option key={d} value={d}>{d} days</option>)}
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm pb-3">
          <input type="checkbox" checked={comparison} onChange={(e) => setComparison(e.target.checked)} /> Period comparison
        </label>
      </div>
      <p className="text-xs text-outline">Studio highlights: {FIXED_STUDIO_LIMITS.highlights} · Meet the Designer entries: {FIXED_STUDIO_LIMITS.meet_entries} (same on every plan)</p>
      <Field label="Description" htmlFor={`desc-${plan.id}`}><Textarea id={`desc-${plan.id}`} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      <Field label="Features shown to designers (one per line)" htmlFor={`features-${plan.id}`}>
        <Textarea id={`features-${plan.id}`} value={features} onChange={(e) => setFeatures(e.target.value)} className="min-h-[140px]" />
      </Field>
      <Button onClick={save} className="w-fit" disabled={saving} data-testid={`save-${plan.planKey}`}>{saving ? "Saving…" : "Save Plan"}</Button>
    </div>
  );
}
