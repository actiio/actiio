"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";

import { apiFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { BusinessProfile } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const steps = ["Business Profile", "Connect Gmail", "Connect WhatsApp"];

type ProfileForm = {
  business_name: string;
  industry: string;
  target_customer: string;
  core_offer: string;
  price_range: string;
  differentiator: string;
  preferred_tone: "friendly" | "direct" | "formal";
  silence_threshold_hours: 24 | 48 | 72;
};

const defaultProfile: ProfileForm = {
  business_name: "",
  industry: "",
  target_customer: "",
  core_offer: "",
  price_range: "",
  differentiator: "",
  preferred_tone: "friendly",
  silence_threshold_hours: 48,
};

export function OnboardingFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [step, setStep] = useState(1);
  const [userId, setUserId] = useState<string | null>(null);
  const [form, setForm] = useState<ProfileForm>(defaultProfile);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [whatsappConnected, setWhatsappConnected] = useState(false);
  const [waPhoneNumberId, setWaPhoneNumberId] = useState("");
  const [waAccessToken, setWaAccessToken] = useState("");
  const [waBusinessAccountId, setWaBusinessAccountId] = useState("");
  const [waDisplayPhoneNumber, setWaDisplayPhoneNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gmailConnectedFromQuery = useMemo(() => searchParams.get("gmail_connected") === "1", [searchParams]);

  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/sign-in");
        return;
      }
      setUserId(user.id);

      const { data: profile } = await supabase
        .from("business_profiles")
        .select("business_name,industry,target_customer,core_offer,price_range,differentiator,preferred_tone,silence_threshold_hours")
        .eq("user_id", user.id)
        .maybeSingle();

      const hasProfile = Boolean(profile);
      if (profile) {
        setForm({
          business_name: profile.business_name || "",
          industry: profile.industry || "",
          target_customer: profile.target_customer || "",
          core_offer: profile.core_offer || "",
          price_range: profile.price_range || "",
          differentiator: profile.differentiator || "",
          preferred_tone: (profile.preferred_tone || "friendly") as ProfileForm["preferred_tone"],
          silence_threshold_hours: (profile.silence_threshold_hours || 48) as ProfileForm["silence_threshold_hours"],
        });
      }

      const { data: connection } = await supabase.from("gmail_connections").select("id").eq("user_id", user.id).maybeSingle();
      const isGmailConnected = Boolean(connection) || gmailConnectedFromQuery;
      setGmailConnected(isGmailConnected);

      const { data: waConnection } = await supabase
        .from("whatsapp_connections")
        .select("id,phone_number_id,business_account_id,display_phone_number")
        .eq("user_id", user.id)
        .maybeSingle();
      if (waConnection) {
        setWhatsappConnected(true);
        setWaPhoneNumberId(waConnection.phone_number_id || "");
        setWaBusinessAccountId(waConnection.business_account_id || "");
        setWaDisplayPhoneNumber(waConnection.display_phone_number || "");
      }

      if (hasProfile && isGmailConnected) {
        setStep(3);
      } else if (hasProfile) {
        setStep(2);
      }
    }

    void init();
  }, [gmailConnectedFromQuery, router]);

  function updateField<K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function saveBusinessProfile() {
    if (!userId) return;
    setSaving(true);
    setError(null);

    const payload: Partial<BusinessProfile> & { user_id: string } = {
      user_id: userId,
      ...form,
      price_range: form.price_range || null,
      differentiator: form.differentiator || null,
    };

    const { error: upsertError } = await supabase.from("business_profiles").upsert(payload, { onConflict: "user_id" });
    if (upsertError) {
      setError(upsertError.message);
      setSaving(false);
      return;
    }

    setStep(2);
    setSaving(false);
  }

  async function connectGmail() {
    setError(null);
    try {
      const data = await apiFetch<{ auth_url: string }>("/api/gmail/auth");
      window.location.href = data.auth_url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect Gmail");
    }
  }

  async function connectWhatsApp() {
    setError(null);
    if (!waPhoneNumberId || !waAccessToken) {
      setError("Phone Number ID and Access Token are required.");
      return;
    }

    try {
      await apiFetch("/api/whatsapp/connect", {
        method: "POST",
        body: JSON.stringify({
          phone_number_id: waPhoneNumberId,
          access_token: waAccessToken,
          business_account_id: waBusinessAccountId || undefined,
          display_phone_number: waDisplayPhoneNumber || undefined,
        }),
      });
      setWhatsappConnected(true);
      setWaAccessToken("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect WhatsApp");
    }
  }

  function renderStep() {
    if (step === 1) {
      return (
        <Card className="shadow-2xl border-gray-100">
          <CardHeader className="space-y-4 p-8 pb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-primary/10 text-brand-primary">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div>
              <CardTitle className="text-2xl font-bold tracking-tight">Tell us about your business</CardTitle>
              <CardDescription className="text-brand-body/60 mt-2">
                We use this context to write follow-ups that sound like you.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-8 pt-4 space-y-6">
            <div className="grid gap-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold">Business Name</label>
                <Input placeholder="e.g. Acme Sales Group" value={form.business_name} onChange={(e) => updateField("business_name", e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold">Industry</label>
                <Input placeholder="e.g. SaaS, Real Estate" value={form.industry} onChange={(e) => updateField("industry", e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold">Core Offer & Target Customer</label>
                <Textarea
                  placeholder="What do you sell and who do you sell to?"
                  value={form.core_offer}
                  onChange={(e) => updateField("core_offer", e.target.value)}
                  className="min-h-[140px]"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Preferred Tone</label>
                  <select
                    className="flex h-12 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                    value={form.preferred_tone}
                    onChange={(e) => updateField("preferred_tone", e.target.value as any)}
                  >
                    <option value="friendly">Friendly</option>
                    <option value="direct">Direct</option>
                    <option value="formal">Formal</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Follow-up Window</label>
                  <select
                    className="flex h-12 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                    value={form.silence_threshold_hours}
                    onChange={(e) => updateField("silence_threshold_hours", Number(e.target.value) as any)}
                  >
                    <option value="24">24 hours</option>
                    <option value="48">48 hours</option>
                    <option value="72">72 hours</option>
                  </select>
                </div>
              </div>
            </div>

            {error && (
              <div className="p-4 rounded-xl bg-red-50 border border-red-100 text-sm text-red-600">
                {error}
              </div>
            )}

            <Button
              className="w-full py-8 text-lg font-bold"
              onClick={saveBusinessProfile}
              disabled={saving || !form.business_name || !form.industry || !form.core_offer}
            >
              {saving ? "Creating Profile..." : "Save and Continue"}
            </Button>
          </CardContent>
        </Card>
      );
    }

    if (step === 2) {
      return (
        <Card className="shadow-2xl border-gray-100">
          <CardHeader className="p-8 pb-4 text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-red-50 text-red-600">
              <svg className="h-10 w-10" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 010 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L12 9.573l8.073-6.08c1.618-1.214 3.927-.059 3.927 1.964z" />
              </svg>
            </div>
            <CardTitle className="text-3xl font-bold tracking-tight">Connect your Gmail</CardTitle>
            <CardDescription className="text-brand-body/60 mt-2 text-lg">
              Actiio will scan your inbox to identify sales conversations.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-8 pt-4 space-y-8">
            <div className="space-y-4">
              {gmailConnected && (
                <div className="flex items-center justify-center gap-2 rounded-2xl bg-green-50 p-4 font-bold text-green-700">
                  <svg className="h-6 w-6 animate-in zoom-in" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                  Gmail connected successfully
                </div>
              )}

              {!gmailConnected ? (
                <Button variant="outline" className="w-full py-8 text-lg border-2" onClick={connectGmail}>
                  Connect Gmail Account
                </Button>
              ) : (
                <Button className="w-full py-8 text-lg font-bold" onClick={() => setStep(3)}>
                  Continue to WhatsApp
                </Button>
              )}
            </div>
            <p className="text-center text-xs text-brand-body/50">
              We only identify sales-related conversations. Your other emails remain private and are never shared.
            </p>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className="shadow-2xl border-gray-100">
        <CardHeader className="p-8 pb-4 text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-green-50 text-green-600">
            <svg className="h-10 w-10" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.414 0 .018 5.394 0 12.03c0 2.122.554 4.197 1.607 6.048l-1.708 6.24 6.384-1.674A11.778 11.778 0 0012.05 24h.005c6.634 0 12.032-5.396 12.035-12.032a11.761 11.761 0 00-3.482-8.496" />
            </svg>
          </div>
          <CardTitle className="text-3xl font-bold tracking-tight">Connect WhatsApp</CardTitle>
          <CardDescription className="text-brand-body/60 mt-2 text-lg">
            Monitor leads and send follow-ups via WhatsApp.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-8 pt-4 space-y-6">
          <div className="grid gap-4">
            <Input placeholder="Phone Number ID" value={waPhoneNumberId} onChange={(e) => setWaPhoneNumberId(e.target.value)} />
            <Input placeholder="Access Token" type="password" value={waAccessToken} onChange={(e) => setWaAccessToken(e.target.value)} />
            <div className="grid grid-cols-2 gap-4">
              <Input placeholder="Business ID (Optional)" value={waBusinessAccountId} onChange={(e) => setWaBusinessAccountId(e.target.value)} />
              <Input placeholder="Display Name (Optional)" value={waDisplayPhoneNumber} onChange={(e) => setWaDisplayPhoneNumber(e.target.value)} />
            </div>
          </div>

          <Button className="w-full py-8 text-lg font-bold" onClick={connectWhatsApp} disabled={!waPhoneNumberId || !waAccessToken}>
            Connect WhatsApp
          </Button>

          <div className="text-center">
            <button
              onClick={() => router.push("/dashboard")}
              className="text-brand-body/50 text-sm font-medium hover:text-brand-primary transition-colors hover:underline"
            >
              Skip this step and finish setup
            </button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center px-6 py-20">
      <div className="mb-12 flex flex-col items-center gap-2">
        <Image src="/logo.png" alt="Actiio Logo" width={40} height={40} className="h-10 w-auto" />
        <span className="text-xl font-bold tracking-tight text-brand-heading">Actiio</span>
      </div>

      {/* Progress Indicator */}
      <div className="mb-12 flex items-center justify-center gap-4">
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            className={`h-2.5 w-2.5 rounded-full transition-all duration-300 ${n === step ? "w-8 bg-brand-primary" : n < step ? "bg-brand-primary/40" : "bg-gray-200"}`}
          />
        ))}
      </div>

      <div className="w-full">
        {renderStep()}
      </div>
    </div>
  );
}
