"use client";

import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface CancelSubscriptionModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isCancelling: boolean;
}

export function CancelSubscriptionModal({
  open,
  onClose,
  onConfirm,
  isCancelling,
}: CancelSubscriptionModalProps) {
  return (
    <Dialog open={open} onClose={onClose} contentClassName="max-w-md">
      <div className="p-6 sm:p-8">
        <div className="flex flex-col items-center text-center">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-3xl bg-amber-50 text-amber-600">
            <AlertTriangle className="h-8 w-8" />
          </div>
          
          <h2 className="text-2xl font-black tracking-tight text-brand-heading">
            Cancel Subscription?
          </h2>
          
          <p className="mt-4 text-base leading-relaxed text-brand-body/70">
            Your agent will remain <span className="font-bold text-brand-heading">active until the end of your current period</span>. We will simply stop all future billing for this agent.
          </p>

          <div className="mt-10 flex w-full flex-col gap-3 sm:flex-row">
            <Button
              variant="outline"
              className="flex-1 rounded-2xl h-14 font-black transition-all active:scale-[0.98]"
              onClick={onClose}
              disabled={isCancelling}
            >
              Keep Subscription
            </Button>
            <Button
              className="flex-1 rounded-2xl h-14 bg-red-600 font-black text-white shadow-lg shadow-red-200 hover:bg-red-700 transition-all active:scale-[0.98]"
              onClick={onConfirm}
              disabled={isCancelling}
            >
              {isCancelling ? "Cancelling..." : "Yes, Cancel"}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
