"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Inbox, Hourglass, CheckCircle2, Compass, Loader2 } from "lucide-react";
import { StatusBadge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/Progress";
import { LinkButton } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { formatDate } from "@/lib/utils";

interface RequestRow {
  id: string;
  title: string;
  category: string;
  dueDate: string;
  status: string;
  preferredDesignerId?: string;
}

interface ProjectRow {
  id: string;
  title: string;
  stage: string;
  progressPercent: number;
  status: string;
}

export default function DesignerHomePage() {
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [directRequests, setDirectRequests] = useState<RequestRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [reqRes, projRes, profileRes] = await Promise.all([
          fetch("/api/designer/requests"),
          fetch("/api/designer/projects"),
          fetch("/api/designer/profile"),
        ]);
        const reqData = await reqRes.json();
        if (!reqRes.ok) throw new Error(reqData.message ?? "Couldn't load your dashboard.");
        const projData = await projRes.json();
        const profileData = await profileRes.json();

        setDirectRequests((reqData.requests as RequestRow[]).filter((r) => !!r.preferredDesignerId));
        setProjects(projData.projects ?? []);
        setDisplayName(profileRes.ok ? profileData.profile.displayName : "");
        setStatus("ready");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't load your dashboard.");
        setStatus("error");
      }
    })();
  }, []);

  if (status === "loading") {
    return (
      <div className="container-editorial py-12 pb-section-gap">
        <div className="flex items-center justify-center gap-2 text-ink-variant py-24">
          <Loader2 className="animate-spin" size={18} /> Loading your studio…
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="container-editorial py-12 pb-section-gap text-center">
        <p className="text-headline-sm mb-2">Couldn't load your dashboard</p>
        <p className="text-ink-variant text-sm">{error}</p>
      </div>
    );
  }

  const newDirectRequests = directRequests.filter((r) => r.status === "submitted");
  const activeProjects = projects.filter((p) => p.status === "active" || p.status === "awaiting_confirmation");
  const completedProjects = projects.filter((p) => p.status === "completed");

  return (
    <div className="container-editorial py-12 pb-section-gap">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-10">
        <div>
          <p className="text-label-md text-outline mb-2">
            WELCOME BACK{displayName ? `, ${displayName.split(" ")[0].toUpperCase()}` : ""}
          </p>
          <h1 className="text-headline-md">Your studio at a glance</h1>
        </div>
        <div className="flex flex-wrap gap-3">
          <LinkButton href="/designer/discover-requests" size="lg">
            <Compass size={17} /> Discover Requests
          </LinkButton>
          <LinkButton href="/designer/studio/manage" variant="secondary" size="lg">
            Manage Studio
          </LinkButton>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-14">
        <StatCard icon={Inbox} label="Requests Received" value={String(newDirectRequests.length)} href="/designer/requests" />
        <StatCard icon={Hourglass} label="Active Projects" value={String(activeProjects.length)} href="/designer/projects" />
        <StatCard icon={CheckCircle2} label="Completed Projects" value={String(completedProjects.length)} href="/designer/projects" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-headline-sm">Requests received</h2>
            <Link href="/designer/requests" className="text-sm text-primary hover:underline flex items-center gap-1">View all <ArrowRight size={14} /></Link>
          </div>
          <div className="flex flex-col gap-4">
            {directRequests.length > 0 ? directRequests.slice(0, 4).map((r) => (
              <Link key={r.id} href={`/designer/requests/${r.id}`}>
                <Card hover>
                  <CardBody className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-medium text-sm">{r.title}</p>
                      <p className="text-xs text-outline mt-1">{r.category} · Due {formatDate(r.dueDate)}</p>
                    </div>
                    <StatusBadge status={r.status} />
                  </CardBody>
                </Card>
              </Link>
            )) : (
              <p className="text-sm text-outline">No requests sent directly to you yet.</p>
            )}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-headline-sm">Active projects</h2>
            <Link href="/designer/projects" className="text-sm text-primary hover:underline flex items-center gap-1">View all <ArrowRight size={14} /></Link>
          </div>
          <div className="flex flex-col gap-4">
            {activeProjects.length > 0 ? activeProjects.slice(0, 4).map((p) => (
              <Link key={p.id} href={`/designer/projects/${p.id}`}>
                <Card hover>
                  <CardBody className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm">{p.title}</p>
                      <StatusBadge status={p.status} />
                    </div>
                    <ProgressBar percent={p.progressPercent} />
                    <p className="text-xs text-outline">{p.stage}</p>
                  </CardBody>
                </Card>
              </Link>
            )) : (
              <p className="text-sm text-outline">No active projects.</p>
            )}
          </div>
        </section>
      </div>

      <section className="mt-16">
        <div className="rounded-lg bg-primary-container p-10 md:p-12 flex flex-col md:flex-row items-center gap-8 justify-between">
          <div>
            <h2 className="text-headline-sm mb-2">Looking for your next commission?</h2>
            <p className="text-ink-variant text-sm max-w-md">Browse public requests customers have published to the HRUNA community and find your next project.</p>
          </div>
          <LinkButton href="/designer/discover-requests" size="lg">Discover Requests</LinkButton>
        </div>
      </section>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, href }: { icon: any; label: string; value: string; href: string }) {
  return (
    <Link href={href}>
      <Card hover>
        <CardBody className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-full bg-primary-container text-primary flex items-center justify-center shrink-0">
            <Icon size={19} />
          </div>
          <div>
            <p className="text-2xl font-display">{value}</p>
            <p className="text-xs text-outline">{label}</p>
          </div>
        </CardBody>
      </Card>
    </Link>
  );
}
