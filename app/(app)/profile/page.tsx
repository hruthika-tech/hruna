"use client";

import { useEffect, useState } from "react";
import { BlockedUsersPanel } from "@/components/profile/BlockedUsersPanel";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2,
  Heart,
  HelpCircle,
  Mail,
  ShieldQuestion,
  FileText,
  Info,
  ChevronRight,
  Users,
  ShieldAlert,
  Copyright,
  Handshake,
  Star,
  Flag,
  UserX,
} from "lucide-react";
import { Avatar } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { Field, Input } from "@/components/ui/Input";
import { Button, LinkButton } from "@/components/ui/Button";
import { UploadingProfilePhotoSection } from "@/components/profile/UploadingProfilePhotoSection";
import { ChangePasswordCard } from "@/components/profile/ChangePasswordCard";
import { DeleteAccountSection } from "@/components/profile/DeleteAccountSection";
import { useToast } from "@/hooks/use-toast";

const TABS = [
  { label: "Personal Details", value: "personal" },
  { label: "Security", value: "security" },
  { label: "Notifications", value: "notifications" },
  { label: "Blocked users", value: "blocked" },
];

// The old "Privacy" tab (a static, always-checked, disabled checkbox — not a real setting) has been
// replaced by these two link lists, below the tab content: "More" reuses existing standalone
// features/pages (Favourites reuses the existing /saved page rather than duplicating it), and
// "Legal & Policies" links out to the 9 canonical policy pages — one canonical page per policy,
// shared with the designer side and the public Footer, never duplicated per-role. Plain links, not
// tabs — there's nothing to load or save here, just navigation.
const MORE_LINKS = [
  { href: "/saved", label: "Favourites", icon: Heart },
  { href: "/help", label: "Help Center", icon: HelpCircle },
  { href: "/support", label: "Contact Support", icon: Mail },
  { href: "/about", label: "About HRUNA", icon: Info },
];

const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy Policy", icon: ShieldQuestion },
  { href: "/terms", label: "Terms of Use", icon: FileText },
  { href: "/community-guidelines", label: "Community Guidelines", icon: Users },
  { href: "/acceptable-use", label: "Acceptable Use", icon: ShieldAlert },
  { href: "/content-policy", label: "Content & Intellectual Property", icon: Copyright },
  { href: "/collaboration-policy", label: "Designer–Customer Collaboration", icon: Handshake },
  { href: "/reviews-policy", label: "Reviews & Ratings", icon: Star },
  { href: "/reporting-and-disputes", label: "Reporting & Disputes", icon: Flag },
  { href: "/account-policy", label: "Account Suspension & Termination", icon: UserX },
];

interface NotificationPreferences {
  proposals: boolean;
  messages: boolean;
  projectUpdates: boolean;
  marketing: boolean;
}

interface CustomerProfile {
  name: string;
  city: string;
  phone: string;
  avatar: string;
  notificationPreferences: NotificationPreferences;
}

export default function ProfilePage() {
  const router = useRouter();
  const { push } = useToast();
  const [tab, setTab] = useState("personal");
  // Settings → Blocked users can be linked to directly (?tab=blocked), e.g. from a blocked conversation.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "blocked") setTab("blocked");
  }, []);

  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [form, setForm] = useState({ name: "", city: "", phone: "" });
  const [saving, setSaving] = useState(false);
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences | null>(null);
  const [savingNotifs, setSavingNotifs] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [sessionRes, profileRes] = await Promise.all([fetch("/api/auth/session"), fetch("/api/profile/customer")]);
        const sessionData = await sessionRes.json();
        const profileData = await profileRes.json();
        if (!profileRes.ok) throw new Error(profileData.message ?? "Couldn't load your profile.");
        if (cancelled) return;

        setEmail(sessionData.email ?? "");
        setProfile(profileData.customerProfile);
        if (profileData.customerProfile) {
          setForm({
            name: profileData.customerProfile.name,
            city: profileData.customerProfile.city,
            phone: profileData.customerProfile.phone,
          });
          setNotifPrefs(profileData.customerProfile.notificationPreferences);
        }
        setStatus("ready");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Couldn't load your profile.");
          setStatus("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const createProfile = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/profile/customer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Couldn't set up your profile.");
      // Unlike GET/PATCH, POST returns the raw customer_profiles row (snake_case, no resolved
      // avatar URL) rather than loadOwnProfile()'s shaped object — reshape it the same way the
      // original code did, now also merging in the (already-defaulted-by-the-DB) preferences.
      const created = data.customerProfile;
      const preferences: NotificationPreferences = {
        proposals: true,
        messages: true,
        projectUpdates: true,
        marketing: false,
        ...(created.notification_preferences ?? {}),
      };
      setProfile({ name: created.name, city: created.city ?? "", phone: created.phone ?? "", avatar: "", notificationPreferences: preferences });
      setNotifPrefs(preferences);
      push("Customer profile created.", "success");
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't set up your profile.", "error");
    } finally {
      setSaving(false);
    }
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/profile/customer", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Couldn't save your changes.");
      setProfile(data.customerProfile);
      push("Profile updated.", "success");
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't save your changes.", "error");
    } finally {
      setSaving(false);
    }
  };

  const savePhoto = async (result: { fileId: string; url: string }) => {
    try {
      const res = await fetch("/api/profile/customer", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarFileId: result.fileId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Couldn't update your photo.");
      setProfile(data.customerProfile);
      push("Profile photo updated.");
      // The top-right nav avatar comes from app/(app)/layout.tsx — a Server Component that fetches
      // the customer's avatar once and stays mounted across client-side navigation within this
      // route group (that's how shared layouts work), so it never sees this PATCH on its own.
      // router.refresh() re-runs Server Components for the current route (layout included) without
      // a full page reload, so the header picks up the new photo immediately.
      router.refresh();
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't update your photo.", "error");
    }
  };

  const removePhoto = async () => {
    try {
      const res = await fetch("/api/profile/customer", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarFileId: null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Couldn't remove your photo.");
      setProfile(data.customerProfile);
      push("Profile photo removed.", "info");
      // Same reasoning as savePhoto() above — sync the header back to the default avatar.
      router.refresh();
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't remove your photo.", "error");
    }
  };

  const saveNotificationPreferences = async () => {
    if (!notifPrefs) return;
    setSavingNotifs(true);
    try {
      const res = await fetch("/api/profile/customer", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationPreferences: notifPrefs }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Couldn't save your notification preferences.");
      setNotifPrefs(data.customerProfile.notificationPreferences);
      push("Notification preferences saved.", "success");
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't save your notification preferences.", "error");
    } finally {
      setSavingNotifs(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    push("You've been logged out.", "info");
    router.push("/login");
  };

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center gap-2 text-ink-variant py-24">
        <Loader2 className="animate-spin" size={18} /> Loading your profile…
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="text-center py-24">
        <p className="text-headline-sm mb-2">Couldn't load your profile</p>
        <p className="text-ink-variant text-sm">{error}</p>
      </div>
    );
  }

  // No customer_profiles row yet (e.g. a fresh signup that hasn't completed /onboarding) — offer
  // the minimal creation step right here rather than blocking the whole page (§19: authentication
  // and profile completion are separate concerns).
  if (!profile) {
    return (
      <div className="container-narrow py-16">
        <p className="text-label-md text-outline mb-2">SET UP YOUR PROFILE</p>
        <h1 className="text-headline-md mb-8">Let's get your customer profile started</h1>
        <div className="flex flex-col gap-5 max-w-sm">
          <Field label="Full name" htmlFor="name" required>
            <Input id="name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label="City" htmlFor="city">
            <Input id="city" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
          </Field>
          <Field label="Phone" htmlFor="phone">
            <Input id="phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </Field>
          <Button onClick={createProfile} disabled={saving || !form.name.trim()}>
            {saving ? "Creating…" : "Create Profile"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container-editorial py-12 pb-section-gap">
      <div className="flex items-center gap-4 mb-10">
        <Avatar src={profile.avatar} alt={profile.name} size={64} />
        <div>
          <h1 className="text-headline-md">{profile.name}</h1>
          <p className="text-ink-variant text-sm">{email}</p>
        </div>
      </div>

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      <div className="mt-8 max-w-lg">
        {tab === "personal" && (
          <div className="flex flex-col gap-5">
            <UploadingProfilePhotoSection photoUrl={profile.avatar} name={profile.name} onSave={savePhoto} onRemove={profile.avatar ? removePhoto : undefined} />
            <Field label="Full name" htmlFor="name"><Input id="name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></Field>
            <Field label="Email" htmlFor="email"><Input id="email" value={email} disabled /></Field>
            <Field label="Phone" htmlFor="phone"><Input id="phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></Field>
            <Field label="City" htmlFor="city"><Input id="city" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} /></Field>
            <div className="flex flex-wrap gap-3 mt-2">
              <Button onClick={saveProfile} disabled={saving}>{saving ? "Saving…" : "Save Changes"}</Button>
              <LinkButton href="/subscription" variant="secondary">Membership</LinkButton>
            </div>
          </div>
        )}

        {tab === "security" && (
          <div className="flex flex-col gap-6">
            <ChangePasswordCard />
            <Button variant="danger" className="w-fit" onClick={handleLogout}>
              Log Out
            </Button>
            <DeleteAccountSection />
          </div>
        )}

        {tab === "blocked" && <BlockedUsersPanel />}
        {tab === "notifications" && notifPrefs && (
          <div className="flex flex-col gap-4">
            {(Object.entries(notifPrefs) as [keyof NotificationPreferences, boolean][]).map(([key, value]) => (
              <label key={key} className="flex items-center justify-between py-3 border-b border-outline-variant">
                <span className="capitalize text-sm">{key.replace(/([A-Z])/g, " $1")}</span>
                <input
                  type="checkbox"
                  checked={value}
                  onChange={(e) => setNotifPrefs((p) => (p ? { ...p, [key]: e.target.checked } : p))}
                />
              </label>
            ))}
            <Button onClick={saveNotificationPreferences} disabled={savingNotifs} className="w-fit mt-2">
              {savingNotifs ? "Saving…" : "Save Preferences"}
            </Button>
          </div>
        )}
      </div>

      <div className="mt-12 max-w-lg">
        <p className="text-label-md text-outline mb-3">MORE</p>
        <div className="rounded-md border border-outline-variant divide-y divide-outline-variant overflow-hidden">
          {MORE_LINKS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-4 py-3.5 text-sm text-ink hover:bg-surface-low transition-colors"
            >
              <Icon size={16} className="text-ink-variant" />
              <span className="flex-1">{label}</span>
              <ChevronRight size={16} className="text-outline" />
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-8 max-w-lg">
        <p className="text-label-md text-outline mb-3">LEGAL &amp; POLICIES</p>
        <div className="rounded-md border border-outline-variant divide-y divide-outline-variant overflow-hidden">
          {LEGAL_LINKS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-4 py-3.5 text-sm text-ink hover:bg-surface-low transition-colors"
            >
              <Icon size={16} className="text-ink-variant" />
              <span className="flex-1">{label}</span>
              <ChevronRight size={16} className="text-outline" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
