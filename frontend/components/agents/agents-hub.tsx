"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { SignOutButton } from "@/components/sign-out-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import {
  apiFetch,
  createAutopaySubscription,
  createPaymentOrder,
  getAgents,
  getSubscriptionStatus,
  joinWaitlist,
  renewSubscription,
} from "@/lib/api";
import { AgentWithSubscription, SubscriptionStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SuggestSkillModal } from "./suggest-skill-modal";
import { Sparkles } from "lucide-react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function greetingForHour(hour: number) {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 22) return "Good evening";
  return "Good night";
}

function formatSyncTimestamp(timestamp: string | null) {
  if (!timestamp) return "Not synced yet";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Not synced yet";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatExpiryDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getCashfreeMode(): "sandbox" | "production" {
  return process.env.NEXT_PUBLIC_CASHFREE_ENV === "production"
    ? "production"
    : "sandbox";
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function SkeletonCard() {
  return (
    <Card className="rounded-2xl border border-gray-100 p-6 animate-pulse">
      <div className="h-5 w-40 rounded bg-gray-200" />
      <div className="mt-3 h-4 w-24 rounded bg-gray-100" />
      <div className="mt-6 grid grid-cols-3 gap-3">
        {[1, 2, 3].map((item) => (
          <div key={item} className="rounded-xl border border-gray-100 p-4">
            <div className="h-8 w-10 rounded bg-gray-200" />
            <div className="mt-2 h-3 w-16 rounded bg-gray-100" />
          </div>
        ))}
      </div>
      <div className="mt-6 h-4 w-32 rounded bg-gray-100" />
      <div className="mt-6 h-11 w-32 rounded-full bg-gray-200" />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AgentsHub() {
  const { pushToast } = useToast();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<AgentWithSubscription[]>([]);
  const [joiningWaitlistIds, setJoiningWaitlistIds] = useState<string[]>([]);

  // Subscription state — keyed by agent id
  const [subStatus, setSubStatus] = useState<Record<string, SubscriptionStatus>>({});
  const [paymentLoading, setPaymentLoading] = useState<string | null>(null);
  const [statusLoadingIds, setStatusLoadingIds] = useState<string[]>([]);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ------- data loading -------
  const fetchSubStatus = useCallback(
    async (agentId: string) => {
      try {
        const status = await getSubscriptionStatus(agentId);
        setSubStatus((prev) => ({ ...prev, [agentId]: status }));
        return status;
      } catch {
        // Non-critical — sub status card will just not show
        return null;
      }
    },
    []
  );

  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        const [, agentsResult] = await Promise.allSettled([
          apiFetch<{ id: string; email?: string }>("/api/auth/me"),
          getAgents(),
        ]);

        if (agentsResult.status !== "fulfilled") {
          throw agentsResult.reason;
        }

        const agentData = agentsResult.value;
        setAgents(agentData);

        // Fetch subscription status for active agents
        const activeAgentIds = agentData
          .filter((a) => a.agent.status === "active")
          .map((a) => a.agent.id);
        await Promise.allSettled(activeAgentIds.map(fetchSubStatus));
      } catch (err) {
        console.error("AgentsHub init failed:", err);
        pushToast("Failed to load agents hub.", "error");
      } finally {
        setLoading(false);
      }
    }

    void init();
  }, [pushToast, fetchSubStatus]);

  useEffect(() => {
    if (searchParams.get("subscribed") === "true") {
      pushToast("Subscription active.");
    }
  }, [pushToast, searchParams]);

  // Handle Cashfree autopay return redirect:
  // e.g. /agents?subscription_id=ACTIIO-SUB-...&agent_id=gmail_followup&autopay=true
  useEffect(() => {
    const agentId = searchParams.get("agent_id") || searchParams.get("subscription_id")?.split("-")?.[3]; // Correct index is 3
    const isAutopay = searchParams.get("autopay") === "true";
    if (!agentId || !isAutopay) return;

    // Clean the URL so a refresh doesn't re-trigger this
    try {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("subscription_id");
      cleanUrl.searchParams.delete("agent_id");
      cleanUrl.searchParams.delete("autopay");
      window.history.replaceState({}, "", cleanUrl.pathname + (cleanUrl.search || ""));
    } catch (e) {
      console.warn("Failed to clean URL:", e);
    }

    // Show immediate feedback and then poll for confirmation
    pushToast("Autopay setup received — checking status…");
    
    let isMounted = true;
    void (async () => {
      try {
        // Give Cashfree's webhook a few seconds to fire first
        await new Promise((r) => setTimeout(r, 4000));
        if (!isMounted) return;

        const status = await fetchSubStatus(agentId);
        if (!isMounted) return;

        if (status?.status === "active" && status.autopay_enabled) {
          pushToast("Autopay is now active! 🎉");
        } else if (status?.status === "active" || status?.status === "payment_pending") {
          pushToast("Cashfree is still confirming autopay. Check back shortly.");
        }
        
        // Refresh the agents list so the card reflects the latest state
        const data = await getAgents();
        if (isMounted) setAgents(data);
      } catch (err) {
        console.error("Autopay confirmation failed:", err);
      }
    })();

    return () => { isMounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount only

  // Cleanup poll timer on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  const [greeting, setGreeting] = useState("Hello.");

  useEffect(() => {
    setGreeting(`${greetingForHour(new Date().getHours())}.`);
  }, []);

  const subscribedAgents = useMemo(() => {
    return agents.filter((item) => {
      const sub = subStatus[item.agent.id];
      if (!sub) return false;
      return sub.status === "active" || sub.status === "payment_pending";
    });
  }, [agents, subStatus]);

  const discoverAgents = useMemo(() => {
    return agents.filter((item) => {
      const sub = subStatus[item.agent.id];
      const isSubscribed = sub && (sub.status === "active" || sub.status === "payment_pending");
      return !isSubscribed;
    });
  }, [agents, subStatus]);

  // ------- payment flow -------
  async function openCashfreeCheckout(paymentSessionId: string): Promise<void> {
    if (!window.Cashfree) {
      throw new Error("Payment SDK not loaded. Please refresh and try again.");
    }
    const cashfree = window.Cashfree({ mode: getCashfreeMode() });
    const result = await cashfree.checkout({
      paymentSessionId,
      redirectTarget: "_modal",
    });
    if (result?.error?.message) {
      throw new Error(result.error.message);
    }
  }

  async function openCashfreeAutopayCheckout(subscriptionSessionId: string): Promise<void> {
    if (!window.Cashfree) {
      throw new Error("Payment SDK not loaded. Please refresh and try again.");
    }
    const cashfree = window.Cashfree({ mode: getCashfreeMode() });
    const result = await cashfree.subscriptionsCheckout({
      subsSessionId: subscriptionSessionId,
      redirectTarget: "_self",
    });
    if (result?.error?.message) {
      throw new Error(result.error.message);
    }
  }

  const pollUntilActive = useCallback(
    async (agentId: string) => {
      const maxAttempts = 10;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        // Wait 3 seconds before polling
        await new Promise((resolve) => {
          pollTimerRef.current = setTimeout(resolve, 3000);
        });

        const status = await fetchSubStatus(agentId);
        if (status?.status === "active") {
          pushToast("Subscription activated! 🎉");
          try {
            const data = await getAgents();
            setAgents(data);
          } catch {
            /* best-effort */
          }
          return;
        }

        // If it switched to payment_pending, the UI has already updated to the "Pending" card
        // which has its own status check button. We can stop polling here to release the loading state.
        if (status?.status === "payment_pending") {
          return;
        }

        // If it failed, stop polling
        if (status?.status === "payment_failed") {
          pushToast("Payment failed. Please try again.", "error");
          return;
        }
      }

      pushToast("Payment processing… refresh in a moment.");
    },
    [fetchSubStatus, pushToast]
  );

  async function handleCheckStatus(agentId: string) {
    setStatusLoadingIds((prev) => (prev.includes(agentId) ? prev : [...prev, agentId]));
    try {
      const status = await fetchSubStatus(agentId);
      if (status?.status === "active") {
        pushToast("Subscription activated.");
        try {
          const data = await getAgents();
          setAgents(data);
        } catch {
          /* best-effort */
        }
      } else if (status?.status === "payment_pending") {
        pushToast("Still waiting for Cashfree confirmation.");
      } else if (status?.status === "payment_failed") {
        pushToast("Payment failed. Please try again.", "error");
      }
    } finally {
      setStatusLoadingIds((prev) => prev.filter((id) => id !== agentId));
    }
  }

  async function handleSubscribe(agentId: string) {
    setPaymentLoading(agentId);
    try {
      const resp = await createPaymentOrder(agentId);
      if (!resp.payment_session_id) {
        throw new Error("No payment session returned.");
      }
      await openCashfreeCheckout(resp.payment_session_id);
      // Stay in loading state while polling
      await pollUntilActive(agentId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not start payment.";
      pushToast(message, "error");
    } finally {
      setPaymentLoading(null);
    }
  }

  async function handleRenew(agentId: string) {
    setPaymentLoading(`renew:${agentId}`);
    try {
      const resp = await renewSubscription(agentId);
      if (!resp.payment_session_id) {
        throw new Error("No payment session returned.");
      }
      await openCashfreeCheckout(resp.payment_session_id);
      // Stay in loading state while polling
      await pollUntilActive(agentId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not process renewal.";
      pushToast(message, "error");
    } finally {
      setPaymentLoading(null);
    }
  }

  async function handleAutopay(agentId: string) {
    setPaymentLoading(`autopay:${agentId}`);
    try {
      const resp = await createAutopaySubscription(agentId);
      if (resp.status === "already_enabled") {
        pushToast("Autopay is already enabled.");
        await fetchSubStatus(agentId);
        return;
      }
      if (!resp.subscription_session_id) {
        throw new Error("No autopay session returned.");
      }
      await openCashfreeAutopayCheckout(resp.subscription_session_id);
      pushToast("Autopay authorization submitted. We’ll update this once Cashfree confirms it.");
      await fetchSubStatus(agentId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not set up autopay.";
      pushToast(message, "error");
    } finally {
      setPaymentLoading(null);
    }
  }

  async function handleWaitlist(agentId: string) {
    setJoiningWaitlistIds((prev) => [...prev, agentId]);
    try {
      await joinWaitlist(agentId);
      setAgents((prev) =>
        prev.map((item) =>
          item.agent.id === agentId ? { ...item, on_waitlist: true } : item
        )
      );
    } catch {
      pushToast("Could not join waitlist.");
    } finally {
      setJoiningWaitlistIds((prev) => prev.filter((id) => id !== agentId));
    }
  }

  // ------- expiry warning -------
  const expiringAgents = useMemo(() => {
    return Object.entries(subStatus)
      .filter(
        ([, sub]) =>
          sub.status === "active" &&
          sub.days_remaining !== null &&
          sub.days_remaining >= 1 &&
          sub.days_remaining <= 5
      )
      .map(([agentId, sub]) => ({ agentId, daysRemaining: sub.days_remaining }));
  }, [subStatus]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-[#f9fafb] lg:pl-64">
      <aside className="fixed left-0 top-0 hidden h-screen w-64 flex-col border-r border-gray-100 bg-white p-6 lg:flex">
        <div className="mb-8 space-y-6">
          <Link href="/" className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-brand-body/30 hover:text-brand-primary transition-colors">
            <span aria-hidden="true">←</span>
            <span>Back to Home</span>
          </Link>
          <Link href="/" className="flex items-center gap-2 group">
            <Image src="/logo.png" alt="Actiio Logo" width={24} height={24} className="h-6 w-auto" />
            <span className="text-xl font-bold tracking-tight text-brand-heading">Actiio</span>
          </Link>
        </div>

        <nav className="flex-1 space-y-1">
          <Link href="/agents" className="block rounded-xl bg-brand-primary/10 px-4 py-3 text-sm font-semibold text-brand-primary">
            Agents Hub
          </Link>
          <div className="pt-2">
            <SuggestSkillModal>
              <button className="flex w-full items-center gap-2 rounded-xl border border-dashed border-gray-200 bg-gray-50/50 px-4 py-3 text-sm font-bold text-gray-500 hover:border-brand-primary/40 hover:bg-white hover:text-brand-primary transition-all">
                <Sparkles className="h-4 w-4" />
                Suggest a Skill
              </button>
            </SuggestSkillModal>
          </div>
        </nav>

        <div className="mt-6 border-t border-gray-100 pt-6">
          <SignOutButton className="w-full justify-start gap-3 px-4 text-brand-body/60 hover:bg-red-50 hover:text-red-600" />
        </div>
      </aside>

      <main className="px-4 py-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-8 lg:pt-4">
          {/* Expiry warning banner */}
          {expiringAgents.map(({ agentId, daysRemaining }) => (
            <div
              key={`expiry-${agentId}`}
              className="flex items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 px-6 py-4"
            >
              <p className="text-sm font-semibold text-amber-800">
                ⚠️ Your subscription expires in {daysRemaining} day
                {daysRemaining !== 1 ? "s" : ""}. Renew now to avoid
                interruption.
              </p>
              <Button
                size="sm"
                className="shrink-0 rounded-full bg-amber-600 px-5 font-bold text-white hover:bg-amber-700"
                disabled={paymentLoading === `renew:${agentId}`}
                onClick={() => void handleRenew(agentId)}
              >
                {paymentLoading === `renew:${agentId}` ? "Processing…" : "Renew"}
              </Button>
            </div>
          ))}

          <header className="space-y-3">
            <h1 className="text-[clamp(1.8rem,3vw,2.35rem)] font-black tracking-tight text-brand-heading">
              {greeting}
            </h1>
            <p className="text-sm leading-6 text-brand-body/60">
              {loading
                ? "Loading your agents and activity."
                : subscribedAgents.length > 0
                ? "Here's what needs your attention today."
                : "Get started by subscribing to your first agent."}
            </p>
          </header>

          {!loading && subscribedAgents.length === 0 && (
            <Card className="rounded-2xl border border-gray-100 p-8">
              <h2 className="text-lg font-semibold text-gray-900">Welcome to Actiio</h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-gray-600">
                Subscribe to your first agent to start monitoring your leads automatically. The Gmail Follow-up Agent is
                available for ₹499/month and gets you live coverage right away.
              </p>
            </Card>
          )}

          {(loading || subscribedAgents.length > 0) && (
            <section>
              <h2 className="mb-4 text-lg font-semibold text-gray-900">Your Agents</h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {loading ? (
                  <>
                    <SkeletonCard />
                    <SkeletonCard />
                  </>
                ) : (
                  subscribedAgents.map((item) => {
                    const agent = item.agent;
                    const sub = subStatus[agent.id];
                    const isActive = sub?.status === "active";
                    const isPending = sub?.status === "payment_pending";
                    const autopayPending = Boolean(sub?.cashfree_subscription_id && !sub.autopay_enabled);
                    const canRenew = Boolean(sub && sub.days_remaining !== null && sub.days_remaining <= 5);
                    const needsSetup = isActive && agent.id === "gmail_followup" && !item.gmail_connected;
                    const metrics = item.thread_summary || null;
                    const needsAttention = (metrics?.needs_attention || 0) > 0;

                    if (isPending) {
                      const isAutopayPending = Boolean(sub?.cashfree_subscription_id && !sub.autopay_enabled);
                      const isCheckingStatus = statusLoadingIds.includes(agent.id);
                      return (
                        <Card key={agent.id} className="rounded-2xl border border-gray-100 p-6 hover:shadow-md transition">
                          <div className="flex items-start gap-3">
                            <span className="text-3xl">{agent.icon}</span>
                            <div>
                              <h3 className="text-lg font-semibold text-gray-900">{agent.name}</h3>
                              <p className="mt-1 text-sm font-medium text-amber-600">
                                {isAutopayPending ? "Autopay pending" : "Payment pending"}
                              </p>
                            </div>
                          </div>
                          <p className="mt-5 text-sm leading-relaxed text-gray-600">
                            {isAutopayPending
                              ? "Cashfree is confirming your autopay authorization."
                              : "We’re waiting for Cashfree to confirm your payment. This usually takes a minute."}
                          </p>
                          <div className="mt-6 flex justify-end">
                            <Button
                              className="rounded-full bg-brand-primary px-6 font-bold hover:bg-brand-primary/90"
                              disabled={isCheckingStatus}
                              onClick={() => void handleCheckStatus(agent.id)}
                            >
                              {isCheckingStatus ? "Checking..." : "Check status"}
                            </Button>
                          </div>
                        </Card>
                      );
                    }

                    if (needsSetup) {
                      return (
                        <Card key={agent.id} className="rounded-2xl border border-gray-100 p-6 hover:shadow-md transition">
                          <div className="flex items-start gap-3">
                            <span className="text-3xl">{agent.icon}</span>
                            <div>
                              <h3 className="text-lg font-semibold text-gray-900">{agent.name}</h3>
                              <p className="mt-1 text-sm font-medium text-amber-600">Setup required</p>
                            </div>
                          </div>
                          <p className="mt-5 text-sm leading-relaxed text-gray-600">
                            Connect your Gmail account to start monitoring your leads.
                          </p>
                          <div className="mt-6 flex justify-end">
                            <Link href={`/agents/${agent.id}/onboarding`}>
                              <Button className="rounded-full bg-brand-primary px-6 font-bold hover:bg-brand-primary/90">
                                Complete setup →
                              </Button>
                            </Link>
                          </div>
                        </Card>
                      );
                    }

                    // Active agent card
                    return (
                      <Card
                        key={agent.id}
                        className={cn(
                          "rounded-2xl border border-gray-100 p-6 hover:shadow-md transition",
                          needsAttention && "border-l-4 border-l-[#00bf63]"
                        )}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3">
                            <span className="text-3xl">{agent.icon}</span>
                            <div>
                              <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                                {agent.name}
                                <span className={cn("h-2.5 w-2.5 rounded-full", needsAttention ? "bg-[#00bf63] animate-pulse" : "bg-gray-300")} />
                              </h3>
                              <p className="mt-1 text-sm font-medium text-gray-600">
                                Active until {formatExpiryDate(sub?.current_period_end ?? null)}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Subscription info bar */}
                        <div className="mt-4 flex items-center gap-3">
                          <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                            {sub?.days_remaining ?? 0} days remaining
                          </span>
                          <Button
                            size="sm"
                            className="rounded-full bg-brand-primary px-4 text-xs font-bold hover:bg-brand-primary/90 disabled:bg-gray-100 disabled:text-gray-400"
                            disabled={paymentLoading?.includes(agent.id) || !canRenew}
                            onClick={() => void handleRenew(agent.id)}
                          >
                            {paymentLoading === `renew:${agent.id}` ? "Processing…" : "Renew — ₹499"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-full px-4 text-xs font-bold"
                            disabled={paymentLoading?.includes(agent.id) || sub?.autopay_enabled || autopayPending}
                            onClick={() => void handleAutopay(agent.id)}
                          >
                            {sub?.autopay_enabled
                              ? "Autopay on"
                              : autopayPending
                              ? "Autopay pending"
                              : paymentLoading === `autopay:${agent.id}`
                              ? "Processing…"
                              : "Set up autopay"}
                          </Button>
                        </div>

                        <div className="mt-6 grid grid-cols-3 gap-3">
                          {[
                            { label: "Need attention", value: metrics?.needs_attention || 0 },
                            { label: "Active leads", value: metrics?.active_leads || 0 },
                            { label: "Total leads", value: metrics?.total_leads || 0 },
                          ].map((stat) => (
                            <div key={stat.label} className="rounded-xl border border-gray-100 p-4">
                              <p className={cn("text-3xl font-bold", stat.value > 0 ? "text-[#00bf63]" : "text-gray-400")}>{stat.value}</p>
                              <p className="mt-1 text-xs font-medium text-gray-500">{stat.label}</p>
                            </div>
                          ))}
                        </div>

                        <p className="mt-5 text-sm text-gray-500">Last inbox sync: {formatSyncTimestamp(metrics?.last_synced || null)}</p>

                        <div className="mt-6 flex justify-end">
                            <Link href={`/agents/${agent.id}/dashboard`}>
                              <Button className="rounded-full bg-brand-primary px-6 font-bold hover:bg-brand-primary/90">
                                Open Workspace →
                              </Button>
                            </Link>
                        </div>
                      </Card>
                    );
                  })
                )}
              </div>
            </section>
          )}

          <section>
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Discover More Agents</h2>
              <p className="mt-1 text-sm text-gray-600">More tools for your sales team, coming soon.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {loading ? (
                <>
                  <SkeletonCard />
                  <SkeletonCard />
                  <SkeletonCard />
                </>
              ) : (
                discoverAgents.map((item) => {
                  const agent = item.agent;
                  const sub = subStatus[agent.id];
                  const joining = joiningWaitlistIds.includes(agent.id);
                  const isExpired = sub?.status === "expired";
                  const isFailed = sub?.status === "payment_failed";
                  const showSubscribe = agent.status === "active";
                  const subscribeLabel = isExpired
                    ? "Renew — ₹499"
                    : isFailed
                    ? "Retry payment — ₹499"
                    : "Subscribe — ₹499";

                  return (
                    <Card key={agent.id} className="rounded-2xl border border-gray-100 p-6 hover:shadow-md transition">
                      <div className="flex items-start gap-3">
                        <span className="text-3xl">{agent.icon}</span>
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">{agent.name}</h3>
                          <p className="mt-1 text-sm font-medium text-gray-600">
                            {agent.status === "active"
                              ? isExpired
                                ? "Subscription expired"
                                : isFailed
                                ? "Payment failed"
                                : `₹${agent.price_inr}/month`
                              : "Coming soon"}
                          </p>
                        </div>
                      </div>
                      <p className="mt-5 text-sm leading-relaxed text-gray-600">{agent.description}</p>
                      <div className="mt-6 flex justify-end">
                        {showSubscribe ? (
                          <Button
                            className="rounded-full bg-brand-primary px-6 font-bold hover:bg-brand-primary/90"
                            disabled={paymentLoading?.includes(agent.id)}
                            onClick={() =>
                              isExpired
                                ? void handleRenew(agent.id)
                                : void handleSubscribe(agent.id)
                            }
                          >
                            {paymentLoading === `renew:${agent.id}` || paymentLoading === agent.id
                              ? "Processing…"
                              : subscribeLabel}
                          </Button>
                        ) : (
                          <Button
                            variant={item.on_waitlist ? "outline" : "default"}
                            disabled={item.on_waitlist || joining}
                            className={cn(
                              "rounded-full px-6 font-bold",
                              item.on_waitlist
                                ? "border-[#00bf63] text-[#00bf63]"
                                : "bg-brand-primary hover:bg-brand-primary/90"
                            )}
                            onClick={() => void handleWaitlist(agent.id)}
                          >
                            {item.on_waitlist ? "You're on the list ✓" : joining ? "Joining..." : "Notify me →"}
                          </Button>
                        )}
                      </div>
                    </Card>
                  );
                })
              )}
            </div>
          </section>
          <section className="mb-12">
            <div className="relative overflow-hidden rounded-[2rem] border border-brand-primary/10 bg-white p-8 md:p-12 shadow-sm">
              <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-brand-primary/5 blur-3xl" />
              <div className="absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-brand-primary/5 blur-3xl" />
              
              <div className="relative flex flex-col items-center text-center">
                <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-3xl bg-brand-primary/10 text-brand-primary">
                  <Sparkles className="h-7 w-7" />
                </div>
                <h2 className="mb-4 text-2xl font-black tracking-tight text-brand-heading md:text-3xl">
                  Need a specialized skill?
                </h2>
                <p className="mx-auto mb-8 max-w-xl text-lg text-brand-body/60">
                  We are constantly training our agents on new domains. Let us know what you need and we will prioritize it in our roadmap.
                </p>
                <SuggestSkillModal>
                  <Button className="h-14 rounded-2xl bg-brand-primary px-8 text-base font-bold text-white shadow-xl shadow-brand-primary/20 hover:bg-brand-primary/90 transition-all active:scale-[0.98]">
                    Suggest a New Skill
                  </Button>
                </SuggestSkillModal>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
