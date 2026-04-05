"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { SignOutButton } from "@/components/sign-out-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { apiFetch, createCheckoutSession, createPortalSession, getAgents, joinWaitlist } from "@/lib/api";
import { AgentWithSubscription } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SuggestSkillModal } from "./suggest-skill-modal";
import { Sparkles } from "lucide-react";

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

export function AgentsHub() {
  const { pushToast } = useToast();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<AgentWithSubscription[]>([]);
  const [joiningWaitlistIds, setJoiningWaitlistIds] = useState<string[]>([]);

  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        const [meResult, agentsResult] = await Promise.allSettled([
          apiFetch<{ id: string; email?: string }>("/api/auth/me"),
          getAgents(),
        ]);

        if (agentsResult.status !== "fulfilled") {
          throw agentsResult.reason;
        }

        const agentData = agentsResult.value;
        setAgents(agentData);
      } catch {
        pushToast("Failed to load agents hub.");
      } finally {
        setLoading(false);
      }
    }

    void init();
  }, [pushToast]);

  useEffect(() => {
    if (searchParams.get("subscribed") === "true") {
      pushToast("Subscription active.");
    }
  }, [pushToast, searchParams]);

  const greeting = useMemo(() => {
    return `${greetingForHour(new Date().getHours())}.`;
  }, []);

  const subscribedAgents = useMemo(
    () => agents.filter((item) => item.subscription && ["active", "past_due", "inactive"].includes(item.subscription.status)),
    [agents]
  );

  const discoverAgents = useMemo(
    () => agents.filter((item) => !item.subscription || item.subscription.status === "canceled"),
    [agents]
  );

  const activeAgents = useMemo(
    () => subscribedAgents.filter((item) => item.subscription?.status === "active"),
    [subscribedAgents]
  );

  async function handleWaitlist(agentId: string) {
    setJoiningWaitlistIds((prev) => [...prev, agentId]);
    try {
      await joinWaitlist(agentId);
      setAgents((prev) => prev.map((item) => (item.agent.id === agentId ? { ...item, on_waitlist: true } : item)));
    } catch {
      pushToast("Could not join waitlist.");
    } finally {
      setJoiningWaitlistIds((prev) => prev.filter((id) => id !== agentId));
    }
  }

  async function handleCheckout(agentId: string, plan: "free" | "pro" = "free") {
    try {
      await createCheckoutSession(agentId, plan);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not start checkout.";
      pushToast(message, "error");
    }
  }

  async function handleManageBilling() {
    try {
      await createPortalSession();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not open billing portal.";
      pushToast(message, "error");
    }
  }

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
                available for ₹99/month and gets you live coverage right away.
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
                    const status = item.subscription?.status || "inactive";
                    const needsSetup = status === "active" && agent.id === "gmail_followup" && !item.gmail_connected;
                    const inactive = status === "inactive" || status === "past_due";
                    const metrics = item.thread_summary || null;
                    const needsAttention = (metrics?.needs_attention || 0) > 0;

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

                    if (inactive) {
                      return (
                        <Card key={agent.id} className="rounded-2xl border border-gray-100 p-6 hover:shadow-md transition">
                          <div className="flex items-start gap-3">
                            <span className="text-3xl">{agent.icon}</span>
                            <div>
                              <h3 className="text-lg font-semibold text-gray-900">{agent.name}</h3>
                              <p className="mt-1 text-sm font-medium text-amber-600">Subscription inactive</p>
                            </div>
                          </div>
                          <p className="mt-5 text-sm leading-relaxed text-gray-600">
                            Renew your subscription to continue monitoring your leads.
                          </p>
                          <div className="mt-6 flex justify-end">
                            <Button className="rounded-full bg-brand-primary px-6 font-bold hover:bg-brand-primary/90" onClick={() => void handleManageBilling()}>
                              Renew →
                            </Button>
                          </div>
                        </Card>
                      );
                    }

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
                              <p className="mt-1 text-sm font-medium text-gray-600">Active</p>
                            </div>
                          </div>
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
                  const joining = joiningWaitlistIds.includes(agent.id);
                  return (
                    <Card key={agent.id} className="rounded-2xl border border-gray-100 p-6 hover:shadow-md transition">
                      <div className="flex items-start gap-3">
                        <span className="text-3xl">{agent.icon}</span>
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">{agent.name}</h3>
                          <p className="mt-1 text-sm font-medium text-gray-600">
                            {agent.status === "active" ? `Available now · ₹${agent.free_price_inr}/month` : "Coming soon"}
                          </p>
                        </div>
                      </div>
                      <p className="mt-5 text-sm leading-relaxed text-gray-600">{agent.description}</p>
                      <div className="mt-6 flex justify-end">
                        {agent.status === "active" ? (
                          <Button className="rounded-full bg-brand-primary px-6 font-bold hover:bg-brand-primary/90" onClick={() => void handleCheckout(agent.id, "free")}>
                            Subscribe →
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
