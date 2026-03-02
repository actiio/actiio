"use client";

import { useEffect, useMemo, useState } from "react";

import { apiFetch } from "@/lib/api";
import { DraftOption, LeadThread, ThreadDrafts } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

export function DraftApprovalModal({
  open,
  onClose,
  thread,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  thread: LeadThread | null;
  onSent: (threadId: string) => void;
}) {
  const { pushToast } = useToast();
  const [drafts, setDrafts] = useState<ThreadDrafts | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [editedDrafts, setEditedDrafts] = useState<Record<number, DraftOption>>({});
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) setUserEmail(user.email);
    }
    void init();
  }, []);

  useEffect(() => {
    async function loadDrafts() {
      if (!open || !thread) return;
      setLoading(true);
      setLoadError(null);
      setSelected(null);
      try {
        const data = await apiFetch<{ drafts: ThreadDrafts | null }>(`/api/drafts/${thread.id}`);
        setDrafts(data.drafts);
        if (data.drafts) {
          setEditedDrafts({
            1: data.drafts.draft_1,
            2: data.drafts.draft_2,
            3: data.drafts.draft_3,
          });
        }
      } catch (error) {
        setLoadError("Failed to load drafts");
        setDrafts(null);
        pushToast("Could not load drafts link.");
      } finally {
        setLoading(false);
      }
    }

    void loadDrafts();
  }, [open, thread, pushToast]);

  const list = useMemo(() => {
    if (!drafts) return [];
    return [
      { key: 1, label: "Soft", tone: "Soft", color: "blue", value: editedDrafts[1] || drafts.draft_1 },
      { key: 2, label: "Balanced", tone: "Balanced", color: "gray", value: editedDrafts[2] || drafts.draft_2 },
      { key: 3, label: "Direct", tone: "Direct", color: "green", value: editedDrafts[3] || drafts.draft_3 },
    ];
  }, [drafts, editedDrafts]);

  function updateDraft(index: number, patch: Partial<DraftOption>) {
    setEditedDrafts((prev) => ({
      ...prev,
      [index]: { ...prev[index], ...patch } as DraftOption,
    }));
  }

  async function sendSelected() {
    if (!thread || selected === null) return;
    const chosen = editedDrafts[selected];
    if (!chosen) return;

    setSending(true);
    try {
      const endpoint = thread.channel === "whatsapp" ? "/api/whatsapp/send" : "/api/gmail/send";
      const payload =
        thread.channel === "whatsapp"
          ? {
            thread_id: thread.id,
            message_body: chosen.message,
          }
          : {
            thread_id: thread.id,
            gmail_thread_id: thread.gmail_thread_id,
            last_gmail_message_id: thread.last_message?.gmail_message_id,
            contact_email: thread.contact_email,
            subject: chosen.subject || `Following up on ${thread.contact_name || "our conversation"}`,
            message_body: chosen.message,
          };

      await apiFetch(endpoint, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      pushToast("Follow-up sent successfully");
      onSent(thread.id);
      onClose();
    } catch (error) {
      pushToast("Failed to send follow-up.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose}>
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white/80 p-6 backdrop-blur-md">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-brand-heading">
            {thread?.contact_name || "Lead Preview"}
          </h2>
          <p className="mt-1 text-sm font-medium text-brand-body/60 italic line-clamp-1">
            Re: {thread?.last_message_preview}
          </p>
        </div>
        <button
          onClick={onClose}
          className="group rounded-full p-2.5 transition-colors hover:bg-gray-100"
        >
          <svg className="h-5 w-5 text-brand-body group-hover:text-brand-heading" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </header>

      <div className="p-8 space-y-10">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 animate-pulse">
            <div className="h-2 w-32 rounded-full bg-gray-100 mb-4" />
            <div className="h-10 w-64 rounded-2xl bg-gray-50 mb-8" />
            <div className="space-y-4 w-full max-w-md">
              <div className="h-24 w-full rounded-2xl bg-gray-50" />
              <div className="h-24 w-full rounded-2xl bg-gray-50" />
            </div>
          </div>
        ) : !drafts ? (
          <div className="py-20 text-center">
            <p className="text-brand-body/60 font-medium">No drafts available for this thread.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {list.map((item) => (
              <div
                key={item.key}
                onClick={() => setSelected(item.key)}
                className={cn(
                  "group relative cursor-pointer rounded-2xl border-2 p-6 transition-all duration-300",
                  selected === item.key
                    ? "border-brand-primary bg-brand-primary/[0.02] shadow-xl shadow-brand-primary/5"
                    : "border-gray-100 bg-white hover:border-brand-primary/20 hover:shadow-lg"
                )}
              >
                <div className="mb-6 flex items-center justify-between">
                  <Badge
                    variant={item.key === 1 ? "default" : item.key === 3 ? "active" : "pending"}
                    className="px-3 py-1 font-bold tracking-wider"
                  >
                    {item.label}
                  </Badge>

                  <div className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all duration-300",
                    selected === item.key ? "border-brand-primary bg-brand-primary" : "border-gray-200 group-hover:border-brand-primary/30"
                  )}>
                    {selected === item.key && (
                      <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>

                {thread?.channel === "gmail" && (
                  <div className="mb-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-brand-body/40 mb-1.5">Subject</p>
                    <Input
                      value={item.value.subject || ""}
                      onChange={(e) => updateDraft(item.key, { subject: e.target.value })}
                      onClick={(e) => e.stopPropagation()}
                      className="h-10 bg-transparent border-0 px-0 focus:ring-0 text-sm font-bold text-brand-heading"
                      placeholder="Lead follow-up"
                    />
                  </div>
                )}

                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-brand-body/40 mb-1.5">Message</p>
                  <Textarea
                    value={item.value.message}
                    onChange={(e) => updateDraft(item.key, { message: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                    className="min-h-[140px] border-gray-100 bg-white/50 focus:bg-white focus:ring-brand-primary text-brand-heading leading-relaxed"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <footer className="sticky bottom-0 z-10 border-t border-gray-100 bg-white p-6 pt-4">
        <div className="flex items-center justify-between gap-6">
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase tracking-widest text-brand-body/40">Sending via</span>
            <span className="text-sm font-bold text-brand-heading">{thread?.channel === 'gmail' ? 'Gmail' : 'WhatsApp'} · {userEmail}</span>
          </div>
          <Button
            size="lg"
            className="px-12 py-7 text-lg font-bold shadow-xl shadow-brand-primary/20"
            disabled={selected === null || sending}
            onClick={sendSelected}
          >
            {sending ? "Sending..." : "Send Now"}
          </Button>
        </div>
      </footer>
    </Dialog>
  );
}
