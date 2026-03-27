"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { apiFetch, connectGmail, getBusinessProfile, saveBusinessProfile } from "@/lib/api";
import { getAgentMeta, isGmailAgent } from "@/lib/agents";

type FormState = {
  business_name: string;
  industry: string;
  target_customer: string;
  core_offer: string;
  price_range: string;
  differentiator: string;
};

const defaults: FormState = {
  business_name: "",
  industry: "",
  target_customer: "",
  core_offer: "",
  price_range: "",
  differentiator: "",
};

export function OnboardingFlow({ agentId }: { agentId: string }) {
  const meta = getAgentMeta(agentId);
  const { pushToast } = useToast();
  const [form, setForm] = useState<FormState>(defaults);
  const [saving, setSaving] = useState(false);
  const [gmailConnected, setGmailConnected] = useState(false);

  const channelReady = useMemo(() => isGmailAgent(agentId) && gmailConnected, [agentId, gmailConnected]);

  useEffect(() => {
    async function load() {
      try {
        const profile = await getBusinessProfile(agentId);
        setForm({
          business_name: profile.business_name || "",
          industry: profile.industry || "",
          target_customer: profile.target_customer || "",
          core_offer: profile.core_offer || "",
          price_range: profile.price_range || "",
          differentiator: profile.differentiator || "",
        });
      } catch {}

      try {
        if (isGmailAgent(agentId)) {
          const gmail = await apiFetch<{ connected: boolean }>(`/api/gmail/status?agent_id=${encodeURIComponent(agentId)}`);
          setGmailConnected(Boolean(gmail.connected));
        }
      } catch {}
    }

    void load();
  }, [agentId]);

  async function saveProfile() {
    setSaving(true);
    try {
      await saveBusinessProfile(agentId, form);
      pushToast("Business profile saved.");
    } catch {
      pushToast("Could not save business profile.");
    } finally {
      setSaving(false);
    }
  }

  async function connectChannel() {
    try {
      const response = await connectGmail(agentId);
      if (response.auth_url) {
        window.location.href = response.auth_url;
      }
    } catch {
      pushToast("Could not connect Gmail.");
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="space-y-3">
        <p className="text-[11px] font-black uppercase tracking-[0.25em] text-brand-primary">Onboarding</p>
        <h1 className="text-4xl font-black tracking-tight text-brand-heading">{meta.name}</h1>
        <p className="max-w-2xl text-sm font-medium text-brand-body/60">
          Set up your business context, connect Gmail, and start reviewing leads in your workspace.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { step: "1", label: "Business profile", done: Boolean(form.business_name && form.core_offer && form.target_customer) },
          { step: "2", label: "Connect Gmail", done: channelReady },
          { step: "3", label: "Go live", done: channelReady },
        ].map((item) => (
          <Card key={item.step} className="rounded-[1.75rem] border-gray-100 p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-brand-body/40">Step {item.step}</p>
            <p className="mt-2 text-lg font-black text-brand-heading">{item.label}</p>
            <p className="mt-2 text-sm font-semibold text-brand-body/55">{item.done ? "Ready" : "Pending"}</p>
          </Card>
        ))}
      </div>

      <Card className="rounded-[2rem] border-gray-100 p-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-black text-brand-heading">Step 1: Business profile</h2>
            <p className="mt-1 text-sm font-medium text-brand-body/55">This context powers every follow-up draft.</p>
          </div>
          <Button onClick={saveProfile} disabled={saving} className="rounded-full px-6 font-black">
            {saving ? "Saving..." : "Save profile"}
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Input placeholder="Business name" value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} className="h-12 rounded-2xl border-gray-100" />
          <Input placeholder="Industry" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} className="h-12 rounded-2xl border-gray-100" />
          <Input placeholder="Target customer" value={form.target_customer} onChange={(e) => setForm({ ...form, target_customer: e.target.value })} className="h-12 rounded-2xl border-gray-100" />
          <Input placeholder="Price range" value={form.price_range} onChange={(e) => setForm({ ...form, price_range: e.target.value })} className="h-12 rounded-2xl border-gray-100" />
          <Textarea placeholder="Core offer" value={form.core_offer} onChange={(e) => setForm({ ...form, core_offer: e.target.value })} className="min-h-[120px] rounded-2xl border-gray-100 md:col-span-2" />
          <Textarea placeholder="Differentiator" value={form.differentiator} onChange={(e) => setForm({ ...form, differentiator: e.target.value })} className="min-h-[100px] rounded-2xl border-gray-100 md:col-span-2" />
        </div>
      </Card>

      <Card className="rounded-[2rem] border-gray-100 p-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-black text-brand-heading">
              Step 2: Connect Gmail
            </h2>
            <p className="mt-1 text-sm font-medium text-brand-body/55">
              Authorize the Gmail inbox this agent should monitor.
            </p>
          </div>
          <span className="rounded-full bg-gray-100 px-4 py-2 text-xs font-black uppercase tracking-widest text-brand-body/50">
            {channelReady ? "Connected" : "Not connected"}
          </span>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Button onClick={() => void connectChannel()} className="rounded-full px-6 font-black">
            Authorize Gmail
          </Button>
          {channelReady && (
            <Button
              variant="outline"
              className="rounded-full px-6 font-black"
              onClick={() => {
                window.location.href = `/agents/${agentId}/dashboard`;
              }}
            >
              Done - open workspace
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
