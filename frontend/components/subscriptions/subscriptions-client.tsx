"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";

import { SignOutButton } from "@/components/sign-out-button";
import { AgentSubscriptionCard } from "@/components/subscriptions/agent-subscription-card";
import { AgentComingSoonCard } from "@/components/subscriptions/agent-coming-soon-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { apiFetch, getSubscriptions, createCheckoutSession } from "@/lib/api";
import { AgentWithSubscription } from "@/lib/types";

export function SubscriptionsClient() {
    const { pushToast } = useToast();

    const [userEmail, setUserEmail] = useState("");
    const [agentSubs, setAgentSubs] = useState<AgentWithSubscription[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function init() {
            try {
                const [me, subs] = await Promise.all([
                    apiFetch<{ id: string; email?: string }>("/api/auth/me"),
                    getSubscriptions(),
                ]);
                if (me.email) setUserEmail(me.email);
                setAgentSubs(subs);
            } catch {
                pushToast("Failed to load subscriptions.");
            } finally {
                setLoading(false);
            }
        }
        void init();
    }, [pushToast]);

    useEffect(() => {
        if (new URLSearchParams(window.location.search).get("subscribed") === "true") {
            pushToast("Subscription activated! 🎉");
            getSubscriptions().then(setAgentSubs).catch(() => { });
        }
    }, [pushToast]);

    const activeSubscriptions = agentSubs.filter(
        (a) => a.subscription && a.subscription.status !== "inactive"
    );

    const allAgents = agentSubs;

    async function handleCheckout(agentId: string, plan: "free" | "pro") {
        try {
            await createCheckoutSession(agentId, plan);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Could not start checkout.";
            pushToast(message, "error");
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 lg:pl-64">
                <aside className="fixed left-0 top-0 hidden h-screen w-64 flex-col border-r border-gray-100 bg-white p-6 lg:flex">
                    <Link href="/" className="mb-10 flex items-center gap-2 group">
                        <Image src="/logo.png" alt="Actiio Logo" width={24} height={24} className="h-6 w-auto" />
                        <span className="text-xl font-bold tracking-tight text-brand-heading">Actiio</span>
                    </Link>

                    <nav className="flex-1 space-y-1">
                        <Link href="/agents" className="block rounded-xl px-4 py-3 text-sm font-semibold text-brand-body/70 hover:bg-gray-50 hover:text-brand-heading">
                            Agents Hub
                        </Link>
                        <Link href="/subscriptions" className="block rounded-xl bg-brand-primary/10 px-4 py-3 text-sm font-semibold text-brand-primary">
                            Subscriptions
                        </Link>
                    </nav>

                    <div className="mt-6 border-t border-gray-100 pt-6">
                        <SignOutButton className="w-full justify-start gap-3 px-4 text-brand-body/60 hover:bg-red-50 hover:text-red-600" />
                    </div>
                </aside>

                <div className="flex min-h-screen items-center justify-center px-4">
                <div className="animate-pulse space-y-6 max-w-5xl w-full px-8">
                    <div className="h-8 w-48 bg-gray-200 rounded-lg" />
                    <div className="h-4 w-64 bg-gray-100 rounded-lg" />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="h-60 bg-gray-100 rounded-xl" />
                        ))}
                    </div>
                </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 pb-20 lg:pl-64">
            <aside className="fixed left-0 top-0 hidden h-screen w-64 flex-col border-r border-gray-100 bg-white p-6 lg:flex">
                <Link href="/" className="mb-10 flex items-center gap-2 group">
                    <Image src="/logo.png" alt="Actiio Logo" width={24} height={24} className="h-6 w-auto" />
                    <span className="text-xl font-bold tracking-tight text-brand-heading">Actiio</span>
                </Link>

                <nav className="flex-1 space-y-1">
                    <Link href="/agents" className="block rounded-xl px-4 py-3 text-sm font-semibold text-brand-body/70 hover:bg-gray-50 hover:text-brand-heading">
                        Agents Hub
                    </Link>
                    <Link href="/subscriptions" className="block rounded-xl bg-brand-primary/10 px-4 py-3 text-sm font-semibold text-brand-primary">
                        Subscriptions
                    </Link>
                </nav>

                <div className="mt-6 border-t border-gray-100 pt-6">
                    <SignOutButton className="w-full justify-start gap-3 px-4 text-brand-body/60 hover:bg-red-50 hover:text-red-600" />
                </div>
            </aside>

            <main className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
                <header className="mb-12 flex items-start justify-between gap-6 lg:pt-4">
                    <div>
                        <h1 className="text-[clamp(1.8rem,3vw,2.35rem)] font-black tracking-tight text-brand-heading">
                            Subscriptions
                        </h1>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-brand-body/60">
                            Manage your active agents, explore the marketplace, and subscribe to new products when you&apos;re ready.
                        </p>
                    </div>
                    <span className="hidden text-xs font-bold text-brand-body/40 sm:block">
                        {userEmail}
                    </span>
                </header>

                <section className="mb-16">
                    <h2 className="text-xl font-black text-brand-heading mb-6 uppercase tracking-widest text-[12px]">Your active agents</h2>
                    {activeSubscriptions.length === 0 ? (
                        <Card className="border-gray-100 p-12 text-center bg-white/50">
                            <p className="text-brand-body/60 font-medium max-w-sm mx-auto">
                                You haven't activated any agents yet. Explore the marketplace below to get started.
                            </p>
                        </Card>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {activeSubscriptions.map((data) => (
                                <AgentSubscriptionCard key={data.agent.id} data={data} />
                            ))}
                        </div>
                    )}
                </section>

                <section>
                    <h2 className="text-xl font-black text-brand-heading mb-6 uppercase tracking-widest text-[12px]">Explore Marketplace</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {allAgents.map((data) => {
                            if (data.agent.status === "coming_soon") {
                                return <AgentComingSoonCard key={data.agent.id} data={data} />;
                            }

                            const hasActiveSub = data.subscription && data.subscription.status === "active";

                            return (
                                <Card key={data.agent.id} className="border border-gray-100 rounded-[2rem] p-8 hover:shadow-2xl transition-all duration-500 bg-white group">
                                    <div className="flex items-center justify-between mb-8">
                                        <div className="flex items-center gap-4">
                                            <span className="text-4xl group-hover:scale-110 transition-transform duration-500">{data.agent.icon}</span>
                                            <div>
                                                <h3 className="font-black text-xl text-brand-heading">{data.agent.name}</h3>
                                                <Badge variant="default" className="text-[8px] font-black uppercase tracking-widest border-brand-primary/20 text-brand-primary bg-brand-primary/5">
                                                    {hasActiveSub ? "Active" : "Stable Release"}
                                                </Badge>
                                            </div>
                                        </div>
                                    </div>

                                    <p className="text-sm text-brand-body/70 font-medium leading-relaxed mb-8 h-20 line-clamp-3">
                                        {data.agent.description}
                                    </p>

                                    <div className="flex flex-wrap items-center gap-3 mb-10">
                                        <div className="rounded-2xl bg-gray-50 px-4 py-2 border border-gray-100">
                                            <p className="text-[10px] uppercase font-black text-brand-body/40 mb-0.5">Pro tier</p>
                                            <p className="text-sm font-black text-brand-heading">₹{data.agent.free_price_inr}</p>
                                        </div>
                                        <div className="rounded-2xl bg-brand-primary/5 px-4 py-2 border border-brand-primary/10">
                                            <p className="text-[10px] uppercase font-black text-brand-primary/60 mb-0.5">Max Tier</p>
                                            <p className="text-sm font-black text-brand-primary">₹{data.agent.pro_price_inr}</p>
                                        </div>
                                    </div>

                                    <div className="pt-8 border-t border-gray-50">
                                        {hasActiveSub ? (
                                            <Link href={`/agents/${data.agent.id}/dashboard`}>
                                                <Button className="w-full h-14 rounded-2xl font-black bg-brand-heading hover:bg-brand-primary transition-colors text-lg">
                                                    Open Workspace →
                                                </Button>
                                            </Link>
                                        ) : (
                                            <div className="flex flex-col gap-3">
                                                <Button
                                                    className="w-full h-14 rounded-2xl font-black shadow-xl shadow-brand-primary/20 text-lg"
                                                    onClick={() => void handleCheckout(data.agent.id, "pro")}
                                                >
                                                    Get started →
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    className="w-full h-10 font-bold text-brand-body/40 hover:text-brand-primary"
                                                    onClick={() => void handleCheckout(data.agent.id, "free")}
                                                >
                                                    Start with Pro tier
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </Card>
                            );
                        })}
                    </div>
                </section>
            </main>
        </div>
    );
}
