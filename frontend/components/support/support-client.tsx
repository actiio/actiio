"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { submitSupportRequest } from "@/lib/api";
import { cn } from "@/lib/utils";

interface SupportFormState {
  subject: string;
  message: string;
}

interface SupportFormErrors {
  subject?: string;
  message?: string;
}

export function SupportClient({ agentId }: { agentId: string }) {
  const [supportForm, setSupportForm] = useState<SupportFormState>({ subject: "", message: "" });
  const [supportErrors, setSupportErrors] = useState<SupportFormErrors>({});
  const [submittingSupport, setSubmittingSupport] = useState(false);
  const { pushToast } = useToast();

  async function handleSupportSubmit() {
    const subject = supportForm.subject.trim();
    const message = supportForm.message.trim();
    const nextErrors: SupportFormErrors = {};
    
    if (!subject) {
      nextErrors.subject = "Please add a subject.";
    }
    if (!message) {
      nextErrors.message = "Please describe the issue.";
    } else if (message.length < 10) {
      nextErrors.message = "Please add a little more detail so we can help.";
    }

    if (nextErrors.subject || nextErrors.message) {
      setSupportErrors(nextErrors);
      return;
    }

    setSupportErrors({});
    setSubmittingSupport(true);
    try {
      await submitSupportRequest(agentId, subject, message);
      setSupportForm({ subject: "", message: "" });
      setSupportErrors({});
      pushToast("Support request submitted. We will get back to you soon.");
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Failed to submit support request.";
      pushToast(messageText, "error");
    } finally {
      setSubmittingSupport(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
        <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-center sm:justify-between lg:mb-10">
          <div>
            <h1 className="text-[clamp(1.8rem,3vw,2.35rem)] font-black tracking-tight text-brand-heading">Support</h1>
            <p className="mt-1 text-sm text-brand-body/75">Need help or want to report an issue?</p>
          </div>
        </header>

        <Card className="overflow-hidden rounded-[1.5rem] border-gray-100 bg-white shadow-xl shadow-gray-200/50 sm:rounded-[2rem]">
          <div className="border-b border-gray-50 bg-gray-50/50 px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-brand-body/60">Create Support Ticket</h3>
          </div>
          <div className="space-y-5 p-4 sm:space-y-6 sm:p-6 lg:p-8">
            <div>
              <p className="text-xl font-black text-brand-heading">How can we help?</p>
              <p className="mt-1 text-sm font-medium text-brand-body/75">
                Send us the problem you are seeing, what you expected, and any relevant context. We will store this as a support ticket.
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-body/60 px-1">Subject</label>
              <Input
                placeholder="e.g. Gmail sync is not finding new replies"
                value={supportForm.subject}
                onChange={(e) => {
                  const value = e.target.value;
                  setSupportForm((prev) => ({ ...prev, subject: value }));
                  setSupportErrors((prev) => ({
                    ...prev,
                    subject: value.trim() ? undefined : prev.subject,
                  }));
                }}
                className={cn(
                  "h-14 rounded-2xl bg-gray-50/30 focus-visible:ring-brand-primary",
                  supportErrors.subject ? "border-red-300 focus-visible:ring-red-500" : "border-gray-100"
                )}
              />
              {supportErrors.subject ? (
                <p className="px-1 text-xs text-red-600">{supportErrors.subject}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-body/60 px-1">Message</label>
              <Textarea
                placeholder="Tell us what happened, what you expected, and any steps to reproduce it."
                value={supportForm.message}
                onChange={(e) => {
                  const value = e.target.value;
                  setSupportForm((prev) => ({ ...prev, message: value }));
                  setSupportErrors((prev) => ({
                    ...prev,
                    message: value.trim().length >= 10 ? undefined : prev.message,
                  }));
                }}
                minLength={10}
                className={cn(
                  "rounded-2xl min-h-[180px] bg-gray-50/30 p-5 focus-visible:ring-brand-primary",
                  supportErrors.message ? "border-red-300 focus-visible:ring-red-500" : "border-gray-100"
                )}
              />
              {supportErrors.message ? (
                <p className="px-1 text-xs text-red-600">{supportErrors.message}</p>
              ) : (
                <p className="px-1 text-xs text-brand-body/70"></p>
              )}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <p className="text-xs text-brand-body/70">
                You can also reach out to support@actiio.co
              </p>
              <Button
                onClick={() => void handleSupportSubmit()}
                disabled={submittingSupport}
                className="rounded-full px-8 font-black shadow-lg shadow-brand-primary/20"
              >
                {submittingSupport ? "Submitting..." : "Submit Request"}
              </Button>
            </div>
          </div>
        </Card>
      </main>
    </div>
  );
}
