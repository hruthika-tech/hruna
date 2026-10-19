"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Field, Input, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { Toggle } from "@/components/ui/Toggle";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate, cn } from "@/lib/utils";

const TXN_FILTERS = [
  { label: "All", value: "all" },
  { label: "Successful", value: "succeeded" },
  { label: "Pending", value: "pending" },
  { label: "Failed", value: "failed" },
  { label: "Refunded", value: "refunded" },
];
const CURRENCIES = ["INR", "USD", "EUR", "GBP"];

interface Settings { paymentSystemEnabled: boolean; customerSubscriptionsEnabled: boolean; designerSubscriptionsEnabled: boolean; currency: string }
interface Plan { id: string; role: string; name: string; price: number; currency: string; description: string; features: string[]; isActive: boolean }
interface Sub { id: string; userId: string; status: string; user: { name: string; type: string } }
interface Payment { id: string; userId: string; planId?: string; amount: number; currency: string; status: string; transactionId?: string; orderId?: string; paidAt?: string; createdAt: string; user: { name: string; type: string } }

export default function AdminSubscriptionsPage() {
  const { push } = useToast();
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState("");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
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
      setPlans(data.plans);
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
      const res = await fetch("/api/admin/settings/payment", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
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
        <p className="text-lg font-display mb-2">Couldn't load billing settings</p>
        <p className="text-white/50 text-sm">{error}</p>
      </div>
    );
  }

  const active = subscriptions.filter((s) => s.status === "active").length;
  const expired = subscriptions.filter((s) => s.status === "expired").length;
  const cancelled = subscriptions.filter((s) => s.status === "cancelled").length;

  const now = new Date();
  const isSameDay = (iso?: string) => !!iso && new Date(iso).toDateString() === now.toDateString();
  const isSameMonth = (iso?: string) => !!iso && new Date(iso).getMonth() === now.getMonth() && new Date(iso).getFullYear() === now.getFullYear();
  const succeeded = payments.filter((p) => p.status === "succeeded");
  const todayRevenue = succeeded.filter((p) => isSameDay(p.paidAt)).reduce((sum, p) => sum + p.amount, 0);
  const monthRevenue = succeeded.filter((p) => isSameMonth(p.paidAt)).reduce((sum, p) => sum + p.amount, 0);
  const totalRevenue = succeeded.reduce((sum, p) => sum + p.amount, 0);
  const customerRevenue = succeeded.filter((p) => p.user.type === "Customer").reduce((sum, p) => sum + p.amount, 0);
  const designerRevenue = succeeded.filter((p) => p.user.type === "Designer").reduce((sum, p) => sum + p.amount, 0);

  const transactions = [...payments]
    .filter((p) => txnFilter === "all" || p.status === txnFilter)
    .sort((a, b) => ((a.paidAt ?? a.createdAt) < (b.paidAt ?? b.createdAt) ? 1 : -1));

  return (
    <div>
      <p className="text-white/50 text-xs tracking-wide uppercase mb-2">Subscription & Payments</p>
      <h1 className="text-2xl font-display mb-8">Billing settings</h1>

      <section className="border border-white/10 rounded-md p-6 mb-10">
        <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium mb-1">SUBSCRIPTIONS</p>
            <p className="text-xs text-white/50">
              {settings.paymentSystemEnabled
                ? "Subscriptions are enforced — users without an active plan will see the subscribe page."
                : "No subscription payments are currently required."}
            </p>
          </div>
          <Toggle
            checked={settings.paymentSystemEnabled}
            disabled={settingsBusy}
            onChange={(v) => patchSettings({ paymentSystemEnabled: v }, v ? "Payment system enabled." : "Payment system disabled.")}
          />
        </div>
        <div className="pt-4 border-t border-white/10 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-white/70">Customer subscriptions</span>
            <Toggle
              checked={settings.customerSubscriptionsEnabled}
              disabled={settingsBusy}
              inactive={!settings.paymentSystemEnabled}
              onChange={(v) => patchSettings({ customerSubscriptionsEnabled: v }, "Customer subscription requirement updated.")}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-white/70">Designer subscriptions</span>
            <Toggle
              checked={settings.designerSubscriptionsEnabled}
              disabled={settingsBusy}
              inactive={!settings.paymentSystemEnabled}
              onChange={(v) => patchSettings({ designerSubscriptionsEnabled: v }, "Designer subscription requirement updated.")}
            />
          </div>
          {!settings.paymentSystemEnabled && (
            <p className="text-xs text-white/30">
              Shown dimmed because SUBSCRIPTIONS is OFF above — these settings are saved but won't take effect until it's turned on.
            </p>
          )}
        </div>
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
        <StatCard label="Active Subscriptions" value={active} />
        <StatCard label="Expired Subscriptions" value={expired} />
        <StatCard label="Cancelled Subscriptions" value={cancelled} />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
        {plans.map((plan) => (
          <PlanEditor key={plan.id} plan={plan} onSaved={() => { push("Plan updated."); load(); }} />
        ))}
      </div>

      <section className="border border-white/10 rounded-md p-6">
        <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
          <p className="text-sm font-medium">Payment Transactions</p>
          <div className="flex gap-1.5 flex-wrap">
            {TXN_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setTxnFilter(f.value)}
                className={cn(
                  "text-xs px-3 py-1.5 rounded-full border border-white/10 transition-colors",
                  txnFilter === f.value ? "bg-white text-ink" : "text-white/60 hover:bg-white/5"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
          <StatCard label="Today's Revenue" value={formatCurrency(todayRevenue)} />
          <StatCard label="Monthly Revenue" value={formatCurrency(monthRevenue)} />
          <StatCard label="Total Revenue" value={formatCurrency(totalRevenue)} />
          <StatCard label="Customer Sub. Revenue" value={formatCurrency(customerRevenue)} />
          <StatCard label="Designer Sub. Revenue" value={formatCurrency(designerRevenue)} />
        </div>

        {transactions.length === 0 ? (
          <p className="text-sm text-white/40">
            No real payment transactions yet — a payment gateway hasn't been connected. This view will show real
            transactions the moment one is (see <code className="text-white/30">payments</code>).
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            <div className="hidden lg:flex items-center gap-4 px-3 py-2 text-[11px] uppercase tracking-wide text-white/30">
              <span className="w-28">Transaction</span>
              <span className="flex-1">User</span>
              <span className="w-24 text-right">Amount</span>
              <span className="w-28">Status</span>
              <span className="w-24 text-right">Date</span>
            </div>
            {transactions.map((p) => (
              <div key={p.id} className="flex flex-col lg:flex-row lg:items-center gap-1.5 lg:gap-4 px-3 py-3 rounded border border-white/5 lg:border-none text-xs text-white/70">
                <span
                  className="lg:w-28 font-mono text-white/50 truncate"
                  title={p.orderId ? `Razorpay order: ${p.orderId}` : undefined}
                >
                  {p.transactionId ?? p.id}
                </span>
                <span className="lg:flex-1">{p.user.name} <span className="text-white/40">({p.user.type})</span></span>
                <span className="lg:w-24 lg:text-right text-white/80">{formatCurrency(p.amount, p.currency)}</span>
                <span className="lg:w-28"><StatusBadge status={p.status} /></span>
                <span className="lg:w-24 lg:text-right text-white/40">{p.paidAt ? formatDate(p.paidAt) : formatDate(p.createdAt)}</span>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-white/30 mt-6 pt-6 border-t border-white/10">
          Refunds and retries aren't actionable here yet — this is a monitoring view over real payment records. Actual
          payment gateway integration (Razorpay/Stripe) is a later phase.
        </p>
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
  const [name, setName] = useState(plan.name);
  const [price, setPrice] = useState(String(plan.price));
  const [currency, setCurrency] = useState(plan.currency);
  const [description, setDescription] = useState(plan.description);
  const [features, setFeatures] = useState(plan.features.join("\n"));
  const [isActive, setIsActive] = useState(plan.isActive);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/subscriptions/plans/${plan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          price: Number(price) || 0,
          currency,
          description,
          features: features.split("\n").map((f) => f.trim()).filter(Boolean),
          isActive,
        }),
      });
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
    <div className="bg-surface-lowest text-ink rounded-md p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-label-md text-outline uppercase">{plan.role} plan</p>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Active
        </label>
      </div>
      <Field label="Plan name" htmlFor={`name-${plan.id}`}><Input id={`name-${plan.id}`} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Monthly price" htmlFor={`price-${plan.id}`}><Input id={`price-${plan.id}`} type="number" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
        <Field label="Currency" htmlFor={`currency-${plan.id}`}>
          <select
            id={`currency-${plan.id}`}
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="w-full rounded bg-surface-low border border-outline-variant px-4 py-3 text-body-md"
          >
            {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Description" htmlFor={`desc-${plan.id}`}><Textarea id={`desc-${plan.id}`} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      <Field label="Features (one per line)" htmlFor={`features-${plan.id}`}>
        <Textarea id={`features-${plan.id}`} value={features} onChange={(e) => setFeatures(e.target.value)} className="min-h-[140px]" />
      </Field>
      <Button onClick={save} className="w-fit" disabled={saving}>{saving ? "Saving…" : "Save Plan"}</Button>
    </div>
  );
}
