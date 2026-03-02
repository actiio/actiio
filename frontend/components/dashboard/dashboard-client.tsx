"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams, usePathname } from "next/navigation";

import { DraftApprovalModal } from "@/components/dashboard/draft-approval-modal";
import { SignOutButton } from "@/components/sign-out-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { apiFetch, createCheckoutSession } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { LeadThread } from "@/lib/types";
import { cn } from "@/lib/utils";

function daysSince(timestamp: string | null) {
  if (!timestamp) return 0;
  const last = new Date(timestamp).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - last) / (1000 * 60 * 60 * 24)));
}

export function DashboardClient() {
  const { pushToast } = useToast();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const [userEmail, setUserEmail] = useState("");
  const [subscriptionStatus, setSubscriptionStatus] = useState<string>("inactive");
  const [threads, setThreads] = useState<LeadThread[]>([]);
  const [selectedThread, setSelectedThread] = useState<LeadThread | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [generatingThreadId, setGeneratingThreadId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "needs-followup" | "active" | "sent">("all");

  useEffect(() => {
    async function init() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user?.email) setUserEmail(user.email);
        if (!user) return;

        const { data: userRow } = await supabase.from("users").select("subscription_status").eq("id", user.id).maybeSingle();
        const status = userRow?.subscription_status || "inactive";
        setSubscriptionStatus(status);
        setLoadError(null);

        if (status === "active") {
          const data = await apiFetch<{ threads: LeadThread[] }>("/api/threads");
          setThreads(data.threads);
        }
      } catch (error) {
        setLoadError("Failed to load dashboard data");
        pushToast("Could not refresh dashboard.");
      }
    }
    void init();
  }, [pushToast]);

  useEffect(() => {
    if (searchParams.get("subscribed") === "true") {
      pushToast("Subscription active. Happy hunting!");
      setSubscriptionStatus("active");
    }
  }, [pushToast, searchParams]);

  const filteredThreads = useMemo(() => {
    let list = [...threads].sort((a, b) => new Date(b.last_inbound_at || "").getTime() - new Date(a.last_inbound_at || "").getTime());
    if (activeTab === "needs-followup") return list.filter(t => t.status === "pending_approval" || t.status === "needs_review");
    if (activeTab === "active") return list.filter(t => t.status === "active");
    // 'sent' not explicitly tracked in LeadThread status but we show active for now
    return list;
  }, [threads, activeTab]);

  async function generateFollowUp(thread: LeadThread) {
    setGeneratingThreadId(thread.id);
    try {
      const result = await apiFetch<{ status: string; reason?: string }>(`/api/threads/${thread.id}/generate-follow-up`, {
        method: "POST",
      });
      if (result.status === "needs_review") {
        setThreads((prev) => prev.map((t) => (t.id === thread.id ? { ...t, status: "needs_review" } : t)));
        pushToast("Manual review needed for this lead.");
        return;
      }
      setThreads((prev) => prev.map((t) => (t.id === thread.id ? { ...t, status: "pending_approval" } : t)));
      setSelectedThread({ ...thread, status: "pending_approval" });
      pushToast("Drafts ready for review.");
    } catch (error) {
      pushToast("Follow-up generation failed.");
    } finally {
      setGeneratingThreadId(null);
    }
  }

  const [isSyncing, setIsSyncing] = useState(false);
  async function syncLeads() {
    setIsSyncing(true);
    try {
      const data = await apiFetch<{ leads_found: number }>("/api/gmail/sync", { method: "POST" });
      pushToast(`Sync complete. Found ${data.leads_found} leads.`);
      const threadsData = await apiFetch<{ threads: LeadThread[] }>("/api/threads");
      setThreads(threadsData.threads);
    } catch (error) {
      pushToast("Leads sync failed.");
    } finally {
      setIsSyncing(false);
    }
  }

  // Sidebar Component
  const Sidebar = () => (
    <div className="fixed left-0 top-0 hidden h-screen w-64 flex-col border-r border-gray-100 bg-white p-6 lg:flex">
      <Link href="/" className="flex items-center gap-2 mb-10 group">
        <Image src="/logo.png" alt="Actiio Logo" width={24} height={24} className="h-6 w-auto" />
        <span className="text-xl font-bold tracking-tight">Actiio</span>
      </Link>

      <nav className="flex-1 space-y-1">
        {[
          { label: "Leads", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z", href: "/dashboard" },
          { label: "Settings", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z", href: "/settings" }
        ].map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className={cn(
              "flex items-center gap-3 px-4 py-3 text-sm font-semibold rounded-xl transition-all duration-200 group",
              pathname === item.href ? "bg-brand-primary/10 text-brand-primary" : "text-brand-body/60 hover:text-brand-heading hover:bg-gray-50"
            )}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
            </svg>
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="mt-auto border-t border-gray-100 pt-6">
        <div className="mb-4 flex items-center gap-3 px-2">
          <div className="h-8 w-8 rounded-full bg-brand-primary/10 flex items-center justify-center text-brand-primary font-bold text-xs">
            {userEmail[0]?.toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-brand-heading">{userEmail.split('@')[0]}</p>
            <p className="truncate text-xs text-brand-body/60">{userEmail}</p>
          </div>
        </div>
        <SignOutButton className="w-full justify-start gap-3 px-4 text-brand-body/60 hover:text-red-600 hover:bg-red-50" />
      </div>
    </div>
  );

  if (subscriptionStatus !== "active") {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
        <Sidebar />
        <Card className="w-full max-w-xl p-10 text-center shadow-2xl border-gray-100 lg:ml-64">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-brand-primary/10 text-brand-primary">
            <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h2 className="text-3xl font-bold tracking-tight mb-4">Agent Inactive</h2>
          <p className="text-brand-body/60 text-lg mb-10 leading-relaxed">
            Your follow-up agent is currently paused. Start your subscription to resume monitoring Gmail and WhatsApp leads.
          </p>
          <Button size="lg" className="w-full py-8 text-xl font-bold" onClick={() => void createCheckoutSession()}>
            Activate Account — $29/mo
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 lg:pl-64">
      <Sidebar />
      <main className="mx-auto max-w-7xl px-8 py-10">
        <header className="mb-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-brand-heading">Your Leads</h1>
            <p className="mt-1 text-sm font-medium text-brand-body/60 italic">
              {threads.length} leads being monitored across Gmail & WhatsApp
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-1.5 shadow-sm border border-gray-100">
            {["all", "needs-followup", "active"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={cn(
                  "px-6 py-2.5 text-sm font-bold capitalize rounded-xl transition-all duration-200",
                  activeTab === tab ? "bg-brand-primary text-white shadow-md shadow-brand-primary/20" : "text-brand-body/60 hover:text-brand-heading hover:bg-gray-50"
                )}
              >
                {tab.replace('-', ' ')}
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            className="rounded-xl px-5 border-gray-200"
            onClick={syncLeads}
            disabled={isSyncing}
          >
            <svg className={cn("mr-2 h-4 w-4", isSyncing && "animate-spin")} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {isSyncing ? "Syncing..." : "Sync Gmail"}
          </Button>
        </header>

        {/* Stats Row */}
        <section className="mb-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Total leads", val: threads.length, color: "gray" },
            { label: "Awaiting reply", val: threads.filter(t => t.status !== 'active').length, color: "green", highlight: true },
            { label: "Follow-ups sent", val: "12", color: "gray" },
            { label: "Avg reply time", val: "1.2h", color: "gray" },
          ].map((stat, i) => (
            <Card key={i} className={cn("p-6 text-center", stat.highlight && "border-brand-primary/20 bg-brand-primary/5")}>
              <p className="text-sm font-bold uppercase tracking-wider text-brand-body/50">{stat.label}</p>
              <p className={cn("mt-2 text-3xl font-black text-brand-heading", stat.highlight && "text-brand-primary")}>{stat.val}</p>
            </Card>
          ))}
        </section>

        {loadError && (
          <div className="mb-8 p-4 rounded-2xl bg-red-50 border border-red-100 text-sm text-red-600 font-medium">
            Sync error: {loadError}
          </div>
        )}

        {filteredThreads.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-24 pb-40 text-center">
            <div className="mb-6 rounded-3xl bg-white p-10 shadow-xl border border-gray-100">
              <svg className="h-20 w-20 text-brand-body/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-brand-heading">No leads tracked yet</h3>
            <p className="mt-2 text-brand-body/60 max-w-sm">Connect your Gmail to start monitoring your sales conversations automatically.</p>
            <Button className="mt-8 px-10 py-6 text-lg font-bold" onClick={syncLeads}>Connect Gmail</Button>
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredThreads.map((thread) => (
              <Card key={thread.id} className="group relative overflow-hidden p-0 border-gray-100">
                <div className="flex flex-col p-6 sm:flex-row sm:items-center sm:justify-between gap-6">
                  <div className="flex items-center gap-5">
                    <div className={cn(
                      "h-3 w-3 rounded-full shrink-0",
                      thread.status === 'active' ? 'bg-green-500' : thread.status === 'pending_approval' ? 'bg-yellow-400' : 'bg-orange-500 animate-pulse'
                    )} />
                    <div>
                      <div className="flex items-center gap-3">
                        <h4 className="text-lg font-bold text-brand-heading">
                          {thread.contact_name || thread.contact_email?.split('@')[0] || "Unknown lead"}
                        </h4>
                        <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-gray-600">
                          {thread.channel}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-brand-body/60">{thread.contact_email}</p>
                    </div>
                  </div>

                  <div className="flex-1 max-w-md">
                    <p className="line-clamp-1 text-sm text-brand-body italic leading-relaxed">
                      "{thread.last_message_preview}"
                    </p>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-6 border-t border-gray-50 pt-4 sm:border-0 sm:pt-0">
                    <div className="text-right">
                      <p className={cn(
                        "text-xs font-black uppercase tracking-widest",
                        daysSince(thread.last_inbound_at) > 2 ? "text-orange-600" : "text-brand-body/40"
                      )}>
                        {daysSince(thread.last_inbound_at)} days silent
                      </p>
                    </div>

                    {thread.status === "active" && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="font-bold hover:bg-brand-primary/10 hover:text-brand-primary"
                        onClick={() => void generateFollowUp(thread)}
                        disabled={generatingThreadId === thread.id}
                      >
                        {generatingThreadId === thread.id ? "Drafting..." : "Generate Follow-up"}
                      </Button>
                    )}
                    {thread.status === "pending_approval" && (
                      <Button size="sm" className="font-bold px-6 shadow-lg shadow-brand-primary/20" onClick={() => setSelectedThread(thread)}>
                        Review Drafts
                      </Button>
                    )}
                    {thread.status === "needs_review" && (
                      <Button variant="outline" size="sm" className="font-bold border-orange-200 text-orange-700 hover:bg-orange-50">
                        Review Manually
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        <DraftApprovalModal
          open={Boolean(selectedThread)}
          thread={selectedThread}
          onClose={() => setSelectedThread(null)}
          onSent={(threadId) => setThreads((prev) => prev.map((t) => (t.id === threadId ? { ...t, status: "active" } : t)))}
        />
      </main>
    </div>
  );
}
