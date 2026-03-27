"use client";

import Link from "next/link";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { createCheckoutSession, createPortalSession } from "@/lib/api";
import { AgentWithSubscription } from "@/lib/types";

function formatDate(dateStr: string | null) {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

function statusBadgeVariant(status: string): "active" | "pending" | "closed" {
    switch (status) {
        case "active":
            return "active";
        case "past_due":
            return "pending";
        default:
            return "closed";
    }
}

function statusLabel(status: string): string {
    switch (status) {
        case "active":
            return "Active";
        case "past_due":
            return "Past Due";
        case "canceled":
            return "Canceled";
        default:
            return status;
    }
}

export function AgentSubscriptionCard({ data }: { data: AgentWithSubscription }) {
    const { agent, subscription } = data;
    const { pushToast } = useToast();
    const [upgrading, setUpgrading] = useState(false);

    if (!subscription || subscription.status === "inactive") return null;

    const isFreePlan = subscription.plan === "free";
    const needsSetup = !data.setup_complete;
    const renewDate = formatDate(subscription.current_period_end);

    async function handleUpgrade() {
        setUpgrading(true);
        try {
            await createCheckoutSession(agent.id, "pro");
        } catch (error) {
            const message = error instanceof Error ? error.message : "Could not start checkout.";
            pushToast(message, "error");
        } finally {
            setUpgrading(false);
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
        <Card className="border border-gray-100 rounded-xl p-6 hover:shadow-md transition-all duration-200">
            {/* Top row */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <span className="text-2xl">{agent.icon}</span>
                    <h3 className="font-bold text-lg text-brand-heading">{agent.name}</h3>
                </div>
                <Badge
                    variant={statusBadgeVariant(subscription.status)}
                    className="text-[10px] font-black uppercase tracking-widest"
                >
                    {statusLabel(subscription.status)}
                </Badge>
            </div>

            {/* Middle */}
            <p className="text-sm text-brand-body/70 leading-relaxed mb-4">{agent.description}</p>

            <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="inline-flex items-center rounded-full bg-brand-primary/10 px-3 py-1 text-xs font-bold text-brand-primary">
                    {isFreePlan ? `₹${agent.free_price_inr}/month` : `Pro Plan ₹${agent.pro_price_inr}/month`}
                </span>
            </div>

            {renewDate && (
                <p className="text-xs text-brand-body/50 font-medium mb-4">
                    Renews on {renewDate}
                </p>
            )}

            {/* Bottom row */}
            <div className="flex flex-col gap-3 border-t border-gray-50 pt-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                    {subscription.status === "active" && (
                        <Link href={needsSetup ? `/agents/${agent.id}/onboarding` : `/agents/${agent.id}/dashboard`}>
                            <Button size="sm" className="rounded-full font-bold text-xs px-5">
                                {needsSetup ? "Complete setup" : "Open workspace"}
                            </Button>
                        </Link>
                    )}
                    {isFreePlan && subscription.status === "active" && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="rounded-full border-brand-primary text-brand-primary hover:bg-brand-primary/10 font-bold text-xs"
                            onClick={handleUpgrade}
                            disabled={upgrading}
                        >
                            {upgrading ? "Redirecting..." : "Upgrade to Max Tier"}
                        </Button>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full border-gray-200 text-brand-body/70 hover:bg-gray-50 font-bold text-xs"
                        onClick={() => void handleManageBilling()}
                    >
                        Manage Billing
                    </Button>
                    <button
                        type="button"
                        className="inline-flex h-9 items-center rounded-full px-3 text-xs font-bold text-red-500 transition-colors hover:bg-red-50 hover:text-red-700"
                        onClick={() => void handleManageBilling()}
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </Card>
    );
}
