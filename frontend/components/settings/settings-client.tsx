"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

import { apiFetch, createPortalSession } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { SignOutButton } from "@/components/sign-out-button";

type FormState = {
  business_name: string;
  industry: string;
  target_customer: string;
  core_offer: string;
  price_range: string;
  differentiator: string;
  preferred_tone: "friendly" | "direct" | "formal";
  silence_threshold_hours: 24 | 48 | 72;
};

const defaults: FormState = {
  business_name: "",
  industry: "",
  target_customer: "",
  core_offer: "",
  price_range: "",
  differentiator: "",
  preferred_tone: "friendly",
  silence_threshold_hours: 48,
};

export function SettingsClient() {
  const pathname = usePathname();
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [form, setForm] = useState<FormState>(defaults);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [whatsappConnected, setWhatsappConnected] = useState(false);
  const [waPhoneNumberId, setWaPhoneNumberId] = useState("");
  const [waAccessToken, setWaAccessToken] = useState("");
  const [waBusinessAccountId, setWaBusinessAccountId] = useState("");
  const [waDisplayPhoneNumber, setWaDisplayPhoneNumber] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      if (user.email) setUserEmail(user.email);

      const { data: profile } = await supabase
        .from("business_profiles")
        .select("business_name,industry,target_customer,core_offer,price_range,differentiator,preferred_tone,silence_threshold_hours")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profile) {
        setForm({
          business_name: profile.business_name || "",
          industry: profile.industry || "",
          target_customer: profile.target_customer || "",
          core_offer: profile.core_offer || "",
          price_range: profile.price_range || "",
          differentiator: profile.differentiator || "",
          preferred_tone: (profile.preferred_tone || "friendly") as FormState["preferred_tone"],
          silence_threshold_hours: (profile.silence_threshold_hours || 48) as FormState["silence_threshold_hours"],
        });
      }

      const { data: connection } = await supabase.from("gmail_connections").select("id").eq("user_id", user.id).maybeSingle();
      setGmailConnected(Boolean(connection));

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
    }
    void load();
  }, []);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function saveProfile() {
    if (!userId) return;
    setSaving(true);
    await supabase.from("business_profiles").upsert(
      {
        user_id: userId,
        ...form,
        price_range: form.price_range || null,
        differentiator: form.differentiator || null,
      },
      { onConflict: "user_id" }
    );
    setSaving(false);
  }

  async function disconnectGmail() {
    if (!userId) return;
    await supabase.from("gmail_connections").delete().eq("user_id", userId);
    setGmailConnected(false);
  }

  async function connectGmail() {
    const data = await apiFetch<{ auth_url: string }>("/api/gmail/auth");
    if (data.auth_url) window.location.href = data.auth_url;
  }

  async function connectWhatsApp() {
    if (!waPhoneNumberId || !waAccessToken) return;
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
  }

  async function disconnectWhatsApp() {
    if (!userId) return;
    await supabase.from("whatsapp_connections").delete().eq("user_id", userId);
    setWhatsappConnected(false);
  }

  const Sidebar = () => (
    <div className="fixed left-0 top-0 hidden h-screen w-64 flex-col border-r border-gray-100 bg-white p-6 lg:flex">
      <Link href="/" className="flex items-center gap-2 mb-10 group">
        <Image src="/logo.png" alt="Actiio Logo" width={24} height={24} className="h-6 w-auto" />
        <span className="text-xl font-bold tracking-tight">Actiio</span>
      </Link>

      <nav className="flex-1 space-y-1">
        {[
          { label: "Leads", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z", href: "/dashboard" },
          { label: "Settings", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z", href: "/settings" }
        ].map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className={cn(
              "flex items-center gap-3 px-4 py-3 text-sm font-semibold rounded-xl transition-all duration-200 group",
              pathname === item.href ? "bg-brand-primary/10 text-brand-primary" : "text-brand-body/60 hover:text-brand-heading hover:bg-gray-50"
            )}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
            </svg>
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="mt-auto border-t border-gray-100 pt-6">
        <div className="mb-4 flex items-center gap-3 px-2">
          <div className="h-8 w-8 rounded-full bg-brand-primary/10 flex items-center justify-center text-brand-primary font-bold text-xs text-center uppercase">
            {userEmail[0]}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-brand-heading uppercase">{userEmail.split('@')[0]}</p>
            <p className="truncate text-xs text-brand-body/60">{userEmail}</p>
          </div>
        </div>
        <SignOutButton className="w-full justify-start gap-3 px-4 text-brand-body/60 hover:text-red-600 hover:bg-red-50" />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 lg:pl-64">
      <Sidebar />
      <main className="mx-auto max-w-4xl px-8 py-10">
        <header className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight text-brand-heading">Settings</h1>
          <p className="mt-1 text-sm font-medium text-brand-body/60 italic">Manage your profile and connections</p>
        </header>

        <div className="space-y-8">
          {/* Business Profile Section */}
          <section>
            <h2 className="text-xl font-bold text-brand-heading mb-4">Business Profile</h2>
            <Card className="border-gray-100">
              <CardContent className="p-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold">Business Name</label>
                    <Input value={form.business_name} onChange={(e) => setField("business_name", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold">Industry</label>
                    <Input value={form.industry} onChange={(e) => setField("industry", e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold">Target Customer</label>
                  <Textarea value={form.target_customer} onChange={(e) => setField("target_customer", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold">Core Offer</label>
                  <Textarea value={form.core_offer} onChange={(e) => setField("core_offer", e.target.value)} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold">Preferred Tone</label>
                    <select
                      className="flex h-12 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                      value={form.preferred_tone}
                      onChange={(e) => setField("preferred_tone", e.target.value as any)}
                    >
                      <option value="friendly">Friendly</option>
                      <option value="direct">Direct</option>
                      <option value="formal">Formal</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold">Follow-up Window</label>
                    <select
                      className="flex h-12 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                      value={String(form.silence_threshold_hours)}
                      onChange={(e) => setField("silence_threshold_hours", Number(e.target.value) as any)}
                    >
                      <option value="24">24 hours</option>
                      <option value="48">48 hours</option>
                      <option value="72">72 hours</option>
                    </select>
                  </div>
                </div>
                <Button className="w-full py-7 font-bold text-lg" onClick={saveProfile} disabled={saving}>
                  {saving ? "Saving Changes..." : "Save Business Profile"}
                </Button>
              </CardContent>
            </Card>
          </section>

          {/* Connected Accounts */}
          <section>
            <h2 className="text-xl font-bold text-brand-heading mb-4">Connected Accounts</h2>
            <Card className="border-gray-100 overflow-hidden">
              <div className="divide-y divide-gray-100">
                {/* Gmail */}
                <div className="p-8 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-red-50 flex items-center justify-center text-red-600">
                      <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24"><path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 010 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L12 9.573l8.073-6.08c1.618-1.214 3.927-.059 3.927 1.964z" /></svg>
                    </div>
                    <div>
                      <p className="font-bold text-brand-heading">Gmail Inbox</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <div className={cn("h-1.5 w-1.5 rounded-full", gmailConnected ? "bg-brand-primary animate-pulse" : "bg-gray-300")} />
                        <p className="text-xs text-brand-body/60 font-medium">
                          {gmailConnected ? "Connected and monitoring" : "Not connected"}
                        </p>
                      </div>
                    </div>
                  </div>
                  {gmailConnected ? (
                    <Button variant="ghost" className="text-red-500 hover:bg-red-50 hover:text-red-600 font-bold" onClick={disconnectGmail}>
                      Disconnect
                    </Button>
                  ) : (
                    <Button variant="outline" className="font-bold border-2" onClick={connectGmail}>
                      Connect Gmail
                    </Button>
                  )}
                </div>

                {/* WhatsApp */}
                <div className="p-8">
                  <div className="flex items-start justify-between mb-8">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-2xl bg-green-50 flex items-center justify-center text-green-600">
                        <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.414 0 .018 5.394 0 12.03c0 2.122.554 4.197 1.607 6.048l-1.708 6.24 6.384-1.674A11.778 11.778 0 0012.05 24h.005c6.634 0 12.032-5.396 12.035-12.032a11.761 11.761 0 00-3.482-8.496" /></svg>
                      </div>
                      <div>
                        <p className="font-bold text-brand-heading">WhatsApp Business</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <div className={cn("h-1.5 w-1.5 rounded-full", whatsappConnected ? "bg-brand-primary animate-pulse" : "bg-gray-300")} />
                          <p className="text-xs text-brand-body/60 font-medium">
                            {whatsappConnected ? "Connected" : "Not configured"}
                          </p>
                        </div>
                      </div>
                    </div>
                    {whatsappConnected && (
                      <Button variant="ghost" className="text-red-500 hover:bg-red-50 hover:text-red-600 font-bold" onClick={disconnectWhatsApp}>
                        Disconnect
                      </Button>
                    )}
                  </div>

                  {!whatsappConnected && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input placeholder="Phone Number ID" value={waPhoneNumberId} onChange={(e) => setWaPhoneNumberId(e.target.value)} />
                        <Input placeholder="Access Token" type="password" value={waAccessToken} onChange={(e) => setWaAccessToken(e.target.value)} />
                      </div>
                      <Button className="w-full font-bold border-2" variant="outline" onClick={connectWhatsApp}>
                        Connect WhatsApp Account
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </section>

          {/* Billing */}
          <section>
            <h2 className="text-xl font-bold text-brand-heading mb-4">Billing & Plan</h2>
            <Card className="border-gray-100">
              <CardContent className="p-8 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-brand-primary/10 flex items-center justify-center text-brand-primary">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-brand-heading">Pro Plan</p>
                      <Badge variant="active" className="text-[10px] uppercase tracking-widest font-black">Active</Badge>
                    </div>
                    <p className="text-sm text-brand-body/60 font-medium">$29.00 per month</p>
                  </div>
                </div>
                <Button variant="outline" className="font-bold border-2" onClick={() => void createPortalSession()}>
                  Manage Subscription
                </Button>
              </CardContent>
            </Card>
          </section>

          {/* Danger Zone */}
          <section className="pt-10">
            <div className="border-t border-gray-100 pt-10">
              <h2 className="text-xl font-bold text-red-600 mb-2">Danger Zone</h2>
              <p className="text-sm text-brand-body/60 mb-6 font-medium">Permanently delete your account and all associated lead history. This action cannot be undone.</p>
              <Button variant="outline" className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 font-bold">
                Delete Account
              </Button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
