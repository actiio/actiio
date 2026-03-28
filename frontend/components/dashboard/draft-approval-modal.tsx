"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

import { apiFetch, getBusinessProfile, getDrafts, sendGmail } from "@/lib/api";
import { ATTACHMENT_ACCEPT, isAllowedAttachmentFile, MAX_ATTACHMENT_BYTES } from "@/lib/attachments";
import { DraftOption, LeadThread, SalesAsset, ThreadDrafts } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { sanitizeMultilineText, sanitizeText } from "@/lib/sanitize";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function DraftApprovalModal({
  open,
  onClose,
  thread,
  agentId,
  initialDrafts,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  thread: LeadThread | null;
  agentId: string;
  initialDrafts?: ThreadDrafts | null;
  onSent: (threadId: string) => void | Promise<void>;
}) {
  const MAX_CUSTOM_ATTACHMENTS = 3;
  const { pushToast } = useToast();
  const [drafts, setDrafts] = useState<ThreadDrafts | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [editedDrafts, setEditedDrafts] = useState<Record<number, DraftOption>>({});
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [gmailSenderEmail, setGmailSenderEmail] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [salesAssets, setSalesAssets] = useState<SalesAsset[]>([]);
  const [emailFooter, setEmailFooter] = useState("");
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [customAttachments, setCustomAttachments] = useState<File[]>([]);
  const textareaRefs = useRef<Record<number, HTMLTextAreaElement | null>>({});

  function resizeTextarea(element: HTMLTextAreaElement | null) {
    if (!element) return;
    element.style.height = "0px";
    element.style.height = `${Math.max(element.scrollHeight, 220)}px`;
  }

  useEffect(() => {
    async function init() {
      let me: { id: string; email?: string } | null = null;
      try {
        me = await apiFetch<{ id: string; email?: string }>("/api/auth/me");
      } catch (err) {
        me = null;
      }
      if (!me) return;
      if (me.email) setUserEmail(me.email);

      try {
        const profile = await getBusinessProfile(agentId);
        setSalesAssets(Array.isArray(profile?.sales_assets) ? profile.sales_assets : []);
        setEmailFooter(typeof profile?.email_footer === "string" ? profile.email_footer.trim() : "");
      } catch (err) {
        setSalesAssets([]);
        setEmailFooter("");
      }

      try {
        const gmailStatus = await apiFetch<{ connected: boolean; email?: string }>(
          `/api/gmail/status?agent_id=${encodeURIComponent(agentId)}`
        );
        if (gmailStatus.connected && gmailStatus.email) {
          setGmailSenderEmail(gmailStatus.email);
        }
      } catch (err) {
        setGmailSenderEmail("");
      }
    }
    void init();
  }, [agentId]);

  useEffect(() => {
    if (!open) return;
    setSelectedAssetIds([]);
    setCustomAttachments([]);
    setEmailSubject("");
  }, [open, thread?.id]);

  function toggleAssetSelection(assetId: string) {
    setSelectedAssetIds((prev) => (prev.includes(assetId) ? prev.filter((id) => id !== assetId) : [...prev, assetId]));
  }

  function onCustomFilesSelected(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    const oversized = files.find((file) => file.size > MAX_ATTACHMENT_BYTES);
    if (oversized) {
      pushToast(`"${oversized.name}" exceeds the 15 MB limit.`);
      event.target.value = "";
      return;
    }

    const unsupported = files.find((file) => !isAllowedAttachmentFile(file));
    if (unsupported) {
      pushToast(`"${unsupported.name}" is not a supported attachment type.`);
      event.target.value = "";
      return;
    }

    setCustomAttachments((prev) => {
      const merged = [...prev, ...files];
      if (merged.length > MAX_CUSTOM_ATTACHMENTS) {
        pushToast(`You can attach up to ${MAX_CUSTOM_ATTACHMENTS} custom files.`);
      }
      return merged.slice(0, MAX_CUSTOM_ATTACHMENTS);
    });
    event.target.value = "";
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== "string") {
          reject(new Error("Failed to read file"));
          return;
        }
        const commaIndex = result.indexOf(",");
        resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
      };
      reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  }

  useEffect(() => {
    async function loadDrafts() {
      if (!open || !thread) return;
      setLoading(true);
      setLoadError(null);
      setSelected(null);
      try {
        let resolvedDrafts: ThreadDrafts | null = initialDrafts || null;
        if (!resolvedDrafts) {
          for (let attempt = 0; attempt < 5; attempt += 1) {
            const data = await getDrafts(agentId, thread.id);
            if (data.drafts) {
              resolvedDrafts = data.drafts;
              break;
            }
            await sleep(400);
          }
        }

        setDrafts(resolvedDrafts);
        const originalSubject = sanitizeText(thread.subject || thread.last_message?.subject || "");
        setEmailSubject(originalSubject);
        if (resolvedDrafts) {
          const initialEdits: Record<number, DraftOption> = {};
          if (resolvedDrafts.draft_1) {
            initialEdits[1] = { ...resolvedDrafts.draft_1, subject: originalSubject };
          }
          if (resolvedDrafts.draft_2) {
            initialEdits[2] = { ...resolvedDrafts.draft_2, subject: originalSubject };
          }
          if (resolvedDrafts.draft_3) {
            initialEdits[3] = { ...resolvedDrafts.draft_3, subject: originalSubject };
          }
          setEditedDrafts(initialEdits);
          setSelected(resolvedDrafts.draft_3 ? 3 : resolvedDrafts.draft_2 ? 2 : resolvedDrafts.draft_1 ? 1 : null);
        } else {
          setLoadError("Drafts are still being finalized. Please try again in a moment.");
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
  }, [agentId, initialDrafts, open, thread, pushToast]);

  const list = useMemo(() => {
    if (!drafts) return [];
    return [
      drafts.draft_3 ? { key: 3, label: "Direct", tone: "Direct", color: "green", value: editedDrafts[3] || drafts.draft_3 } : null,
      drafts.draft_2 ? { key: 2, label: "Balanced", tone: "Balanced", color: "gray", value: editedDrafts[2] || drafts.draft_2 } : null,
      drafts.draft_1 ? { key: 1, label: "Soft", tone: "Soft", color: "blue", value: editedDrafts[1] || drafts.draft_1 } : null,
    ].filter(
      (
        item
      ): item is { key: number; label: string; tone: string; color: string; value: DraftOption } => Boolean(item)
    );
  }, [drafts, editedDrafts]);

  function updateDraft(index: number, patch: Partial<DraftOption>) {
    setEditedDrafts((prev) => ({
      ...prev,
      [index]: { ...prev[index], ...patch } as DraftOption,
    }));
  }

  useEffect(() => {
    Object.values(textareaRefs.current).forEach((element) => resizeTextarea(element));
  }, [editedDrafts, drafts, open, selected]);

  async function sendSelected() {
    if (!thread || selected === null) return;
    const chosen = editedDrafts[selected];
    if (!chosen) return;
    const selectedAssets = salesAssets.filter((asset) => selectedAssetIds.includes(asset.id));
    const safeMessageBody = sanitizeMultilineText(chosen.message || "");
    const safeSubject = sanitizeText(emailSubject || thread.subject || "Follow-up");

    setSending(true);
    try {
      const customAttachmentPayloads = await Promise.all(
        customAttachments.map(async (file) => ({
          attachment_name: file.name,
          attachment_content_base64: await fileToBase64(file),
          attachment_mime_type: file.type || undefined,
        }))
      );
      const savedAssetPayloads = selectedAssets.map((asset) => ({
        attachment_path: asset.path,
        attachment_name: asset.name,
      }));
      const payload =
        {
          thread_id: thread.id,
          gmail_thread_id: thread.gmail_thread_id,
          last_gmail_message_id: thread.last_message?.gmail_message_id,
          contact_email: thread.contact_email,
          subject: safeSubject,
          message_body: safeMessageBody,
          attachments: [...savedAssetPayloads, ...customAttachmentPayloads],
          selected_draft: {
            ...chosen,
            subject: safeSubject,
            message: safeMessageBody,
          },
        };

      await sendGmail(agentId, payload);
      pushToast("Follow-up sent successfully");
      await onSent(thread.id);
      onClose();
    } catch (error) {
      pushToast("Failed to send follow-up.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} contentClassName="max-w-5xl">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white/80 p-6 backdrop-blur-md">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight text-brand-heading">
              {thread?.contact_name || thread?.contact_email || "Lead Preview"}
            </h2>
            {thread?.channel && (
              <Badge
                className="border-sky-200 bg-sky-50 text-[10px] font-black uppercase tracking-wider text-sky-700"
              >
                Email
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm font-medium text-brand-body/60 italic line-clamp-1">
            Subject: {thread?.subject || "No subject"}
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
        <div className="rounded-2xl border border-gray-100 bg-white p-4">
          <p className="text-xs font-black uppercase tracking-widest text-brand-body/60">Email subject</p>
          <Input
            value={emailSubject}
            onChange={(e) => setEmailSubject(e.target.value)}
            className="mt-2 h-11 border-gray-200 bg-white text-sm font-semibold text-brand-heading"
            placeholder="Enter subject"
          />
        </div>

        <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4">
          <p className="text-xs font-black uppercase tracking-widest text-brand-heading">Attachment</p>
          <div className="mt-3 space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-brand-body/60">Choose from assets</label>
            <div className="space-y-2">
              {salesAssets.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => toggleAssetSelection(asset.id)}
                  className={cn(
                    "w-full rounded-xl border px-3 py-2 text-left text-sm font-semibold transition-colors",
                    selectedAssetIds.includes(asset.id)
                      ? "border-brand-primary bg-white text-brand-primary"
                      : "border-gray-200 bg-white text-brand-heading hover:border-brand-primary/40"
                  )}
                >
                  {asset.name}
                </button>
              ))}
              {salesAssets.length > 0 && selectedAssetIds.length === 0 && (
                <p className="text-xs font-medium text-brand-body/60">Choose a saved asset (optional).</p>
              )}
            </div>
            {salesAssets.length === 0 && (
              <p className="text-xs font-medium text-brand-body/60">
                No saved assets found in your business profile yet.
              </p>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-brand-heading hover:border-brand-primary/40">
              Add custom files
              <input
                type="file"
                className="hidden"
                multiple
                accept={ATTACHMENT_ACCEPT}
                onChange={onCustomFilesSelected}
              />
            </label>
          </div>
          <div className="mt-2 space-y-1">
            {customAttachments.length > 0 ? (
              customAttachments.map((file, index) => (
                <div key={`${file.name}-${index}`} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-xs">
                  <span className="font-medium text-brand-heading">{file.name}</span>
                  <button
                    type="button"
                    className="font-bold text-red-600 hover:text-red-700"
                    onClick={() =>
                      setCustomAttachments((prev) => prev.filter((_, fileIndex) => fileIndex !== index))
                    }
                  >
                    Remove
                  </button>
                </div>
              ))
            ) : (
              <p className="text-xs font-medium text-brand-body/60">
                Attach one-off files without saving them to your asset library.
              </p>
            )}
          </div>
          <p className="mt-1 text-xs font-medium text-brand-body/50">Max file size: 15 MB | Max custom files: 3</p>
        </div>

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

                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-brand-body/40 mb-1.5">Message</p>
                  <Textarea
                    value={item.value.message}
                    onChange={(e) => updateDraft(item.key, { message: e.target.value })}
                    ref={(element) => {
                      textareaRefs.current[item.key] = element;
                      resizeTextarea(element);
                    }}
                    onInput={(e) => resizeTextarea(e.currentTarget)}
                    onClick={(e) => e.stopPropagation()}
                    className="min-h-[220px] resize-none overflow-hidden border-gray-100 bg-white/50 p-5 focus:bg-white focus:ring-brand-primary text-brand-heading leading-7"
                  />
                  {emailFooter ? (
                    <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50/70 px-5 py-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-brand-body/55">Email Footer</p>
                      <p className="mt-3 whitespace-pre-line text-sm leading-6 text-brand-body/80">{emailFooter}</p>
                    </div>
                  ) : null}
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
            <span className="text-sm font-bold text-brand-heading">
              Gmail · {gmailSenderEmail || userEmail}
            </span>
          </div>
          <Button
            size="lg"
            className="px-12 py-7 text-lg font-bold shadow-xl shadow-brand-primary/20"
            disabled={selected === null || sending}
            onClick={sendSelected}
          >
            {sending ? "Sending..." : "Reply via Gmail"}
          </Button>
        </div>
      </footer>
    </Dialog>
  );
}
