"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  ShieldCheck,
  Hourglass,
  Briefcase,
  CheckCircle2,
  CreditCard,
  Wallet,
  AlertTriangle,
  UserPlus,
  FileText,
  Sparkles,
  PackageCheck,
  Receipt,
  MessageSquareWarning,
  Loader2,
} from "lucide-react";
import { formatCurrency, timeAgo, cn } from "@/lib/utils";

interface Stats {
  totalCustomers: number;
  totalDesigners: number;
  verifiedDesigners: number;
  pendingVerifications: number;
  activeProjects: number;
  completedProjects: number;
  activeSubscriptions: number;
  monthlyRevenue: number;
  pendingDisputes: number;
}
interface ActivityItem { id: string; text: string; timestamp: string; type: string }
interface MonthlyBar { label: string; total: number }

const ICON_BY_TYPE: Record<string, any> = {
  request: Sparkles,
  project: Briefcase,
  verification: ShieldCheck,
  dispute: MessageSquareWarning,
};

export default function AdminDashboardPage() {
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [monthlyBars, setMonthlyBars] = useState<MonthlyBar[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/dashboard");
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? "Couldn't load the dashboard.");
        setStats(data.stats);
        setActivity(data.activity);
        setMonthlyBars(data.monthlyBars);
        setStatus("ready");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't load the dashboard.");
        setStatus("error");
      }
    })();
  }, []);

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center gap-2 text-white/50 py-24">
        <Loader2 className="animate-spin" size={18} /> Loading dashboard…
      </div>
    );
  }
  if (status === "error" || !stats) {
    return (
      <div className="text-center py-24">
        <p className="text-lg font-display mb-2">Couldn't load the dashboard</p>
        <p className="text-white/50 text-sm">{error}</p>
      </div>
    );
  }

  const maxMonthly = Math.max(1, ...monthlyBars.map((m) => m.total));

  return (
    <div>
      <p className="text-white/50 text-xs tracking-wide uppercase mb-2">Overview</p>
      <h1 className="text-2xl font-display mb-8">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
        <StatCard icon={Users} label="Total Customers" value={stats.totalCustomers} href="/admin/users" />
        <StatCard icon={Users} label="Total Designers" value={stats.totalDesigners} href="/admin/users" />
        <StatCard icon={ShieldCheck} label="Verified Designers" value={stats.verifiedDesigners} href="/admin/verification" />
        <StatCard icon={Hourglass} label="Pending Verifications" value={stats.pendingVerifications} href="/admin/verification" />
        <StatCard icon={Briefcase} label="Active Projects" value={stats.activeProjects} />
        <StatCard icon={CheckCircle2} label="Completed Projects" value={stats.completedProjects} />
        <StatCard icon={CreditCard} label="Active Subscriptions" value={stats.activeSubscriptions} href="/admin/subscriptions" />
        <StatCard icon={Wallet} label="Monthly Revenue" value={formatCurrency(stats.monthlyRevenue)} href="/admin/subscriptions" />
        <StatCard icon={AlertTriangle} label="Pending Disputes" value={stats.pendingDisputes} href="/admin/disputes" tone={stats.pendingDisputes > 0 ? "warning" : undefined} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <section className="lg:col-span-3 border border-white/10 rounded-md p-6">
          <p className="text-sm font-medium mb-5">Recent activity</p>
          {activity.length === 0 ? (
            <p className="text-sm text-white/40">Nothing to show yet.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {activity.map((a) => {
                const Icon = ICON_BY_TYPE[a.type] ?? UserPlus;
                return (
                  <div key={a.id} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-white/5 text-white/60 flex items-center justify-center shrink-0">
                      <Icon size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white/80 truncate">{a.text}</p>
                      <p className="text-xs text-white/35 mt-0.5">{timeAgo(a.timestamp)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="lg:col-span-2 border border-white/10 rounded-md p-6">
          <p className="text-sm font-medium mb-5">Revenue — last 6 months</p>
          <div className="flex flex-col gap-3">
            {monthlyBars.map((m) => (
              <div key={m.label} className="flex items-center gap-3">
                <span className="text-xs text-white/40 w-8 shrink-0">{m.label}</span>
                <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500/70"
                    style={{ width: `${Math.max(4, (m.total / maxMonthly) * 100)}%` }}
                  />
                </div>
                <span className="text-xs text-white/50 w-16 shrink-0 text-right">{formatCurrency(m.total)}</span>
              </div>
            ))}
          </div>
          <Link href="/admin/subscriptions" className="text-xs text-white/50 hover:text-white hover:underline mt-5 inline-block">
            View full payment history →
          </Link>
        </section>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  href,
  tone,
}: {
  icon: any;
  label: string;
  value: number | string;
  href?: string;
  tone?: "warning";
}) {
  const content = (
    <div className={cn("border rounded-md p-5 h-full transition-colors", tone === "warning" ? "border-amber-500/30 bg-amber-500/5" : "border-white/10", href && "hover:bg-white/5")}>
      <div className="flex items-center gap-2 mb-3 text-white/40">
        <Icon size={15} />
        <p className="text-xs uppercase tracking-wide">{label}</p>
      </div>
      <p className="text-2xl font-display">{value}</p>
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}
