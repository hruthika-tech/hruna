"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Loader2, Layers } from "lucide-react";
import { Tabs } from "@/components/ui/Tabs";
import { StatusBadge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/Progress";
import { Card, CardBody } from "@/components/ui/Card";
import { formatDate } from "@/lib/utils";

interface ProjectSummary {
  id: string;
  title: string;
  referenceImages: string[];
  stage: string;
  progressPercent: number;
  dueDate: string;
  status: string;
}

const TABS = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Awaiting Confirmation", value: "awaiting_confirmation" },
  { label: "Completed", value: "completed" },
];

export default function DesignerProjectsPage() {
  const [active, setActive] = useState("all");
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState("");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/designer/projects");
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? "Couldn't load your projects.");
        setProjects(data.projects);
        setStatus("ready");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't load your projects.");
        setStatus("error");
      }
    })();
  }, []);

  const filtered = projects.filter((p) => active === "all" || p.status === active);

  return (
    <div className="container-editorial py-12 pb-section-gap">
      <p className="text-label-md text-outline mb-2">MY PROJECTS</p>
      <h1 className="text-headline-md mb-8">Projects in progress</h1>

      {status === "loading" && (
        <div className="flex items-center justify-center gap-2 text-ink-variant py-24">
          <Loader2 className="animate-spin" size={18} /> Loading your projects…
        </div>
      )}
      {status === "error" && (
        <div className="text-center py-24">
          <p className="text-headline-sm mb-2">Couldn't load your projects</p>
          <p className="text-ink-variant text-sm">{error}</p>
        </div>
      )}

      {status === "ready" && (
        <>
          <Tabs
            tabs={TABS.map((t) => ({ ...t, count: t.value === "all" ? projects.length : projects.filter((p) => p.status === t.value).length }))}
            active={active}
            onChange={setActive}
          />

          {filtered.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
              {filtered.map((p) => (
                <Link key={p.id} href={`/designer/projects/${p.id}`}>
                  <Card hover>
                    <CardBody className="flex flex-col gap-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {p.referenceImages[0] && (
                            <div className="relative w-14 h-14 rounded-sm overflow-hidden shrink-0">
                              <Image src={p.referenceImages[0]} alt="" fill sizes="56px" className="object-cover" />
                            </div>
                          )}
                          <p className="font-display text-lg leading-tight break-words min-w-0">{p.title}</p>
                        </div>
                        <span className="shrink-0"><StatusBadge status={p.status} /></span>
                      </div>
                      <div>
                        <div className="flex justify-between text-xs text-outline mb-1.5"><span>{p.stage}</span><span>{p.progressPercent}%</span></div>
                        <ProgressBar percent={p.progressPercent} />
                      </div>
                      <div className="flex justify-between text-sm text-ink-variant pt-3 border-t border-outline-variant">
                        <span>Due {formatDate(p.dueDate)}</span>
                      </div>
                    </CardBody>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-24">
              <Layers className="mx-auto text-outline mb-4" size={32} />
              <p className="text-headline-sm mb-2">No projects in this view</p>
              <p className="text-ink-variant text-sm">Accepted proposals will turn into projects here.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
