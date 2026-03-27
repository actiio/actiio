"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { joinWaitlist } from "@/lib/api";
import { AgentWithSubscription } from "@/lib/types";

export function AgentComingSoonCard({
    data,
    onWaitlistJoined,
}: {
    data: AgentWithSubscription;
    onWaitlistJoined?: (agentId: string) => void;
}) {
    const { agent, on_waitlist } = data;
    const [isOnWaitlist, setIsOnWaitlist] = useState(on_waitlist);
    const [joining, setJoining] = useState(false);

    async function handleJoinWaitlist() {
        setJoining(true);
        try {
            await joinWaitlist(agent.id);
            setIsOnWaitlist(true);
            onWaitlistJoined?.(agent.id);
        } catch {
            // silently fail – user might already be on waitlist
            setIsOnWaitlist(true);
        } finally {
            setJoining(false);
        }
    }

    return (
        <Card className="border border-gray-100 rounded-xl p-6 hover:shadow-md transition-all duration-200 opacity-90">
            {/* Top row */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <span className="text-2xl">{agent.icon}</span>
                    <h3 className="font-bold text-lg text-brand-heading">{agent.name}</h3>
                </div>
                <Badge
                    variant="default"
                    className="text-[10px] font-black uppercase tracking-widest bg-blue-50 text-blue-600 border-blue-100"
                >
                    Coming Soon
                </Badge>
            </div>

            {/* Middle */}
            <p className="text-sm text-brand-body/70 leading-relaxed mb-4">{agent.description}</p>

            <div className="flex flex-wrap items-center gap-2 mb-4">
                <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-brand-body/70">
                    From ₹{agent.free_price_inr}/month
                </span>
            </div>

            {/* Bottom */}
            <div className="pt-4 border-t border-gray-50">
                {isOnWaitlist ? (
                    <div className="flex items-center gap-2 text-sm font-bold text-brand-primary">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                        You&apos;re on the waitlist ✓
                    </div>
                ) : (
                    <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full border-brand-primary text-brand-primary hover:bg-brand-primary/10 font-bold text-xs"
                        onClick={handleJoinWaitlist}
                        disabled={joining}
                    >
                        {joining ? "Joining..." : "Notify me when available"}
                    </Button>
                )}
            </div>
        </Card>
    );
}
