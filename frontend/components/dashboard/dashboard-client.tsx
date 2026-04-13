"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { DraftApprovalModal } from "@/components/dashboard/draft-approval-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { apiFetch, connectGmail, createPaymentOrder, getAgents, getThreads, syncGmail, ignoreThread } from "@/lib/api";
import { getAgentMeta, isGmailAgent } from "@/lib/agents";
import { supabase } from "@/lib/supabase";
import { LeadThread, ThreadDrafts } from "@/lib/types";
import { cn } from "@/lib/utils";

type CloseReason = LeadThread["close_reason"];
type ExtendedFilterOption = "needs_follow_up" | "active";
type SortOption = "longest_waiting" | "recent_activity" | "newest_thread";
const THREADS_PER_PAGE = 12;

function daysSince(timestamp: string | null) {
  if (!timestamp) return 0;
  const last = new Date(timestamp).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - last) / (1000 * 60 * 60 * 24)));
}

function hoursSince(timestamp: string | null) {
  if (!timestamp) return Number.POSITIVE_INFINITY;
  const last = new Date(timestamp).getTime();
  const now = Date.now();
  return Math.max(0, (now - last) / (1000 * 60 * 60));
}

function latestActivityAt(thread: LeadThread) {
  const candidates: (string | null | undefined)[] = [
    thread.last_inbound_at,
    thread.last_outbound_at,
  ];

  // Include timestamps from all recent messages, not just last_message
  if (thread.recent_messages?.length) {
    for (const msg of thread.recent_messages) {
      if (msg.timestamp) candidates.push(msg.timestamp);
    }
  } else if (thread.last_message?.timestamp) {
    candidates.push(thread.last_message.timestamp);
  }

  const timestamps = candidates
    .filter(Boolean)
    .map((value) => new Date(value as string).getTime())
    .filter((value) => !Number.isNaN(value));

  if (timestamps.length > 0) return Math.max(...timestamps);

  // Fallback to created_at only if no activity timestamps exist
  if (thread.created_at) {
    const created = new Date(thread.created_at).getTime();
    if (!Number.isNaN(created)) return created;
  }

  return 0;
}

function formatDateTime(timestamp: string | null) {
  if (!timestamp) return "Not available";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRelativeTime(timestamp: string | null) {
  if (!timestamp) return "No recent activity";
  const deltaHours = hoursSince(timestamp);
  if (deltaHours < 1) {
    return "Just now";
  }
  if (deltaHours < 24) {
    return `${Math.floor(deltaHours)} hours ago`;
  }
  if (deltaHours < 48) {
    return "Yesterday";
  }
  return `${Math.floor(deltaHours / 24)} days ago`;
}

function cleanEmailContent(content: string | null | undefined) {
  if (!content) return "";

  const normalized = content.replace(/\r\n/g, "\n");
  const quotedReplyStart = normalized.search(/^\s*On .+wrote:\s*$/im);
  const forwardStart = normalized.search(/^\s*From:\s.+$/im);
  const blockQuoteStart = normalized.search(/^\s*>\s?.*$/m);

  const cutPoints = [quotedReplyStart, forwardStart, blockQuoteStart].filter((index) => index >= 0);
  if (cutPoints.length > 0) {
    return normalized.slice(0, Math.min(...cutPoints)).trim();
  }

  return normalized.trim();
}

function channelLabel(channel: LeadThread["channel"]) {
  return "Gmail";
}

function channelBadgeClass(channel: LeadThread["channel"]) {
  return "border-gray-200 bg-gray-100 text-gray-700";
}

function GmailIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 6h16v12H4z" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

function channelContact(thread: LeadThread) {
  return thread.contact_email || "Email contact";
}

function formatAttachmentNamesInline(names: string[] | undefined) {
  const valid = (names || []).filter(Boolean);
  if (valid.length === 0) return null;
  if (valid.length === 1) return valid[0];
  if (valid.length === 2) return `${valid[0]}, ${valid[1]}`;
  return `${valid[0]}, ${valid[1]} +${valid.length - 2} more`;
}

function statusDotClass(thread: LeadThread) {
  if (thread.status === "closed") return "border border-gray-300 bg-white";
  if (thread.status === "pending_approval" || thread.status === "needs_review" || thread.has_pending_draft) {
    return "bg-yellow-400";
  }
  return "bg-green-500";
}

function isWaitingOnYou(thread: LeadThread) {
  if (thread.has_pending_draft || thread.status === "pending_approval" || thread.status === "needs_review") {
    return true;
  }

  if (thread.status !== "active") {
    return false;
  }

  const lastInboundAt = thread.last_inbound_at ? new Date(thread.last_inbound_at).getTime() : null;
  const lastOutboundAt = thread.last_outbound_at ? new Date(thread.last_outbound_at).getTime() : null;

  if (lastInboundAt && (lastOutboundAt === null || lastInboundAt >= lastOutboundAt)) {
    return true;
  }

  return false;
}

function isWaitingOnLead(thread: LeadThread) {
  return thread.status === "active" && !isWaitingOnYou(thread);
}

function previewText(thread: LeadThread) {
  const content = cleanEmailContent(thread.last_message_preview || thread.last_message?.content || "").slice(0, 80);
  if (content.trim()) return content;

  // If body is empty but message has attachments, show the attachment list
  if (thread.last_message?.has_attachments && (thread.last_message?.attachment_names || []).length > 0) {
    const names = thread.last_message.attachment_names || [];
    if (names.length === 1) return `📎 Attachment: ${names[0]}`;
    return `📎 Attachments: ${names[0]}, ${names[1]}${names.length > 2 ? ` (+${names.length - 2} more)` : ""}`;
  }

  return "Open thread to view recent messages.";
}

function closeReasonLabel(closeReason: CloseReason) {
  switch (closeReason) {
    case "opt_out":
      return "Asked to stop";
    case "chose_competitor":
      return "Went elsewhere";
    case "not_interested":
      return "Not interested";
    case "follow_up_limit":
      return "Follow-up limit reached";
    case "manual":
      return "Closed";
    default:
      return "Closed";
  }
}

function closeReasonDescription(closeReason: CloseReason) {
  switch (closeReason) {
    case "opt_out":
      return "Lead asked to stop contact";
    case "chose_competitor":
      return "Lead went with another option";
    case "not_interested":
      return "Lead is not interested";
    case "follow_up_limit":
      return "Maximum follow-ups sent";
    case "manual":
      return "Manually closed";
    default:
      return "Closed";
  }
}

function buildSyncToastMessage(data: { leads_found: number; updated_threads: number; replied_threads: number }) {
  const parts: string[] = [];
  if (data.leads_found > 0) {
    parts.push(`${data.leads_found} new ${data.leads_found === 1 ? "lead" : "leads"}`);
  }
  if (data.replied_threads > 0) {
    parts.push(`${data.replied_threads} ${data.replied_threads === 1 ? "reply" : "replies"}`);
  } else if (data.updated_threads > 0) {
    parts.push(`${data.updated_threads} updated ${data.updated_threads === 1 ? "thread" : "threads"}`);
  }

  if (parts.length === 0) {
    return "Sync complete. No new leads or replies.";
  }

  return `Sync complete. ${parts.join(" and ")}.`;
}

function emptyStateCtaLabel(agentId: string, gmailStatus: "connected" | "disconnected" | null) {
  if (!isGmailAgent(agentId)) {
    return getAgentMeta(agentId).emptyStateCta;
  }
  if (gmailStatus === "connected") {
    return "Sync Gmail";
  }
  return "Connect Gmail";
}

export function DashboardClient({ agentId = "gmail_followup" }: { agentId?: string }) {
  const meta = getAgentMeta(agentId);
  const { pushToast } = useToast();
  const searchParams = useSearchParams();
  const initializedAgentRef = useRef<string | null>(null);
  const headerTitle = isGmailAgent(agentId) ? "Workspace" : meta.dashboardTitle;

  const [userId, setUserId] = useState("");
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string>("inactive");
  const [threads, setThreads] = useState<LeadThread[]>([]);
  const [draftsByThreadId, setDraftsByThreadId] = useState<Record<string, ThreadDrafts>>({});
  const [selectedThread, setSelectedThread] = useState<LeadThread | null>(null);
  const [messagePreviewThread, setMessagePreviewThread] = useState<LeadThread | null>(null);
  const [isLoadingPreviewMessages, setIsLoadingPreviewMessages] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [generatingThreadIds, setGeneratingThreadIds] = useState<string[]>([]);
  const [removingThreadIds, setRemovingThreadIds] = useState<string[]>([]);
  const [filterBy, setFilterBy] = useState<ExtendedFilterOption>("needs_follow_up");
  const [sortBy, setSortBy] = useState<SortOption>("longest_waiting");
  const [currentPage, setCurrentPage] = useState(1);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isActivatingAgent, setIsActivatingAgent] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [gmailStatus, setGmailStatus] = useState<"connected" | "disconnected" | null>(null);
  const [gmailEmail, setGmailEmail] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSyncAttemptedRef = useRef<string | null>(null);

  const fetchSubStatus = async () => {
    try {
      const agents = await getAgents();
      const currentAgent = agents.find((item) => item.agent.id === agentId);
      const status = currentAgent?.subscription?.status || "inactive";
      setSubscriptionStatus(status);
      return status;
    } catch {
      return "inactive";
    }
  };

  const pollUntilActive = async () => {
    const maxAttempts = 10;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await new Promise((resolve) => {
        pollTimerRef.current = setTimeout(resolve, 3000);
      });

      const status = await fetchSubStatus();
      if (status === "active") {
        pushToast("Subscription activated! 🎉");
        await fetchThreads();
        void refreshGmailStatus();
        return;
      }

      if (status === "payment_pending") {
        return;
      }

      if (status === "payment_failed") {
        pushToast("Payment failed. Please try again.", "error");
        return;
      }
    }
    pushToast("Payment processing… refresh in a moment.");
  };

  async function refreshGmailStatus() {
    if (!isGmailAgent(agentId)) {
      setLastSyncedAt(null);
      setGmailStatus(null);
      setGmailEmail(null);
      return { connected: false, status: null as "connected" | "disconnected" | null, email: null as string | null, last_synced_at: null as string | null };
    }

    try {
      const gmailStatus = await apiFetch<{ connected: boolean; status?: "connected" | "disconnected" | null; email?: string; last_synced_at?: string | null }>(
        `/api/gmail/status?agent_id=${encodeURIComponent(agentId)}`
      );
      setLastSyncedAt(gmailStatus.last_synced_at || null);
      setGmailStatus(gmailStatus.status || (gmailStatus.connected ? "connected" : null));
      setGmailEmail(gmailStatus.email || null);
      return {
        connected: Boolean(gmailStatus.connected),
        status: gmailStatus.status || (gmailStatus.connected ? "connected" : null),
        email: gmailStatus.email || null,
        last_synced_at: gmailStatus.last_synced_at || null,
      };
    } catch {
      setLastSyncedAt(null);
      setGmailStatus(null);
      setGmailEmail(null);
      return { connected: false, status: null as "connected" | "disconnected" | null, email: null as string | null, last_synced_at: null as string | null };
    }
  }

  async function reconnectGmail() {
    try {
      const resp = await connectGmail(agentId);
      if (resp.auth_url) {
        window.location.href = resp.auth_url;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not start Gmail reconnect.";
      pushToast(message, "error");
    }
  }

  async function fetchThreads(showToast = false) {
    setIsRefreshing(true);
    try {
      const data = await getThreads(agentId);
      setThreads(data.threads);
      setLoadError(null);
      if (showToast) {
        pushToast("Leads refreshed.");
      }
      return data.threads;
    } catch (error) {
      setLoadError("Failed to load workspace data");
      if (showToast) {
        pushToast("Could not refresh dashboard.");
      }
      return [] as LeadThread[];
    } finally {
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    if (!messagePreviewThread?.id) return;

    const previewThreadId = messagePreviewThread.id;
    let cancelled = false;

    async function loadRecentMessages() {
      setIsLoadingPreviewMessages(true);
      try {
        const data = await apiFetch<{
          thread_id: string;
          subject?: string | null;
          recent_messages?: LeadThread["recent_messages"];
        }>(`/api/agents/${agentId}/threads/${previewThreadId}/recent-messages`);

        if (cancelled) return;

        setMessagePreviewThread((prev) => {
          if (!prev || prev.id !== previewThreadId) return prev;
          const recentMessages = data.recent_messages || [];
          return {
            ...prev,
            subject: data.subject ?? prev.subject,
            recent_messages: recentMessages,
            last_message: recentMessages.length > 0 ? recentMessages[recentMessages.length - 1] : prev.last_message,
          };
        });
      } catch {
        if (!cancelled) {
          pushToast("Could not load live Gmail messages.");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingPreviewMessages(false);
        }
      }
    }

    void loadRecentMessages();
    return () => {
      cancelled = true;
    };
  }, [agentId, messagePreviewThread?.id, pushToast]);

  useEffect(() => {
    if (initializedAgentRef.current === agentId) return;
    initializedAgentRef.current = agentId;

    async function init() {
      setIsBootstrapping(true);
      try {
        const [me, agents] = await Promise.all([
          apiFetch<{ id: string; email?: string; subscription_status?: string }>("/api/auth/me"),
          getAgents(),
        ]);
        setUserId(me.id);
        const currentAgent = agents.find((item) => item.agent.id === agentId);
        const status = currentAgent?.subscription?.status || "inactive";
        setSubscriptionStatus(status);

        if (status === "active") {
          const [loadedThreads, gmailInfo] = await Promise.all([
            fetchThreads(),
            refreshGmailStatus(),
          ]);

          const needsInitialSync =
            isGmailAgent(agentId) &&
            gmailInfo.connected &&
            (!gmailInfo.last_synced_at || loadedThreads.length === 0);

          if (needsInitialSync && autoSyncAttemptedRef.current !== agentId) {
            autoSyncAttemptedRef.current = agentId;
            setIsSyncing(true);
            try {
              const syncResult = await syncGmail(agentId);
              setLastSyncedAt(syncResult.last_synced_at || null);
              await fetchThreads();
            } catch (error) {
              const message = error instanceof Error ? error.message.toLowerCase() : "";
              if (message.includes("reconnect") || message.includes("disconnected")) {
                setGmailStatus("disconnected");
              }
            } finally {
              setIsSyncing(false);
            }
          }
        }
      } catch (error) {
        setLoadError("Failed to load workspace data");
        pushToast("Could not refresh dashboard.");
      } finally {
        setIsBootstrapping(false);
      }
    }
    void init();
  }, [agentId, pushToast]);

  useEffect(() => {
    if (subscriptionStatus !== "active" || !userId) return;

    const channel = supabase
      .channel(`lead_threads_realtime:${agentId}:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "lead_threads",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void fetchThreads();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [agentId, subscriptionStatus, userId]);

  useEffect(() => {
    if (searchParams.get("subscribed") === "true") {
      pushToast("Subscription active. Happy hunting!");
      setSubscriptionStatus("active");
      void refreshGmailStatus();
      void fetchThreads();
    }
  }, [pushToast, searchParams]);

  useEffect(() => {
    if (subscriptionStatus !== "active" || !isGmailAgent(agentId)) return;

    const handleFocus = () => {
      void refreshGmailStatus();
    };

    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, [agentId, subscriptionStatus]);

  // Cleanup poll timer on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  const stats = useMemo(() => {
    return {
      total: threads.length,
      needsFollowUp: threads.filter((thread) => isWaitingOnYou(thread)).length,
      active: threads.filter((thread) => isWaitingOnLead(thread)).length,
    };
  }, [threads]);

  const visibleThreads = useMemo(() => {
    const filtered = threads.filter((thread) => {
      if (thread.status === "ignored") return false;
      if (filterBy === "needs_follow_up") {
        return isWaitingOnYou(thread);
      }
      if (filterBy === "active") {
        return isWaitingOnLead(thread);
      }
      return false;
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === "recent_activity") {
        return latestActivityAt(b) - latestActivityAt(a);
      }
      if (sortBy === "newest_thread") {
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      }
      return daysSince(b.last_inbound_at) - daysSince(a.last_inbound_at);
    });
  }, [filterBy, sortBy, threads]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterBy, sortBy]);

  const totalPages = Math.max(1, Math.ceil(visibleThreads.length / THREADS_PER_PAGE));
  const paginatedThreads = useMemo(() => {
    const safePage = Math.min(currentPage, totalPages);
    const start = (safePage - 1) * THREADS_PER_PAGE;
    return visibleThreads.slice(start, start + THREADS_PER_PAGE);
  }, [currentPage, totalPages, visibleThreads]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  if (isBootstrapping) {
    return (
      <div className="min-h-screen bg-gray-50">
        <main className="mx-auto max-w-7xl px-8 py-8">
          <div className="rounded-3xl border border-gray-200 bg-white p-10 shadow-sm">
            <div className="flex items-center gap-3 text-brand-heading">
              <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <p className="text-sm font-semibold">Loading your workspace...</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  async function generateFollowUp(thread: LeadThread) {
    setGeneratingThreadIds((prev) => (prev.includes(thread.id) ? prev : [...prev, thread.id]));
    try {
      const result = await apiFetch<{ status: string; reason?: string; drafts?: ThreadDrafts }>(
        `/api/agents/${agentId}/threads/${thread.id}/generate-follow-up`,
        { method: "POST" }
      );
      if (result.status === "needs_review") {
        const isDisconnected = 
          result.reason?.toLowerCase().includes("reconnect") || 
          result.reason?.toLowerCase().includes("disconnected") ||
          result.reason?.toLowerCase().includes("401") ||
          result.reason?.toLowerCase().includes("invalid_grant");

        setThreads((prev) =>
          prev.map((item) =>
            item.id === thread.id
              ? { ...item, status: "needs_review", disconnection_error: isDisconnected || item.disconnection_error }
              : item
          )
        );

        if (isDisconnected) {
          setGmailStatus("disconnected");
          pushToast("Gmail disconnected. Please reconnect your account.");
          return;
        }

        const shortReason = result.reason?.includes("rate")
          ? "AI models are rate-limited. Please try again in a moment."
          : result.reason?.includes("All")
            ? "AI service temporarily unavailable. Please retry."
            : "Could not generate drafts. Tap Retry to try again.";
        pushToast(shortReason);
        return;
      }
      if (result.drafts) {
        setDraftsByThreadId((prev) => ({ ...prev, [thread.id]: result.drafts as ThreadDrafts }));
      }
      setThreads((prev) =>
        prev.map((item) =>
          item.id === thread.id ? { ...item, status: "pending_approval", has_pending_draft: true } : item
        )
      );
      pushToast(`Drafts ready for ${thread.contact_name || thread.contact_email || "this lead"}.`);
    } catch (error) {
      if (
        (error instanceof Error && (error.message.toLowerCase().includes("reconnect") || error.message.toLowerCase().includes("disconnected"))) ||
        (typeof error === "object" && error !== null && "status" in error && error.status === 401)
      ) {
        setGmailStatus("disconnected");
        setThreads((prev) =>
          prev.map((item) =>
            item.id === thread.id ? { ...item, status: "needs_review", disconnection_error: true } : item
          )
        );
        pushToast("Gmail disconnected. Please reconnect your account.");
      } else {
        pushToast("Follow-up generation failed. Please try again.");
      }
    } finally {
      setGeneratingThreadIds((prev) => prev.filter((id) => id !== thread.id));
    }
  }

  async function syncLeads() {
    setIsSyncing(true);
    try {
      const data = await syncGmail(agentId);
      setLastSyncedAt(data.last_synced_at || null);
      pushToast(buildSyncToastMessage(data));
      await fetchThreads();
    } catch (error) {
      if (
        (error instanceof Error && (error.message.toLowerCase().includes("reconnect") || error.message.toLowerCase().includes("disconnected"))) ||
        (typeof error === "object" && error !== null && "status" in error && error.status === 401)
      ) {
        setGmailStatus("disconnected");
        pushToast("Gmail disconnected. Please reconnect your account.");
      } else {
        pushToast("Leads sync failed.");
      }
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleActivateAgent() {
    setIsActivatingAgent(true);
    try {
      const resp = await createPaymentOrder(agentId);
      if (!resp.payment_session_id) {
        pushToast("Payment session not available.", "error");
        return;
      }
      const cashfreeMode = process.env.NEXT_PUBLIC_CASHFREE_ENV === "production" ? "production" : "sandbox" as const;
      if (!window.Cashfree) {
        pushToast("Payment SDK not loaded. Please refresh.", "error");
        return;
      }
      const cashfree = window.Cashfree({ mode: cashfreeMode });
      await cashfree.checkout({
        paymentSessionId: resp.payment_session_id,
        redirectTarget: "_modal",
      });
      // Stay in loading state while polling
      await pollUntilActive();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not start checkout.";
      pushToast(message, "error");
    } finally {
      setIsActivatingAgent(false);
    }
  }

  async function reopenThread(threadId: string) {
    try {
      await apiFetch<{ thread: Partial<LeadThread> | null }>(`/api/agents/${agentId}/threads/${threadId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "active" }),
      });
      pushToast("Thread reopened.");
      await fetchThreads();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not reopen thread.";
      pushToast(message, "error");
    }
  }

  async function handleIgnoreThread(threadId: string) {
    const threadToRestore = threads.find((thread) => thread.id === threadId) || null;
    setRemovingThreadIds((prev) => (prev.includes(threadId) ? prev : [...prev, threadId]));
    setThreads((prev) => prev.filter((thread) => thread.id !== threadId));

    try {
      await ignoreThread(threadId);
      pushToast("Thread removed from dashboard.");
    } catch (error) {
      if (threadToRestore) {
        setThreads((prev) => [threadToRestore, ...prev]);
      }
      pushToast("Failed to remove thread.");
    } finally {
      setRemovingThreadIds((prev) => prev.filter((id) => id !== threadId));
    }
  }

  if (subscriptionStatus !== "active") {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
        <Card className="w-full max-w-xl p-10 text-center shadow-2xl border-gray-100">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-brand-primary/10 text-brand-primary">
            <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h2 className="text-3xl font-bold tracking-tight mb-4">Agent Not Active Yet</h2>
          <p className="text-brand-body/60 text-lg mb-10 leading-relaxed">
            This agent is not active for your account yet. Start a plan to begin monitoring leads in this channel.
          </p>
          <Button
            size="lg"
            className="w-full py-8 text-xl font-bold"
            disabled={isActivatingAgent}
            onClick={() => void handleActivateAgent()}
          >
            {isActivatingAgent ? "Opening checkout..." : "Activate Agent"}
          </Button>
        </Card>
      </div>
    );
  }

  return (
      <div className="min-h-screen bg-gray-50">
      <main className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-col gap-4 sm:mb-8 lg:mb-10 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full bg-brand-primary/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-primary">
              <span>{meta.icon}</span>
              <span>{isGmailAgent(agentId) ? "Follow-up Agent" : meta.shortName}</span>
            </div>
            <h1 className="mt-3 text-[clamp(1.8rem,3vw,2.35rem)] font-black tracking-tight text-brand-heading">
              {headerTitle}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-brand-body/60">
              {meta.dashboardSubtitle}
            </p>
          </div>

          {isGmailAgent(agentId) && (
            <div className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm lg:min-w-[280px] lg:w-auto">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-body/40">Inbox Sync</p>
                  <p className="mt-1.5 text-sm font-semibold text-brand-heading">
                    {lastSyncedAt ? formatDateTime(lastSyncedAt) : "Not synced yet"}
                  </p>
                </div>
                <div className="rounded-full bg-gray-50 p-2 text-brand-primary">
                  <svg className={cn("h-4 w-4", isSyncing && "animate-spin")} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </div>
              </div>
              <Button
                variant="outline"
                className="mt-3 w-full rounded-xl border-gray-200 bg-gray-50 px-4 font-bold text-brand-heading hover:bg-white"
                onClick={syncLeads}
                disabled={isSyncing}
              >
                {/* <svg className={cn("mr-2 h-4 w-4", isSyncing && "animate-spin")} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg> */}
                {isSyncing ? "Syncing..." : "Sync Gmail"}
              </Button>
              {isSyncing ? (
                <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-900">
                  Gmail sync is running. Keep this page open and do not refresh until it finishes.
                </p>
              ) : null}
            </div>
          )}
        </header>

        {isGmailAgent(agentId) && gmailStatus && gmailStatus !== "connected" && (
          <div className="mb-6 rounded-3xl border border-amber-200 bg-amber-50 px-4 py-4 shadow-sm sm:mb-8 sm:px-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.18em] text-amber-700">Gmail attention needed</p>
                <p className="mt-2 text-base font-semibold text-amber-950">
                  {gmailStatus === "disconnected"
                    ? "⚠️ Your Gmail connection was disconnected. Reconnect to resume tracking your leads."
                    : "⚠️ Gmail not connected. Connect your account to start tracking leads."}
                </p>
                {gmailEmail && (
                  <p className="mt-1 text-sm text-amber-800">Account: {gmailEmail}</p>
                )}
              </div>
              <Button className="rounded-xl bg-amber-600 px-5 font-bold text-white hover:bg-amber-700" onClick={reconnectGmail}>
                {gmailStatus === "disconnected" ? "Reconnect Gmail" : "Connect Gmail"}
              </Button>
            </div>
          </div>
        )}

        {loadError && (
          <div className="mb-8 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-600">
            Sync error: {loadError}
          </div>
        )}

        <div className="mb-6 rounded-3xl border border-gray-200 bg-white px-4 py-4 shadow-sm sm:mb-8 sm:px-5">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap gap-5 border-b border-gray-100">
                {[
                  { key: "needs_follow_up" as const, label: "Waiting on you", count: stats.needsFollowUp },
                  { key: "active" as const, label: "Waiting on lead", count: stats.active },
                ].map((filter) => (
                  <button
                    key={filter.key}
                    type="button"
                    onClick={() => setFilterBy(filter.key)}
                    className={cn(
                      "inline-flex items-center gap-2 border-b-2 px-1 pb-2.5 text-sm font-bold transition-colors",
                      filterBy === filter.key
                        ? "border-brand-primary text-brand-primary"
                        : "border-transparent text-gray-500 hover:text-brand-heading"
                    )}
                  >
                    <span>{filter.label}</span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px]",
                        filterBy === filter.key ? "bg-brand-primary/10 text-brand-primary" : "bg-gray-100 text-gray-500"
                      )}
                    >
                      {filter.count}
                    </span>
                  </button>
                ))}
              </div>

              <div className="flex w-full items-center gap-2 self-start xl:w-auto xl:self-auto">
                <Select
                  aria-label="Sort leads"
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value as SortOption)}
                  className="h-9 w-full rounded-full border-gray-200 bg-gray-50 text-sm sm:min-w-[180px] xl:w-auto"
                >
                    <option value="longest_waiting">Longest waiting</option>
                    <option value="recent_activity">Recent activity</option>
                    <option value="newest_thread">Newest lead</option>
                </Select>
              </div>
            </div>
          </div>
        </div>

        {visibleThreads.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-gray-200 bg-white px-5 py-12 text-center sm:px-6 sm:py-16 lg:py-20">
            <div className="mb-5 rounded-3xl bg-gray-50 p-6 sm:mb-6 sm:p-8">
              <svg className="h-14 w-14 text-brand-body/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            {threads.length > 0 ? (
              <>
                <h3 className="text-xl font-bold text-brand-heading">
                  {filterBy === "needs_follow_up"
                    ? "You're all caught up! No leads need follow-up."
                    : "No leads match your current filter."}
                </h3>
                <p className="mt-2 max-w-md text-brand-body/60">
                  {filterBy === "needs_follow_up" 
                    ? "Great job! All your active threads have been handled."
                    : "Try changing your filters to see more leads."}
                </p>
              </>
            ) : (
              <>
                <h3 className="text-xl font-bold text-brand-heading">
                  No leads tracked yet.
                </h3>
                <p className="mt-2 max-w-md text-brand-body/60">
                  {gmailStatus === "connected"
                    ? "Your Gmail account is connected. Run a sync to pull in recent sales threads and start tracking quiet leads."
                    : "Connect Gmail and sync your inbox to start tracking quiet sales threads."}
                </p>
                <Button
                  className="mt-8"
                  onClick={() => {
                    if (gmailStatus === "connected") {
                      void syncLeads();
                      return;
                    }
                    window.location.href = `/agents/${agentId}/settings`;
                  }}
                  disabled={isSyncing}
                >
                  {isSyncing ? "Syncing..." : emptyStateCtaLabel(agentId, gmailStatus)}
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4 sm:space-y-6">
            <div className="grid gap-4">
              {paginatedThreads.map((thread) => {
                const isGenerating = generatingThreadIds.includes(thread.id);
                const isRemoving = removingThreadIds.includes(thread.id);
                return (
                <Card
                  key={thread.id}
                  className="group overflow-hidden border-gray-200 p-0 transition-all hover:shadow-md"
                >
                  <div className="grid gap-4 p-4 sm:gap-5 sm:p-5 lg:grid-cols-[minmax(0,280px)_1fr_auto] lg:items-center lg:gap-6 lg:p-6">
                    <div className="flex items-start gap-4">
                      <div className={cn("mt-1 h-3 w-3 rounded-full shrink-0", statusDotClass(thread))} />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-3">
                          <h4 className="text-lg font-semibold text-brand-heading">
                            {thread.contact_name || thread.contact_email || "Unknown lead"}
                          </h4>
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider",
                              channelBadgeClass(thread.channel)
                            )}
                          >
                            <GmailIcon />
                            {channelLabel(thread.channel)}
                          </span>
                        </div>
                        <p className="mt-1 text-sm font-medium text-brand-body/60">{channelContact(thread)}</p>
                        <p className="mt-1 text-xs font-semibold text-brand-body/60">
                          Subject: {thread.subject?.trim() || "No subject"}
                        </p>
                      </div>
                    </div>

                    <div className="min-w-0">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        {thread.stage_label && (
                          <span className="text-xs font-semibold text-brand-body/50">
                            {thread.stage_label}
                          </span>
                        )}
                        {(thread.has_pending_draft || thread.status === "pending_approval") && (
                          <Badge variant="pending" className="text-[10px] font-black uppercase tracking-wider">
                            Awaiting approval
                          </Badge>
                        )}
                        {thread.status === "needs_review" && (
                          <Badge variant="needs-review" className="text-[10px] font-black uppercase tracking-wider">
                            Needs review
                          </Badge>
                        )}
                      </div>
                      <p className="line-clamp-2 text-sm leading-relaxed text-brand-body">
                        {thread.status === "needs_review" && thread.disconnection_error ? (
                          <span className="text-orange-600 font-semibold italic">
                            Your Gmail connection was disconnected. Please reconnect your Gmail account to generate drafts.
                          </span>
                        ) : (
                          previewText(thread)
                        )}
                      </p>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        {(() => {
                          const allNames = Array.from(
                            new Set((thread.recent_messages || []).flatMap((m) => m.attachment_names || []))
                          ).filter(Boolean);
                          const attachmentText = formatAttachmentNamesInline(allNames);
                          return (
                            <>
                              {attachmentText && (
                                <span className="text-xs text-gray-500">📎 {attachmentText}</span>
                              )}
                              {thread.channel === "gmail" && thread.gmail_thread_id && (
                                <a
                                  href={`https://mail.google.com/mail/u/0/#inbox/${thread.gmail_thread_id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={cn(
                                    "text-xs text-gray-400 transition-opacity hover:text-gray-600 hover:underline",
                                    !attachmentText && "opacity-0 group-hover:opacity-100"
                                  )}
                                >
                                  {attachmentText && " · "}
                                  View in Gmail →
                                </a>
                              )}
                            </>
                          );
                        })()}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-brand-body/60">
                        <span className="rounded-full border border-sky-100 bg-sky-50 px-2.5 py-1 text-sky-700">
                          Lead replied: {formatDateTime(thread.last_inbound_at)}
                        </span>
                        <span className="rounded-full border border-amber-100 bg-amber-50 px-2.5 py-1 text-amber-700">
                          You replied: {formatDateTime(thread.last_outbound_at ?? null)}
                        </span>
                        <button
                          className="text-brand-primary transition-colors hover:text-brand-heading"
                          onClick={() => {
                            setIsLoadingPreviewMessages(true);
                            setMessagePreviewThread(thread);
                          }}
                          type="button"
                        >
                          View full message
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col items-stretch gap-3 sm:items-start lg:items-end">
                      {(thread.has_pending_draft || thread.status === "pending_approval") && (
                        <Button size="sm" className="font-bold px-6 shadow-lg shadow-brand-primary/20" onClick={() => setSelectedThread(thread)}>
                          Review Drafts
                        </Button>
                      )}
                      {thread.status === "needs_review" && (
                        thread.disconnection_error ? (
                          <Button
                            size="sm"
                            className="font-bold bg-orange-600 text-white hover:bg-orange-700 shadow-lg shadow-orange-600/20"
                            onClick={reconnectGmail}
                          >
                            Reconnect Gmail
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="font-bold border-orange-200 text-orange-700 hover:bg-orange-50"
                            onClick={() => void generateFollowUp(thread)}
                            disabled={isGenerating}
                          >
                            {isGenerating ? "Retrying..." : "Retry"}
                          </Button>
                        )
                      )}
                      {!thread.has_pending_draft && thread.status === "active" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-brand-primary text-brand-primary hover:bg-brand-primary/5 font-bold"
                          onClick={() => void generateFollowUp(thread)}
                          disabled={isGenerating || isRemoving}
                        >
                          {isGenerating ? "Drafting..." : "Generate Follow-up"}
                        </Button>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleIgnoreThread(thread.id)}
                        disabled={isRemoving}
                        className="text-xs font-semibold text-gray-400 hover:text-red-500 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isRemoving ? "Removing..." : "Remove from dashboard"}
                      </button>
                    </div>
                  </div>
                </Card>
              );
            })}
            </div>

            <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-medium text-brand-body/60">
                Page {currentPage} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full border-gray-200"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full border-gray-200"
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}

        <DraftApprovalModal
          open={Boolean(selectedThread)}
          thread={selectedThread}
          agentId={agentId}
          initialDrafts={selectedThread ? draftsByThreadId[selectedThread.id] || null : null}
          onClose={() => setSelectedThread(null)}
          onSent={async () => {
            await fetchThreads();
            if (selectedThread) {
              setDraftsByThreadId((prev) => {
                const next = { ...prev };
                delete next[selectedThread.id];
                return next;
              });
            }
          }}
        />

        <Dialog open={Boolean(messagePreviewThread)} onClose={() => setMessagePreviewThread(null)}>
          <header className="border-b border-gray-100 px-6 py-5">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-bold text-brand-heading">
                {messagePreviewThread?.contact_name || messagePreviewThread?.contact_email || messagePreviewThread?.contact_phone || "Lead message"}
              </h3>
              {messagePreviewThread?.channel && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider",
                    channelBadgeClass(messagePreviewThread.channel)
                  )}
                >
                  <GmailIcon />
                  {channelLabel(messagePreviewThread.channel)}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm font-semibold text-brand-body/70">
              Subject: {messagePreviewThread?.subject?.trim() || "No subject"}
            </p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-brand-body/50">
              Latest conversation context
            </p>
          </header>
          <div className="space-y-3 px-6 py-5">
            {isLoadingPreviewMessages && (
              <p className="text-sm text-brand-body/60">Loading recent Gmail messages...</p>
            )}
            {messagePreviewThread?.status === "closed" && (
              <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-brand-heading">This conversation is closed</p>
                  <p className="mt-1 text-sm text-brand-body/60">
                    Reason: {closeReasonDescription(messagePreviewThread.close_reason)}
                  </p>
                </div>
                <Button variant="outline" className="rounded-full" onClick={() => void reopenThread(messagePreviewThread.id)}>
                  Reopen thread
                </Button>
              </div>
            )}
            {!isLoadingPreviewMessages && (messagePreviewThread?.recent_messages && messagePreviewThread.recent_messages.length > 0
              ? messagePreviewThread.recent_messages
              : messagePreviewThread?.last_message
                ? [messagePreviewThread.last_message]
                : []
            ).map((message, index) => (
              <div key={`${message.timestamp || "no-time"}-${index}`} className="rounded-xl border border-gray-100 bg-gray-50/50 p-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-brand-body/60">
                  {message.direction === "outbound" ? "Message you sent" : "Lead message"} · {formatDateTime(message.timestamp || null)}
                </p>
                {message.has_attachments && (
                  <div className="mb-2 space-y-0.5">
                    {(message.attachment_names || []).filter(Boolean).map((name, i) => (
                      <p key={i} className="text-xs text-gray-500 font-medium">📎 {name}</p>
                    ))}
                  </div>
                )}
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-brand-body">
                  {cleanEmailContent(message.content) || "No message content available."}
                </p>
              </div>
            ))}
            {!isLoadingPreviewMessages && (!messagePreviewThread?.recent_messages || messagePreviewThread.recent_messages.length === 0) &&
              !messagePreviewThread?.last_message && (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-brand-body">
                  No full message content is available for this thread yet.
                </p>
              )}
          </div>
          <footer className="flex items-center justify-end border-t border-gray-100 px-6 py-4">
            {messagePreviewThread?.channel === "gmail" && messagePreviewThread?.gmail_thread_id && (
              <a
                href={`https://mail.google.com/mail/u/0/#inbox/${messagePreviewThread.gmail_thread_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mr-4 text-xs font-semibold text-gray-400 transition-colors hover:text-gray-600 hover:underline"
              >
                Open in Gmail →
              </a>
            )}
            <Button variant="outline" onClick={() => setMessagePreviewThread(null)}>
              Close
            </Button>
          </footer>
        </Dialog>
      </main>
    </div>
  );
}
