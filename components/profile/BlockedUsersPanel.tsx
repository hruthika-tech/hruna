"use client";

import { useEffect, useState } from "react";
import { Ban, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";

// Settings → Blocked users (customer /profile and designer /designer/profile). Lists only the
// signed-in user's OWN blocks (GET /api/blocks) and unblocks them (DELETE /api/blocks/[userId]).
// Unblocking lets an existing conversation be used again; starting new ones still follows the normal rules.
interface BlockedUser {
  userId: string;
  name: string;
  blockedAt: string;
}

export function BlockedUsersPanel() {
  const { push } = useToast();
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [available, setAvailable] = useState(true);
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/blocks");
        const data = await res.json();
        if (!res.ok) throw new Error();
        setAvailable(data.available !== false);
        setBlocked(data.blocked ?? []);
        setState("ready");
      } catch {
        setState("error");
      }
    })();
  }, []);

  const unblock = async (user: BlockedUser) => {
    setBusyId(user.userId);
    try {
      const res = await fetch(`/api/blocks/${user.userId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? "Couldn't unblock this account.");
      setBlocked((prev) => prev.filter((b) => b.userId !== user.userId));
      push(`You unblocked ${user.name}.`, "success");
    } catch (err) {
      push(err instanceof Error ? err.message : "Couldn't unblock this account.", "error");
    } finally {
      setBusyId(null);
    }
  };

  if (state === "loading") {
    return (
      <div className="flex items-center gap-2 text-sm text-ink-variant py-6">
        <Loader2 className="animate-spin" size={16} /> Loading…
      </div>
    );
  }
  if (state === "error") return <p className="text-sm text-error py-6">Couldn&apos;t load your blocked users. Please try again.</p>;

  return (
    <div className="flex flex-col gap-4 max-w-xl" data-testid="blocked-users">
      <p className="text-sm text-ink-variant">
        People you&apos;ve blocked can&apos;t message you and you can&apos;t message them, and neither of you can start a new conversation. They
        aren&apos;t told that you blocked them.
      </p>
      {!available ? (
        <p className="text-sm text-outline">Blocking isn&apos;t available yet.</p>
      ) : blocked.length === 0 ? (
        <div className="flex items-center gap-3 text-sm text-outline py-4">
          <Ban size={16} /> You haven&apos;t blocked anyone.
        </div>
      ) : (
        <ul className="divide-y divide-outline-variant border border-outline-variant rounded-md">
          {blocked.map((b) => (
            <li key={b.userId} className="flex items-center gap-4 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{b.name}</p>
                <p className="text-xs text-outline">Blocked {formatDate(b.blockedAt)}</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => unblock(b)} disabled={busyId === b.userId}>
                {busyId === b.userId ? "Unblocking…" : "Unblock"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
