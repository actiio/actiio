"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import { SignOutButton } from "@/components/sign-out-button";
import { getAgentMeta, isGmailAgent } from "@/lib/agents";
import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";
import { SuggestSkillModal } from "./suggest-skill-modal";


type AgentLayoutProps = {
  agentId: string;
  agentName?: string;
  agentIcon?: string;
  activePath: "dashboard" | "settings" | "support" | "billing";
  children: React.ReactNode;
};

export function AgentLayout({
  agentId,
  agentName,
  activePath,
  children,
}: AgentLayoutProps) {
  const meta = getAgentMeta(agentId);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailEmail, setGmailEmail] = useState("");

  useEffect(() => {
    async function load() {
      if (isGmailAgent(agentId)) {
        try {
          const gmail = await apiFetch<{ connected: boolean; status?: string; email?: string }>(
            `/api/gmail/status?agent_id=${encodeURIComponent(agentId)}`
          );
          setGmailConnected(Boolean(gmail.connected));
          setGmailEmail(gmail.email || "");
        } catch {}
      }
    }

    void load();
  }, [agentId]);

  const navItems = [
    { key: "dashboard", label: "Leads", href: `/agents/${agentId}/dashboard` },
    { key: "settings", label: "Business Profile", href: `/agents/${agentId}/settings` },
    { key: "billing", label: "Billing", href: `/agents/${agentId}/billing` },
    { key: "support", label: "Support", href: `/agents/${agentId}/support` },
  ] as const;

  return (
    <div className="min-h-screen bg-gray-50 lg:pl-64">
      <aside className="fixed left-0 top-0 hidden h-screen w-64 flex-col border-r border-gray-100 bg-white p-6 lg:flex">
        <div className="mb-10 space-y-6">
          <Link href="/" className="flex items-center gap-2 group">
            <Image src="/logo.png" alt="Actiio Logo" width={24} height={24} className="h-6 w-auto" />
            <span className="text-xl font-bold tracking-tight text-brand-heading">Actiio</span>
          </Link>

          <Link href="/agents" className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] text-brand-body/60 hover:text-brand-primary transition-colors">
            <span aria-hidden="true">←</span>
            <span>Agents Hub</span>
          </Link>
        </div>

        <nav className="flex-1 space-y-1">
          <div className="px-4 pb-3">
             <p className="text-[10px] font-black uppercase tracking-widest text-brand-body/40">Workspace</p>
          </div>
          {navItems.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={cn(
                "block rounded-xl px-4 py-3 text-sm font-semibold transition-colors",
                activePath === item.key
                  ? "bg-brand-primary/10 text-brand-primary"
                  : "text-brand-body/70 hover:bg-gray-50 hover:text-brand-heading"
              )}
            >
              {item.label}
            </Link>
          ))}
          <div className="pt-2">
            <SuggestSkillModal>
              <button className="flex w-full items-center gap-2 rounded-xl border border-dashed border-gray-200 bg-gray-50/50 px-4 py-3 text-sm font-bold text-gray-500 hover:border-brand-primary/40 hover:bg-white hover:text-brand-primary transition-all">
                <Sparkles className="h-4 w-4" />
                Suggest a Skill
              </button>
            </SuggestSkillModal>
          </div>
        </nav>

        <div className="mt-6 border-t border-gray-100 pt-6">
          <SignOutButton className="w-full justify-start gap-3 px-4 text-brand-body/60 hover:text-red-600 hover:bg-red-50" />
        </div>
      </aside>

      <header className="border-b border-gray-100 bg-white/80 px-4 py-4 backdrop-blur sm:px-6 lg:fixed lg:left-64 lg:right-0 lg:top-0 lg:z-10">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-50 text-xl shadow-sm">
              {meta.icon}
            </span>
            <p className="text-xl font-bold tracking-tight text-brand-heading">{agentName || meta.name}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            {isGmailAgent(agentId) && (
              <div className={cn(
                "flex items-center gap-3 rounded-2xl border px-4 py-2 text-xs shadow-sm transition-all",
                gmailConnected ? "border-emerald-100 bg-emerald-50/50 text-emerald-800" : "border-gray-200 bg-gray-50 text-gray-500"
              )}>
                <div className="flex flex-col">
                  <p className="text-[10px] font-black uppercase tracking-tighter">Connection</p>
                  <p className="font-semibold normal-case">
                    {gmailConnected ? (gmailEmail || "Connected") : "Disconnected"}
                  </p>
                </div>
                <div className={cn("h-2 w-2 rounded-full", gmailConnected ? "bg-emerald-500 animate-pulse" : "bg-gray-300")} />
              </div>
            )}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 lg:hidden">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl bg-gray-50 px-4 py-3 text-sm font-semibold text-brand-body/70 transition-colors hover:bg-gray-100 hover:text-brand-heading"
          >
            <span aria-hidden="true">←</span>
            <span>Home</span>
          </Link>
          <Link
            href="/agents"
            className="inline-flex items-center gap-2 rounded-xl bg-gray-50 px-4 py-3 text-sm font-semibold text-brand-body/70 transition-colors hover:bg-gray-100 hover:text-brand-heading"
          >
            <span>Agents Hub</span>
          </Link>
        </div>
        <nav className="mt-3 grid grid-cols-4 gap-2 lg:hidden">
          {navItems.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={cn(
                "rounded-xl px-4 py-3 text-center text-[10px] font-semibold transition-colors truncate",
                activePath === item.key
                  ? "bg-brand-primary/10 text-brand-primary"
                  : "bg-gray-50 text-brand-body/70 hover:bg-gray-100 hover:text-brand-heading"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="px-4 py-6 lg:px-8 lg:pt-24">{children}</main>
    </div>
  );
}
