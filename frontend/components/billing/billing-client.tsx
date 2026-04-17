"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { getSubscriptionStatus, renewSubscription } from "@/lib/api";
import { getAgentMeta } from "@/lib/agents";
import { SubscriptionStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Calendar, Zap, CreditCard } from "lucide-react";

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

function isCashfreeBillingEnabled(): boolean {
  return process.env.NEXT_PUBLIC_CASHFREE_BILLING_ENABLED === "true";
}

export function BillingClient({ agentId }: { agentId: string }) {
  const meta = getAgentMeta(agentId);
  const { pushToast } = useToast();

  const [subStatus, setSubStatus] = useState<SubscriptionStatus | null>(null);
  const [paymentLoading, setPaymentLoading] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const handledRef = useRef(false);

  // Derive safety flags
  const isRenewable = subStatus?.status === "expired" ||
    (subStatus?.days_remaining !== null && subStatus?.days_remaining !== undefined && subStatus.days_remaining <= 5);

  const isTooEarlyToRenew = subStatus?.status === "active" &&
    subStatus?.days_remaining !== null && subStatus?.days_remaining !== undefined && subStatus.days_remaining > 5;

  useEffect(() => {
    async function load() {
      try {
        const sub = await getSubscriptionStatus(agentId);
        setSubStatus(sub);
      } catch (err) {
        console.error("Failed to load subscription status", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [agentId]);

  // ------- payment flows -------
  async function openCashfreeCheckout(paymentSessionId: string): Promise<void> {
    if (!window.Cashfree) {
      throw new Error("Payment SDK not loaded. Please refresh and try again.");
    }
    // @ts-ignore
    const cashfree = window.Cashfree({ mode: getCashfreeMode() });
    const result = await cashfree.checkout({
      paymentSessionId,
      redirectTarget: "_self",
    });
    if (result?.error?.message) {
      throw new Error(result.error.message);
    }
  }


  async function handleRenew() {
    if (!isCashfreeBillingEnabled()) {
      pushToast("Renewals are temporarily unavailable. Please contact support to renew your plan.", "error");
      return;
    }

    setPaymentLoading("renew");
    try {
      const resp = await renewSubscription(agentId);
      if (!resp.payment_session_id) throw new Error("No payment session returned.");
      await openCashfreeCheckout(resp.payment_session_id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not process renewal.";
      pushToast(message, "error");
    } finally {
      setPaymentLoading(null);
    }
  }


  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-primary border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
          <header className="mb-8 space-y-1">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
                <CreditCard className="h-5 w-5" />
              </div>
              <h1 className="text-3xl font-black tracking-tight text-brand-heading">Billing</h1>
            </div>
            <p className="text-lg font-medium text-brand-body/60">Manage plans and renewals for {meta.name}</p>
          </header>

          <Card className="overflow-hidden rounded-3xl border-gray-100 bg-white shadow-xl shadow-gray-200/50 sm:rounded-[2.5rem]">
            <div className="border-b border-gray-50 bg-gray-50/50 px-5 py-4 sm:px-8 sm:py-5">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-brand-body/60">Active Membership</h3>
            </div>
            <div className="p-5 sm:p-8 lg:p-12">
              <div className="flex flex-col gap-6 sm:gap-10 lg:flex-row lg:items-center lg:justify-between">
                <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:flex-1">
                  <div className="space-y-3 sm:space-y-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-primary/10 text-brand-primary">
                      <Zap className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-brand-body/40">Status</p>
                      <div className="mt-1 flex items-center gap-2">
                        <h4 className="text-2xl font-black text-brand-heading">
                          {subStatus?.status === "active" ? "Active" : subStatus?.status === "expired" ? "Expired" : "Pending"}
                        </h4>
                        {subStatus?.status === "active" && (
                          <span className="flex h-2.5 w-2.5 rounded-full bg-[#00bf63] animate-pulse" />
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-50 text-brand-body/40">
                      <Calendar className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-brand-body/40">Renew Date</p>
                      <h4 className="mt-1 text-2xl font-black text-brand-heading">
                        {subStatus?.current_period_end ? formatExpiryDate(subStatus.current_period_end) : "No Cycle"}
                      </h4>
                      {subStatus?.status === "active" && subStatus.days_remaining !== null && (
                        <p className="mt-1 text-xs font-bold text-brand-primary">
                          {subStatus.days_remaining} days left
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="w-full lg:w-72">
                  <div className="space-y-4">
                    {!isCashfreeBillingEnabled() && (
                      <div className="rounded-2xl bg-gray-50 px-5 py-4 text-sm font-bold leading-relaxed text-gray-600">
                        Online billing is temporarily unavailable. Please contact support to activate or renew your plan.
                      </div>
                    )}

                    <Button
                      variant={isRenewable ? "default" : "secondary"}
                      className={cn(
                        "h-14 w-full rounded-2xl font-black transition-all",
                        isRenewable
                          ? "bg-brand-primary text-white shadow-lg shadow-brand-primary/20 hover:scale-[1.02] active:scale-[0.98]"
                          : "bg-gray-100 text-gray-800 cursor-not-allowed"
                      )}
                      onClick={() => {
                        if (isRenewable) void handleRenew();
                      }}
                      disabled={!!paymentLoading || !isRenewable || !isCashfreeBillingEnabled()}
                    >
                      {paymentLoading === "renew"
                        ? "Processing..."
                        : isTooEarlyToRenew
                          ? "Renew Available Soon"
                          : "Renew Now \u2014 \u20B9499"
                      }
                    </Button>
                  </div>
                </div>
              </div>

              <div className="mt-8 border-t border-gray-50 pt-8 sm:mt-12">
                <p className="text-center text-xs font-medium text-brand-body/40 leading-relaxed">
                  Transaction details are emailed to your registered address.<br />
                </p>
              </div>
            </div>
          </Card>
        </div>
      </main>


    </div>
  );
}
