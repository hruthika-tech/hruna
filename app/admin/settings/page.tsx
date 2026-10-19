"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldAlert, Loader2 } from "lucide-react";
import { Field, Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/hooks/use-toast";

interface Settings { paymentSystemEnabled: boolean; customerSubscriptionsEnabled: boolean; designerSubscriptionsEnabled: boolean; currency: string }

export default function AdminSettingsPage() {
  const { push } = useToast();
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [profileRes, subsRes] = await Promise.all([
          fetch("/api/admin/profile"),
          fetch("/api/admin/subscriptions"),
        ]);
        const profileData = await profileRes.json();
        const subsData = await subsRes.json();
        if (!profileRes.ok) throw new Error(profileData.message ?? "Couldn't load your profile.");
        if (!subsRes.ok) throw new Error(subsData.message ?? "Couldn't load platform settings.");
        setName(profileData.displayName ?? "");
        setEmail(profileData.email ?? "");
        setSettings(subsData.settings);
        setStatus("ready");
      } catch {
        setStatus("error");
      }
    })();
  }, []);

  const saveProfile = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Couldn't update your profile.");
      push("Admin profile updated.");
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't update your profile.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <p className="text-white/50 text-xs tracking-wide uppercase mb-2">Admin Settings</p>
      <h1 className="text-2xl font-display mb-8">Settings & security</h1>

      {status === "loading" ? (
        <div className="flex items-center justify-center gap-2 text-white/50 py-24">
          <Loader2 className="animate-spin" size={18} /> Loading settings…
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Admin profile */}
          <section className="border border-white/10 rounded-md p-6">
            <p className="text-sm font-medium mb-4">Admin profile</p>
            <div className="bg-surface-lowest text-ink rounded-md p-5 flex flex-col gap-4">
              <Field label="Name" htmlFor="adminName"><Input id="adminName" value={name} onChange={(e) => setName(e.target.value)} /></Field>
              <Field label="Admin email" htmlFor="adminEmail">
                <Input id="adminEmail" type="email" value={email} disabled className="opacity-60" />
              </Field>
              <Button size="sm" className="w-fit" onClick={saveProfile} disabled={saving || !name.trim()}>
                {saving ? "Saving…" : "Save Profile"}
              </Button>
            </div>
          </section>

          {/* Security placeholder */}
          <section className="border border-white/10 rounded-md p-6">
            <p className="text-sm font-medium mb-4">Password & security</p>
            <div className="flex items-start gap-3 p-3 rounded bg-amber-500/10 border border-amber-500/20 mb-4">
              <ShieldAlert size={16} className="text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-200/80">
                Admins sign in with email and password. Changing the password isn&apos;t available here yet — update it in the
                Supabase dashboard (Authentication → Users). This section is a placeholder for future security controls
                (e.g. session management, 2FA).
              </p>
            </div>
            <fieldset disabled className="bg-surface-lowest text-ink rounded-md p-5 flex flex-col gap-4 opacity-60">
              <Field label="Current password" htmlFor="curPw"><Input id="curPw" type="password" /></Field>
              <Field label="New password" htmlFor="newPw"><Input id="newPw" type="password" /></Field>
              <Button size="sm" className="w-fit" disabled>Update Password</Button>
            </fieldset>
          </section>

          {/* Platform settings summary */}
          {settings && (
            <section className="border border-white/10 rounded-md p-6 flex flex-col gap-4">
              <p className="text-sm font-medium">Platform settings</p>
              <div className="flex flex-col gap-2 text-sm text-white/70">
                <div className="flex justify-between"><span className="text-white/40">Subscriptions enforced</span><span>{settings.paymentSystemEnabled ? "On" : "Off"}</span></div>
                <div className="flex justify-between"><span className="text-white/40">Customer subscriptions</span><span>{settings.customerSubscriptionsEnabled ? "Enabled" : "Disabled"}</span></div>
                <div className="flex justify-between"><span className="text-white/40">Designer subscriptions</span><span>{settings.designerSubscriptionsEnabled ? "Enabled" : "Disabled"}</span></div>
                <div className="flex justify-between"><span className="text-white/40">Platform currency</span><span>{settings.currency}</span></div>
              </div>
              <Link href="/admin/subscriptions" className="text-xs text-emerald-400 hover:underline w-fit">
                Manage in Subscriptions & Payments →
              </Link>
            </section>
          )}

          <section className="border border-white/10 rounded-md p-6 flex flex-col gap-3">
            <p className="text-sm font-medium">About this admin panel</p>
            <p className="text-xs text-white/50 leading-relaxed">
              HRUNA Admin is connected to the live Supabase backend: verification, suspension, disputes,
              notifications, and billing settings here read and write real database rows through authenticated,
              admin-only API routes, and every state-changing action is recorded in the admin audit log.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
