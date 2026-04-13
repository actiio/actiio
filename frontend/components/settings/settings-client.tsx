"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SalesAssetsUploader } from "@/components/sales-assets-uploader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { apiFetch, getBusinessProfile, saveBusinessProfile, connectGmail, submitSupportRequest, syncGmail } from "@/lib/api";
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
const FIELD_LIMITS = {
  business_name: 150,
  industry: 100,
  core_offer: 3000,
  target_customer: 2000,
  differentiator: 3000,
  email_footer: 2000,
} as const;

interface SupportFormState {
  subject: string;
  message: string;
}

interface SupportFormErrors {
  subject?: string;
  message?: string;
}

function getProfileValidationMessage(form: FormState): string | null {
  if (!form.business_name.trim()) return "Business name is required.";
  if (!form.industry.trim()) return "Industry is required.";
  if (!form.target_customer.trim()) return "Target customer is required.";
  if (!form.core_offer.trim()) return "Core offer is required.";
  return null;
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

export function SettingsClient({
  agentId = "gmail_followup",
  mode = "settings",
}: {
  agentId?: string;
  mode?: "settings" | "onboarding";
}) {
  const meta = getAgentMeta(agentId);
  const searchParams = useSearchParams();
  const isOnboarding = mode === "onboarding";
  const settingsHeaderTitle = isOnboarding
    ? `Set Up ${meta.shortName}`
    : isGmailAgent(agentId)
      ? "Settings"
      : meta.settingsTitle;
  const settingsHeaderSubtitle = isOnboarding
    ? "Complete your business profile and connect Gmail to start using the workspace."
    : isGmailAgent(agentId)
      ? "Business profile and inbox connection"
      : meta.settingsSubtitle;
  const [form, setForm] = useState<FormState>(defaults);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [salesAssets, setSalesAssets] = useState<SalesAsset[]>([]);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailSyncing, setGmailSyncing] = useState(false);
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

  useEffect(() => {
    const gmailConnectedParam = searchParams.get("gmail_connected");
    const gmailError = searchParams.get("gmail_error");

    if (!gmailConnectedParam && !gmailError) {
      return;
    }

    if (gmailConnectedParam === "1") {
      setGmailConnected(true);
      pushToast("Gmail connected successfully.");
    } else if (gmailError === "cancelled") {
      pushToast("Gmail connection was cancelled.", "error");
    } else if (gmailError === "missing_scopes") {
      pushToast("Please allow both Gmail permissions to connect your account.", "error");
    } else if (gmailError === "missing_code") {
      pushToast("Gmail connection could not be completed. Please try again.", "error");
    } else if (gmailError === "callback_failed") {
      pushToast("Failed to connect Gmail account. Please try again.", "error");
    }

    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("gmail_connected");
    cleanUrl.searchParams.delete("gmail_error");
    window.history.replaceState({}, "", cleanUrl.toString());
  }, [pushToast, searchParams]);

  async function save(showToast = true) {
    const validationMessage = getProfileValidationMessage(form);
    if (validationMessage) {
      setSaveStatus("error");
      if (showToast) {
        pushToast(validationMessage, "error");
      }
      return;
    }

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
        const message = err instanceof Error ? err.message : "Failed to save settings.";
        pushToast(message, "error");
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

  async function handleGmailSync() {
    if (gmailSyncing) {
      return;
    }

    setGmailSyncing(true);
    try {
      await syncGmail(agentId);
      pushToast("Gmail sync complete.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gmail sync failed.";
      pushToast(message, "error");
    } finally {
      setGmailSyncing(false);
    }
  }

  function handleCancelSubscription() {
    // Subscription management is handled via the Agents Hub
    window.location.href = "/agents";
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

  const profileReady = canAutoSaveProfile(form);
  const setupComplete = !isGmailAgent(agentId) ? profileReady : profileReady && gmailConnected;

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
        <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-center sm:justify-between lg:mb-10">
          <div>
            {isOnboarding ? (
              <div className="inline-flex items-center gap-2 rounded-full bg-brand-primary/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-brand-primary">
                <span className={cn("h-2 w-2 rounded-full", setupComplete ? "bg-brand-primary" : "bg-amber-500")} />
                {setupComplete ? "Setup Complete" : "Complete Setup"}
              </div>
            ) : null}
            <h1 className="text-[clamp(1.8rem,3vw,2.35rem)] font-black tracking-tight text-brand-heading">{settingsHeaderTitle}</h1>
            <p className="mt-1 text-sm text-brand-body/75">{settingsHeaderSubtitle}</p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-brand-body/60">
              {saveStatus === "saving" ? "Saving changes..." : saveStatus === "saved" ? "All changes saved" : saveStatus === "error" ? "Auto-save failed" : "Auto-save on"}
            </p>
          </div>
          {isOnboarding && setupComplete ? (
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                className="rounded-full px-6 font-black"
                onClick={() => {
                  window.location.href = `/agents/${agentId}/dashboard`;
                }}
              >
                Open Workspace
              </Button>
            </div>
          ) : null}
        </header>

        {isOnboarding ? (
          <Card className="mb-6 rounded-3xl border border-gray-100 bg-white p-4 shadow-sm sm:mb-8 sm:p-6">
            <div className="grid gap-3 md:grid-cols-3">
              {[
                { label: "Business profile", done: profileReady },
                { label: "Connect Gmail", done: !isGmailAgent(agentId) || gmailConnected },
                { label: "Go live", done: setupComplete },
              ].map((item, index) => (
                <div key={item.label} className="rounded-2xl bg-gray-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-brand-body/60">Step {index + 1}</p>
                  <p className="mt-2 text-sm font-black text-brand-heading">{item.label}</p>
                  <p className={cn("mt-2 text-xs font-semibold", item.done ? "text-brand-primary" : "text-brand-body/70")}>
                    {item.done ? "Ready" : "Pending"}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        <div className="space-y-6 sm:space-y-8 lg:space-y-12">
          {/* Business Context */}
          <Card className="overflow-hidden rounded-[1.5rem] border-gray-100 bg-white shadow-xl shadow-gray-200/50 sm:rounded-[2rem]">
            <div className="border-b border-gray-50 bg-gray-50/50 px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-brand-body/75">
                {isOnboarding ? "Step 1 · Business Context" : "Business Context"}
              </h3>
            </div>
            <div className="space-y-6 p-4 sm:space-y-8 sm:p-6 lg:p-8">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-body/75 px-1">Business Name</label>
                  <Input
                    placeholder="e.g. Acme Sales Co"
                    value={form.business_name}
                    onChange={(e) => setForm({ ...form, business_name: e.target.value })}
                    maxLength={FIELD_LIMITS.business_name}
                    className="h-14 rounded-2xl border-gray-100 bg-gray-50/30 text-brand-heading placeholder:text-brand-body/45 focus-visible:ring-brand-primary"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-body/75 px-1">Industry</label>
                  <Input
                    placeholder="e.g. SaaS, Real Estate"
                    value={form.industry}
                    onChange={(e) => setForm({ ...form, industry: e.target.value })}
                    maxLength={FIELD_LIMITS.industry}
                    className="h-14 rounded-2xl border-gray-100 bg-gray-50/30 text-brand-heading placeholder:text-brand-body/45 focus-visible:ring-brand-primary"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-body/75 px-1">Description / Your core offer</label>
                <Textarea
                  placeholder="What exactly are you selling? Describe the value proposition."
                  value={form.core_offer}
                  onChange={(e) => setForm({ ...form, core_offer: e.target.value })}
                  maxLength={FIELD_LIMITS.core_offer}
                  className="rounded-2xl min-h-[120px] border-gray-100 bg-gray-50/30 p-5 text-brand-heading placeholder:text-brand-body/45 focus-visible:ring-brand-primary"
                />
                <p className="px-1 text-xs text-brand-body/60">
                  {form.core_offer.length}/{FIELD_LIMITS.core_offer}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-6 lg:gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-body/75 px-1">Target Customer</label>
                  <Textarea
                    placeholder="Describe the kinds of buyers you sell to, their company stage, roles, needs, and the situations where they usually come looking for you."
                    value={form.target_customer}
                    onChange={(e) => setForm({ ...form, target_customer: e.target.value })}
                    maxLength={FIELD_LIMITS.target_customer}
                    className="min-h-[120px] rounded-2xl border-gray-100 bg-gray-50/30 p-5 text-brand-heading placeholder:text-brand-body/45 focus-visible:ring-brand-primary"
                  />
                  <p className="px-1 text-xs text-brand-body/60">
                    {form.target_customer.length}/{FIELD_LIMITS.target_customer}
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-body/75 px-1">Core Differentiators</label>
                  <Textarea
                    placeholder="Explain what makes your offering stand out. Include strengths like speed, expertise, pricing model, process, support, or outcomes clients choose you for."
                    value={form.differentiator}
                    onChange={(e) => setForm({ ...form, differentiator: e.target.value })}
                    maxLength={FIELD_LIMITS.differentiator}
                    className="min-h-[120px] rounded-2xl border-gray-100 bg-gray-50/30 p-5 text-brand-heading placeholder:text-brand-body/45 focus-visible:ring-brand-primary"
                  />
                  <p className="px-1 text-xs text-brand-body/60">
                    {form.differentiator.length}/{FIELD_LIMITS.differentiator}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-body/75 px-1">Email Footer</label>
                <Textarea
                  placeholder={"Best,\nJane Doe\nAcme Sales Co\n+91 98765 43210"}
                  value={form.email_footer}
                  onChange={(e) => setForm({ ...form, email_footer: e.target.value })}
                  maxLength={FIELD_LIMITS.email_footer}
                  className="rounded-2xl min-h-[140px] border-gray-100 bg-gray-50/30 p-5 text-brand-heading placeholder:text-brand-body/45 focus-visible:ring-brand-primary"
                />
                <p className="px-1 text-xs text-brand-body/75">
                  This footer will be added to sent emails so your signature stays consistent. {form.email_footer.length}/{FIELD_LIMITS.email_footer}
                </p>
              </div>

            </div>
          </Card>

          <Card className="overflow-hidden rounded-[1.5rem] border-gray-100 bg-white shadow-xl shadow-gray-200/50 sm:rounded-[2rem]">
            <div className="border-b border-gray-50 bg-gray-50/50 px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-brand-body/60">Sales Assets</h3>
            </div>
            <div className="p-4 sm:p-6 lg:p-8">
              <SalesAssetsUploader userId={currentUserId} assets={salesAssets} onChange={setSalesAssets} />
            </div>
          </Card>

          {/* Integrations */}
          <Card className="overflow-hidden rounded-[1.5rem] border-gray-100 bg-white shadow-xl shadow-gray-200/50 sm:rounded-[2rem]">
            <div className="border-b border-gray-50 bg-gray-50/50 px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-brand-body/60">
                {isOnboarding ? "Step 2 · Active Channel Links" : "Active Channel Links"}
              </h3>
            </div>
            <div className="space-y-6 p-4 sm:space-y-8 sm:p-6 lg:p-8">
              {isGmailAgent(agentId) && (
                <div className={cn(
                  "group relative overflow-hidden rounded-[1.75rem] border p-5 transition-all sm:rounded-[2rem] sm:p-6 lg:rounded-[2.5rem] lg:p-10",
                  gmailConnected ? "bg-white border-green-100 shadow-xl shadow-green-500/5" : "bg-gray-50/50 border-gray-100"
                )}>
                  <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-4 sm:items-center sm:gap-6">
                      <div className={cn(
                        "flex h-14 w-14 items-center justify-center rounded-2xl text-2xl transition-all duration-700 sm:h-16 sm:w-16 sm:text-3xl lg:h-20 lg:w-20 lg:rounded-3xl",
                        gmailConnected ? "bg-green-50 scale-110 shadow-xl" : "bg-white border border-gray-100"
                      )}>
                        📧
                      </div>
                      <div>
                        <h4 className="text-xl font-black tracking-tight text-brand-heading sm:text-2xl">Gmail Integration</h4>
                        <p className="text-[10px] font-black text-brand-body/60 uppercase tracking-[0.2em] mt-2">
                          {gmailConnected ? "Direct Sync Active" : "Channel Disconnected"}
                        </p>
                      </div>
                    </div>
                    {gmailConnected ? (
                      <div className="flex flex-col items-stretch gap-3 sm:items-start">
                        <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
                          <Button
                            variant="ghost"
                            className="rounded-xl font-bold text-brand-body/70 transition-colors hover:text-brand-primary"
                            onClick={() => void handleGmailSync()}
                            disabled={gmailSyncing}
                          >
                            {gmailSyncing ? "Syncing..." : "Force Sync"}
                          </Button>
                          <Button
                            variant="outline"
                            className="h-12 rounded-[1.25rem] border-red-100 px-6 font-black text-red-600 hover:bg-red-50"
                            onClick={disconnectGmailAction}
                            disabled={gmailSyncing}
                          >
                            Disconnect
                          </Button>
                        </div>
                        {gmailSyncing ? (
                          <p className="max-w-md rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                            Gmail sync is running. Keep this page open and do not refresh until it finishes.
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <Button onClick={handleGmailConnect} className="h-12 rounded-[1.25rem] px-6 text-base font-black shadow-2xl shadow-brand-primary/20 sm:h-14 sm:rounded-[1.5rem] sm:px-10 sm:text-lg">
                        Connect Gmail
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </Card>

          {!isOnboarding ? (
            <Card className="overflow-hidden rounded-[1.5rem] border-gray-100 bg-white shadow-xl shadow-gray-200/50 sm:rounded-[2rem]">
              <div className="border-b border-gray-50 bg-gray-50/50 px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-brand-body/60">Subscription</h3>
              </div>
              <div className="flex flex-col gap-4 p-4 sm:gap-5 sm:p-6 md:flex-row md:items-center md:justify-between lg:p-8">
                <div>
                  <p className="text-xl font-black text-brand-heading">{meta.name}</p>
                  <p className="mt-1 text-sm font-medium text-brand-body/75">
                    Billing and access are managed separately for this agent.
                  </p>
                </div>
                <Button variant="outline" className="rounded-full px-6 font-black" onClick={() => void handleCancelSubscription()}>
                  Cancel Subscription
                </Button>
              </div>
            </Card>
          ) : null}

          {!isOnboarding ? (
            <Card className="overflow-hidden rounded-[1.5rem] border-gray-100 bg-white shadow-xl shadow-gray-200/50 sm:rounded-[2rem]">
              <div className="border-b border-gray-50 bg-gray-50/50 px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-brand-body/60">Support</h3>
              </div>
              <div className="space-y-5 p-4 sm:space-y-6 sm:p-6 lg:p-8">
                <div>
                  <p className="text-xl font-black text-brand-heading">Need help or want to report an issue?</p>
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
          ) : null}
        </div>
      </main>

    </div>
  );
}
