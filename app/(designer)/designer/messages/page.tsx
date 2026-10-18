"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Send, Search, ImagePlus, Loader2, MessageCircle } from "lucide-react";
import { Avatar, Badge } from "@/components/ui/Badge";
import { useToast } from "@/hooks/use-toast";
import { cn, timeAgo } from "@/lib/utils";
import { messageSide } from "@/lib/messaging/alignment";
import { refreshBadges } from "@/lib/badges/client";
import { BlockedNotice, ConversationMenu } from "@/components/messaging/ConversationMenu";
import type { ChatBlockState } from "@/lib/moderation/reports";
import type { CustomerSummary } from "@/lib/designer/data";

interface ConversationPreview {
  id: string;
  customerId: string;
  lastMessage: string;
  lastTimestamp: string;
  unread: number;
  /** True when the signed-in account is BOTH participants (its own customer profile ↔ its own studio). */
  isSelf?: boolean;
  customer?: CustomerSummary;
}

interface MessageItem {
  id: string;
  senderId: string;
  text: string;
  timestamp: string;
}

// useSearchParams() requires a Suspense boundary around any component that calls it, so the
// page can still be statically analyzed at build time (Next.js App Router requirement) — the
// actual page content moved into DesignerMessagesPageContent, wrapped below.
export default function DesignerMessagesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center gap-2 text-ink-variant py-24">
          <Loader2 className="animate-spin" size={18} /> Loading…
        </div>
      }
    >
      <DesignerMessagesPageContent />
    </Suspense>
  );
}

function DesignerMessagesPageContent() {
  const searchParams = useSearchParams();
  const { push } = useToast();
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState("");
  const [conversations, setConversations] = useState<ConversationPreview[]>([]);
  const [activeId, setActiveId] = useState("");
  const [messages, setMessages] = useState<MessageItem[]>([]);
  // Messaging block state of the open conversation, as decided by the server (app/api/conversations/[id]/messages).
  const [blockState, setBlockState] = useState<ChatBlockState>("none");
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [myUserId, setMyUserId] = useState("");
  const [conversationSearch, setConversationSearch] = useState("");
  // Bumped when the tab regains focus, so the open thread is re-read (the other participant may have
  // written in the meantime) — without the loading spinner, which is only for switching conversations.
  const [refreshTick, setRefreshTick] = useState(0);
  const loadedConversationId = useRef("");

  // Newest conversation first, the same order the API returns.
  const byLatest = (list: ConversationPreview[]) =>
    [...list].sort((a, b) => (b.lastTimestamp ? Date.parse(b.lastTimestamp) : 0) - (a.lastTimestamp ? Date.parse(a.lastTimestamp) : 0));

  // The inbox used to be fetched once on load and never again, so a message sent from another
  // screen/tab (e.g. the other participant) left this card showing an old "latest" preview.
  useEffect(() => {
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("C:/Program Files/Git/api/designer/conversations");
        const data = await res.json();
        if (res.ok) setConversations(data.conversations);
      } catch {
        // Keep what's on screen; the next focus tries again.
      }
      setRefreshTick((t) => t + 1);
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [convRes, sessionRes] = await Promise.all([fetch("/api/designer/conversations"), fetch("/api/auth/session")]);
        const convData = await convRes.json();
        if (!convRes.ok) throw new Error(convData.message ?? "Couldn't load your conversations.");
        const sessionData = await sessionRes.json();

        setConversations(convData.conversations);
        setMyUserId(sessionData.userId ?? "");
        const requested = searchParams.get("conversationId");
        setActiveId(requested ?? convData.conversations[0]?.id ?? "");
        setStatus("ready");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't load your conversations.");
        setStatus("error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const requested = searchParams.get("conversationId");
    if (requested) setActiveId(requested);
  }, [searchParams]);

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    const switching = loadedConversationId.current !== activeId;
    if (switching) setMessagesLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/conversations/${activeId}/messages`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? "Couldn't load messages.");
        if (cancelled) return;
        const loaded: MessageItem[] = data.messages;
        setBlockState(data.blockState === "blocked_by_me" || data.blockState === "unavailable" ? data.blockState : "none");
        setMessages(loaded);
        loadedConversationId.current = activeId;
        // Loading the thread marked it read on the server — clear its unread count here and in the navbar.
        setConversations((prev) => prev.map((c) => (c.id === activeId && c.unread ? { ...c, unread: 0 } : c)));
        refreshBadges();
        // The open thread is the freshest data on screen: its card's preview must match its last message.
        const last = loaded[loaded.length - 1];
        if (last) {
          setConversations((prev) =>
            byLatest(prev.map((c) => (c.id === activeId ? { ...c, lastMessage: last.text, lastTimestamp: last.timestamp } : c)))
          );
        }
      } catch {
        if (!cancelled && switching) setMessages([]);
      } finally {
        if (!cancelled) setMessagesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, refreshTick]);

  const active = conversations.find((c) => c.id === activeId);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || !active || sending) return;
    setSending(true);
    setDraft("");
    try {
      const res = await fetch(`/api/conversations/${active.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "messaging_blocked") setBlockState(data.blockState === "blocked_by_me" ? "blocked_by_me" : "unavailable");
        throw new Error(data.message ?? "Message couldn't be sent.");
      }
      setMessages((prev) => [...prev, data.message]);
      // Keep the inbox in step with the thread: this conversation's card now shows the message just
      // sent and its time, and moves to the top (the list is newest-first) — the same card, never a new one.
      setConversations((prev) => {
        const current = prev.find((c) => c.id === active.id);
        if (!current) return prev;
        const updated = { ...current, lastMessage: data.message.text, lastTimestamp: data.message.timestamp };
        return [updated, ...prev.filter((c) => c.id !== active.id)];
      });
    } catch (err) {
      setDraft(text);
      push(err instanceof Error ? err.message : "Message couldn't be sent. Please try again.", "error");
    } finally {
      setSending(false);
    }
  };

  const visibleConversations = conversations.filter((c) => {
    const query = conversationSearch.trim().toLowerCase();
    if (!query) return true;
    return (c.customer?.name ?? "").toLowerCase().includes(query);
  });

  return (
    <div className="container-editorial py-8 pb-section-gap">
      <p className="text-label-md text-outline mb-2">MESSAGES</p>
      <h1 className="text-headline-md mb-8">Conversations with customers</h1>

      {status === "loading" && (
        <div className="flex items-center justify-center gap-2 text-ink-variant py-24">
          <Loader2 className="animate-spin" size={18} /> Loading conversations…
        </div>
      )}
      {status === "error" && (
        <div className="text-center py-24">
          <p className="text-headline-sm mb-2">Couldn't load your conversations</p>
          <p className="text-ink-variant text-sm">{error}</p>
        </div>
      )}

      {status === "ready" && (
        <div className="grid md:grid-cols-3 border border-outline-variant rounded-md overflow-hidden h-[640px]">
          <div className="border-r border-outline-variant flex flex-col">
            <div className="p-4 border-b border-outline-variant">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" size={16} />
                <input
                  value={conversationSearch}
                  onChange={(e) => setConversationSearch(e.target.value)}
                  placeholder="Search conversations"
                  className="w-full pl-9 pr-3 py-2 rounded-full bg-surface-low text-sm border border-outline-variant"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {conversations.length === 0 ? (
                <div className="p-6 text-center">
                  <MessageCircle className="mx-auto text-outline mb-3" size={28} />
                  <p className="text-sm text-outline">No conversations yet.</p>
                </div>
              ) : visibleConversations.length === 0 ? (
                <div className="p-6 text-center">
                  <p className="text-sm text-outline">No conversations match &ldquo;{conversationSearch}&rdquo;.</p>
                </div>
              ) : (
                visibleConversations.map((c) => {
                  const customer = c.customer;
                  if (!customer) return null;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setActiveId(c.id)}
                      className={cn(
                        "w-full flex items-center gap-3 p-4 text-left border-b border-outline-variant hover:bg-surface-low transition-colors",
                        activeId === c.id && "bg-primary-container/40"
                      )}
                    >
                      <Avatar src={customer.avatar} alt={customer.name} size={40} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium truncate">{customer.name}</p>
                          <span className="text-[11px] text-outline shrink-0">{c.lastTimestamp ? timeAgo(c.lastTimestamp) : ""}</span>
                        </div>
                        <p className="text-xs text-outline truncate">{c.lastMessage}</p>
                      </div>
                      {c.unread > 0 && <Badge tone="primary">{c.unread}</Badge>}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="md:col-span-2 flex flex-col">
            {active ? (
              <>
                <div className="flex items-center gap-3 p-4 border-b border-outline-variant">
                  {active.customer && <Avatar src={active.customer.avatar} alt={active.customer.name} size={38} />}
                  <p className="font-medium text-sm">{active.customer?.name}</p>
                  {!active.isSelf && (
                    <ConversationMenu
                      conversationId={active.id}
                      otherName={active.customer?.name ?? "this customer"}
                      messages={messages}
                      myUserId={myUserId || null}
                      blockState={blockState}
                      settingsHref="/designer/profile?tab=blocked"
                      onBlocked={() => setBlockState("blocked_by_me")}
                    />
                  )}
                </div>
                {active.isSelf && (
                  <p className="px-4 py-2 text-xs text-outline border-b border-outline-variant">
                    This conversation is between your own customer profile and your own studio, so every message in it was sent by you and appears on your side.
                  </p>
                )}
                <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
                  {messagesLoading ? (
                    <div className="flex items-center justify-center h-full text-ink-variant text-sm gap-2">
                      <Loader2 className="animate-spin" size={16} /> Loading messages…
                    </div>
                  ) : (
                    <>
                      {messages.map((m) => {
                        const isMe = messageSide(m.senderId, myUserId) === "right";
                        return (
                          <div key={m.id} className={cn("flex", isMe ? "justify-end" : "justify-start")}>
                            <div
                              className={cn(
                                "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm",
                                isMe ? "bg-primary text-white rounded-br-sm" : "bg-surface-low text-ink rounded-bl-sm"
                              )}
                            >
                              {m.text}
                            </div>
                          </div>
                        );
                      })}
                      {messages.length === 0 && (
                        <p className="text-sm text-outline text-center mt-8">Say hello to start the conversation.</p>
                      )}
                    </>
                  )}
                </div>
                {blockState !== "none" ? (
                  <BlockedNotice state={blockState} settingsHref="/designer/profile?tab=blocked" />
                ) : (
                <div className="p-4 border-t border-outline-variant flex items-center gap-2">
                  <button
                    className="p-2 text-outline/50 cursor-not-allowed"
                    aria-label="Attach image (coming soon)"
                    title="Attaching images is coming soon"
                    disabled
                  >
                    <ImagePlus size={19} />
                  </button>
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                    placeholder="Type a message..."
                    className="flex-1 px-4 py-2.5 rounded-full bg-surface-low border border-outline-variant text-sm"
                  />
                  <button
                    onClick={handleSend}
                    disabled={sending || !draft.trim()}
                    aria-label="Send message"
                    className="p-2.5 rounded-full bg-primary text-white hover:scale-105 transition-transform disabled:opacity-60"
                  >
                    <Send size={16} />
                  </button>
                </div>
                )}
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-outline text-sm">Select a conversation</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
