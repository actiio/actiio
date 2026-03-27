"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SalesAssetsUploader } from "@/components/sales-assets-uploader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { apiFetch, createPortalSession, getBusinessProfile, saveBusinessProfile, connectGmail, submitSupportRequest, syncGmail } from "@/lib/api";
import { getAgentMeta, isGmailAgent } from "@/lib/agents";
import { SalesAsset } from "@/lib/types";
import { cn } from "@/lib/utils";

interface FormState {
  business_name: string;
  industry: string;
  target_customer: string;
  core_offer: string;
  price_range: string;
  differentiator: string;
  email_footer: string;
}

const defaults: FormState = {
  business_name: "",
  industry: "",
  target_customer: "",
  core_offer: "",
  price_range: "",
  differentiator: "",
  email_footer: "",
};

const AUTOSAVE_DELAY_MS = 800;

interface SupportFormState {
  subject: string;
  message: string;
}

interface SupportFormErrors {
  subject?: string;
  message?: string;
}

function SettingsSkeleton() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(0,0,0,0.05),_transparent_28%),linear-gradient(180deg,_#fcfcfc_0%,_#f4f4f5_52%,_#ededee_100%)]">
      <main className="mx-auto max-w-4xl px-8 py-10">
        <header className="mb-10 flex items-center justify-between animate-pulse">
          <div>
            <div className="h-10 w-48 rounded bg-gray-200" />
            <div className="mt-3 h-4 w-64 rounded bg-gray-100" />
            <div className="mt-4 h-3 w-28 rounded bg-gray-100" />
          </div>
          <div className="h-12 w-32 rounded-full bg-gray-200" />
        </header>

        <div className="space-y-12 animate-pulse">
          <Card className="overflow-hidden rounded-[2rem] border-black/10 bg-white/90 shadow-xl shadow-black/5 backdrop-blur">
            <div className="border-b border-black/10 bg-gradient-to-r from-black/[0.05] via-white to-black/[0.02] px-8 py-5">
              <div className="h-3 w-28 rounded bg-gray-200" />
            </div>
            <div className="space-y-8 p-8">
              <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                <div className="space-y-3">
                  <div className="h-3 w-24 rounded bg-gray-100" />
                  <div className="h-14 rounded-2xl bg-gray-100" />
                </div>
                <div className="space-y-3">
                  <div className="h-3 w-20 rounded bg-gray-100" />
                  <div className="h-14 rounded-2xl bg-gray-100" />
                </div>
              </div>
              <div className="space-y-3">
                <div className="h-3 w-28 rounded bg-gray-100" />
                <div className="h-32 rounded-2xl bg-gray-100" />
              </div>
              <div className="space-y-3">
                <div className="h-3 w-24 rounded bg-gray-100" />
                <div className="h-36 rounded-2xl bg-gray-100" />
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden rounded-[2rem] border-black/10 bg-white/90 shadow-xl shadow-black/5 backdrop-blur">
            <div className="border-b border-black/10 bg-gradient-to-r from-black/[0.04] via-white to-black/[0.02] px-8 py-5">
              <div className="h-3 w-24 rounded bg-gray-200" />
            </div>
            <div className="p-8">
              <div className="h-32 rounded-[2rem] bg-gray-100" />
            </div>
          </Card>

          <Card className="overflow-hidden rounded-[2rem] border-black/10 bg-white/90 shadow-xl shadow-black/5 backdrop-blur">
            <div className="border-b border-black/10 bg-gradient-to-r from-black/[0.05] via-white to-black/[0.02] px-8 py-5">
              <div className="h-3 w-32 rounded bg-gray-200" />
            </div>
            <div className="p-8">
              <div className="flex items-center justify-between rounded-[2.5rem] border border-gray-100 bg-white p-10">
                <div className="flex items-center gap-6">
                  <div className="h-20 w-20 rounded-3xl bg-gray-100" />
                  <div className="space-y-3">
                    <div className="h-7 w-44 rounded bg-gray-200" />
                    <div className="h-3 w-28 rounded bg-gray-100" />
                  </div>
                </div>
                <div className="h-14 w-40 rounded-[1.5rem] bg-gray-200" />
              </div>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}

function canAutoSaveProfile(form: FormState): boolean {
  return Boolean(
    form.business_name.trim() &&
      form.industry.trim() &&
      form.target_customer.trim() &&
      form.core_offer.trim()
  );
}

export function SettingsClient({ agentId = "gmail_followup" }: { agentId?: string }) {
  const meta = getAgentMeta(agentId);
  const settingsHeaderTitle = isGmailAgent(agentId) ? "Settings" : meta.settingsTitle;
  const settingsHeaderSubtitle = isGmailAgent(agentId) ? "Business profile and inbox connection" : meta.settingsSubtitle;
  const [form, setForm] = useState<FormState>(defaults);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [salesAssets, setSalesAssets] = useState<SalesAsset[]>([]);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [supportForm, setSupportForm] = useState<SupportFormState>({ subject: "", message: "" });
  const [supportErrors, setSupportErrors] = useState<SupportFormErrors>({});
  const [submittingSupport, setSubmittingSupport] = useState(false);
  const { pushToast } = useToast();
  const hasLoadedProfileRef = useRef(false);
  const lastSavedPayloadRef = useRef<string | null>(null);

  const settingsPayload = useMemo(
    () => ({
      ...form,
      sales_assets: salesAssets,
    }),
    [form, salesAssets]
  );

  useEffect(() => {
    async function load() {
      setInitialLoading(true);
      let me: { id: string; email?: string } | null = null;
      try {
        me = await apiFetch<{ id: string; email?: string }>("/api/auth/me");
      } catch (err) {
        me = null;
      }
      try {
        if (!me) {
          return;
        }
        setCurrentUserId(me.id);

        let profile: {
          business_name?: string;
          industry?: string;
          target_customer?: string;
          core_offer?: string;
          price_range?: string;
          differentiator?: string;
          email_footer?: string;
          sales_assets?: SalesAsset[];
        } | null = null;
        try {
          profile = await getBusinessProfile(agentId);
        } catch (err) {
          profile = null;
        }

        if (profile) {
          setForm({
            business_name: profile.business_name || "",
            industry: profile.industry || "",
            target_customer: profile.target_customer || "",
            core_offer: profile.core_offer || "",
            price_range: profile.price_range || "",
            differentiator: profile.differentiator || "",
            email_footer: profile.email_footer || "",
          });
          setSalesAssets(Array.isArray(profile.sales_assets) ? profile.sales_assets : []);
          lastSavedPayloadRef.current = JSON.stringify({
            business_name: profile.business_name || "",
            industry: profile.industry || "",
            target_customer: profile.target_customer || "",
            core_offer: profile.core_offer || "",
            price_range: profile.price_range || "",
            differentiator: profile.differentiator || "",
            email_footer: profile.email_footer || "",
            sales_assets: Array.isArray(profile.sales_assets) ? profile.sales_assets : [],
          });
        }

        try {
          if (isGmailAgent(agentId)) {
            const gmail = await apiFetch<{ connected: boolean }>("/api/gmail/status?agent_id=" + agentId);
            setGmailConnected(gmail.connected);
          }
        } catch (err) { }

        hasLoadedProfileRef.current = true;
      } finally {
        setInitialLoading(false);
      }
    }
    void load();
  }, [agentId]);

  async function save(showToast = true) {
    setSaving(true);
    setSaveStatus("saving");
    try {
      await saveBusinessProfile(agentId, settingsPayload);
      lastSavedPayloadRef.current = JSON.stringify(settingsPayload);
      setSaveStatus("saved");
      if (showToast) {
        pushToast("Settings saved successfully.");
      }
    } catch (err) {
      setSaveStatus("error");
      if (showToast) {
        pushToast("Failed to save settings.");
      }
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!hasLoadedProfileRef.current) {
      return;
    }

    if (!canAutoSaveProfile(form)) {
      setSaveStatus("idle");
      return;
    }

    const payloadSnapshot = JSON.stringify(settingsPayload);
    if (payloadSnapshot === lastSavedPayloadRef.current) {
      return;
    }

    setSaveStatus("saving");
    const timeoutId = window.setTimeout(() => {
      void save(false);
    }, AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [form, settingsPayload]);

  async function handleGmailConnect() {
    try {
      const resp = await connectGmail(agentId);
      if (resp.auth_url) {
        window.location.href = resp.auth_url;
      }
    } catch (err) {
      pushToast("Gmail connection failed.");
    }
  }

  async function disconnectGmailAction() {
    await apiFetch("/api/gmail/disconnect", {
        method: "POST",
        body: JSON.stringify({ agent_id: agentId })
    });
    setGmailConnected(false);
  }

  async function handleManageBilling() {
    try {
      await createPortalSession();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not open billing portal.";
      pushToast(message, "error");
    }
  }

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

  if (initialLoading) {
    return <SettingsSkeleton />;
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(0,0,0,0.05),_transparent_28%),linear-gradient(180deg,_#fcfcfc_0%,_#f4f4f5_52%,_#ededee_100%)]">
      <main className="mx-auto max-w-4xl px-8 py-10">
        <header className="mb-10 flex items-center justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/80 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-brand-heading shadow-sm shadow-black/5 backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-black" />
              Workspace Setup
            </div>
            <h1 className="text-[clamp(1.8rem,3vw,2.35rem)] font-black tracking-tight text-brand-heading">{settingsHeaderTitle}</h1>
            <p className="mt-1 text-sm text-brand-heading/80">{settingsHeaderSubtitle}</p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-brand-heading/70">
              {saveStatus === "saving" ? "Saving changes..." : saveStatus === "saved" ? "All changes saved" : saveStatus === "error" ? "Auto-save failed" : "Auto-save on"}
            </p>
          </div>
          <Button
            onClick={() => void save(true)}
            disabled={saving}
            className="rounded-full px-8 font-black shadow-lg shadow-brand-primary/20"
          >
            {saving ? "Saving..." : saveStatus === "saved" ? "Saved" : "Save Now"}
          </Button>
        </header>

        <div className="space-y-12">
          {/* Business Context */}
          <Card className="overflow-hidden rounded-[2rem] border-black/10 bg-white/92 shadow-2xl shadow-black/5 backdrop-blur">
            <div className="border-b border-black/10 bg-gradient-to-r from-black/[0.05] via-white to-black/[0.02] px-8 py-5">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-brand-heading/75">Business Context</h3>
            </div>
            <div className="p-8 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-heading/75 px-1">Business Name</label>
                  <Input
                    placeholder="e.g. Acme Sales Co"
                    value={form.business_name}
                    onChange={(e) => setForm({ ...form, business_name: e.target.value })}
                    className="h-14 rounded-2xl border-black/10 bg-white shadow-sm shadow-black/5 focus-visible:ring-brand-primary"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-heading/75 px-1">Industry</label>
                  <Input
                    placeholder="e.g. SaaS, Real Estate"
                    value={form.industry}
                    onChange={(e) => setForm({ ...form, industry: e.target.value })}
                    className="h-14 rounded-2xl border-black/10 bg-white shadow-sm shadow-black/5 focus-visible:ring-brand-primary"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-heading/75 px-1">Description / Your core offer</label>
                <Textarea
                  placeholder="What exactly are you selling? Describe the value proposition."
                  value={form.core_offer}
                  onChange={(e) => setForm({ ...form, core_offer: e.target.value })}
                  className="min-h-[120px] rounded-2xl border-black/10 bg-white p-5 shadow-sm shadow-black/5 focus-visible:ring-brand-primary"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-heading/75 px-1">Email Footer</label>
                <Textarea
                  placeholder={"Best,\nJane Doe\nAcme Sales Co\n+91 98765 43210"}
                  value={form.email_footer}
                  onChange={(e) => setForm({ ...form, email_footer: e.target.value })}
                  className="min-h-[140px] rounded-2xl border-black/10 bg-white p-5 shadow-sm shadow-black/5 focus-visible:ring-brand-primary"
                />
                <p className="px-1 text-xs text-brand-heading/70">
                  This footer will be added to sent emails so your signature stays consistent.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-heading/75 px-1">Target Customer</label>
                  <Input
                    placeholder="e.g. Small business owners, Mid-market CTOs"
                    value={form.target_customer}
                    onChange={(e) => setForm({ ...form, target_customer: e.target.value })}
                    className="h-14 rounded-2xl border-black/10 bg-white shadow-sm shadow-black/5 focus-visible:ring-brand-primary"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-heading/75 px-1">Core Differentiators</label>
                  <Input
                    placeholder="What makes you special?"
                    value={form.differentiator}
                    onChange={(e) => setForm({ ...form, differentiator: e.target.value })}
                    className="h-14 rounded-2xl border-black/10 bg-white shadow-sm shadow-black/5 focus-visible:ring-brand-primary"
                  />
                </div>
              </div>

            </div>
          </Card>

          <Card className="overflow-hidden rounded-[2rem] border-black/10 bg-white/92 shadow-2xl shadow-black/5 backdrop-blur">
            <div className="border-b border-black/10 bg-gradient-to-r from-black/[0.04] via-white to-black/[0.02] px-8 py-5">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-brand-heading/75">Sales Assets</h3>
            </div>
            <div className="p-8">
              <SalesAssetsUploader userId={currentUserId} assets={salesAssets} onChange={setSalesAssets} />
            </div>
          </Card>

          {/* Integrations */}
          <Card className="overflow-hidden rounded-[2rem] border-black/10 bg-white/92 shadow-2xl shadow-black/5 backdrop-blur">
            <div className="border-b border-black/10 bg-gradient-to-r from-black/[0.05] via-white to-black/[0.02] px-8 py-5">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-brand-heading/75">Active Channel Links</h3>
            </div>
            <div className="p-8 space-y-8">
              {isGmailAgent(agentId) && (
                <div className={cn(
                  "group relative overflow-hidden rounded-[2.5rem] border p-10 transition-all",
                  gmailConnected ? "border-green-100 bg-gradient-to-br from-white via-emerald-50/50 to-black/[0.02] shadow-xl shadow-green-500/10" : "border-black/10 bg-gradient-to-br from-white via-black/[0.02] to-black/[0.04] shadow-xl shadow-black/5"
                )}>
                  <div className="flex items-center justify-between relative z-10">
                    <div className="flex items-center gap-6">
                      <div className={cn(
                        "flex h-20 w-20 items-center justify-center rounded-3xl text-3xl transition-all duration-700",
                        gmailConnected ? "bg-green-50 scale-110 shadow-xl" : "border border-black/10 bg-white shadow-sm shadow-black/5"
                      )}>
                        📧
                      </div>
                      <div>
                        <h4 className="font-black text-2xl text-brand-heading tracking-tight">Gmail Integration</h4>
                        <p className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-brand-heading/70">
                          {gmailConnected ? "Direct Sync Active" : "Channel Disconnected"}
                        </p>
                      </div>
                    </div>
                    {gmailConnected ? (
                      <div className="flex gap-4">
                        <Button
                          variant="ghost"
                          className="rounded-xl font-bold text-brand-heading/70 transition-colors hover:text-brand-primary"
                          onClick={() => void syncGmail(agentId).then(() => pushToast("Manual sync triggered."))}
                        >
                          Force Sync
                        </Button>
                        <Button variant="outline" className="h-12 rounded-[1.25rem] border-red-100 text-red-600 font-black px-6 hover:bg-red-50" onClick={disconnectGmailAction}>
                          Disconnect
                        </Button>
                      </div>
                    ) : (
                      <Button onClick={handleGmailConnect} className="h-14 rounded-[1.5rem] font-black px-10 shadow-2xl shadow-brand-primary/20 text-lg">
                        Connect Gmail
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Card className="overflow-hidden rounded-[2rem] border-black/10 bg-white/92 shadow-2xl shadow-black/5 backdrop-blur">
            <div className="border-b border-black/10 bg-gradient-to-r from-black/[0.05] via-white to-black/[0.02] px-8 py-5">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-brand-heading/75">Subscription</h3>
            </div>
            <div className="flex flex-col gap-5 p-8 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xl font-black text-brand-heading">{meta.name}</p>
                <p className="mt-1 text-sm font-medium text-brand-heading/75">
                  Billing and access are managed separately for this agent.
                </p>
              </div>
              <Button variant="outline" className="rounded-full px-6 font-black" onClick={() => void handleManageBilling()}>
                Manage Billing
              </Button>
            </div>
          </Card>

          <Card className="overflow-hidden rounded-[2rem] border-black/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.95)_0%,rgba(245,245,245,0.92)_100%)] shadow-2xl shadow-black/5 backdrop-blur">
            <div className="border-b border-black/10 bg-gradient-to-r from-black/[0.06] via-white to-black/[0.02] px-8 py-5">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-brand-heading/75">Support</h3>
            </div>
            <div className="space-y-6 p-8">
              <div className="rounded-[1.75rem] border border-black/10 bg-white/80 p-6 shadow-sm shadow-black/5">
                <p className="text-xl font-black text-brand-heading">Need help or want to report an issue?</p>
                <p className="mt-1 text-sm font-medium text-brand-heading/75">
                  Send us the problem you are seeing, what you expected, and any relevant context. We will store this as a support ticket.
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-heading/75 px-1">Subject</label>
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
                    "h-14 rounded-2xl bg-white shadow-sm shadow-black/5 focus-visible:ring-brand-primary",
                    supportErrors.subject ? "border-red-300 focus-visible:ring-red-500" : "border-black/10"
                  )}
                />
                {supportErrors.subject ? (
                  <p className="px-1 text-xs text-red-600">{supportErrors.subject}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-heading/75 px-1">Message</label>
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
                    "min-h-[180px] rounded-2xl bg-white p-5 shadow-sm shadow-black/5 focus-visible:ring-brand-primary",
                    supportErrors.message ? "border-red-300 focus-visible:ring-red-500" : "border-black/10"
                  )}
                />
                {supportErrors.message ? (
                  <p className="px-1 text-xs text-red-600">{supportErrors.message}</p>
                ) : (
                  <p className="px-1 text-xs text-brand-heading/70">
                    {/* Please include at least a short description so we can reproduce the issue. */}
                  </p>
                )}
              </div>
              <div className="flex items-center justify-between gap-4 rounded-[1.5rem] border border-black/10 bg-white/70 px-5 py-4 shadow-sm shadow-black/5">
                <p className="text-xs text-brand-heading/75">
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
        </div>
      </main>

    </div>
  );
}
