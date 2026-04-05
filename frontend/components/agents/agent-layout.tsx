"use client";

import Link from "next/link";
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
  activePath: "dashboard" | "settings";
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
    { key: "dashboard", label: "Dashboard", href: `/agents/${agentId}/dashboard` },
    { key: "settings", label: "Settings", href: `/agents/${agentId}/settings` },
  ] as const;

  return (
    <div className="min-h-screen bg-gray-50 lg:pl-64">
      <aside className="fixed left-0 top-0 hidden h-screen w-64 flex-col border-r border-gray-100 bg-white p-6 lg:flex">
        <Link href="/" className="mb-4 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-brand-body/30 hover:text-brand-primary transition-colors">
          <span aria-hidden="true">←</span>
          <span>Back to Home</span>
        </Link>

        <Link href="/agents" className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-brand-body/60 hover:text-brand-heading">
          <span aria-hidden="true">←</span>
          <span>Agents Hub</span>
        </Link>

        <div className="mb-8 flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50/70 px-4 py-3">
          <span className="text-2xl">{meta.icon}</span>
          <div>
            <p className="text-sm font-semibold text-brand-heading">{agentName || meta.name}</p>
            <p className="text-xs font-medium text-brand-body/55">Gmail workspace</p>
          </div>
        </div>


        <nav className="flex-1 space-y-1">
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
              {item.key === "dashboard" ? "Leads" : item.label}
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

      <header className="border-b border-gray-100 bg-white/80 px-6 py-4 backdrop-blur lg:fixed lg:left-64 lg:right-0 lg:top-0 lg:z-10">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-brand-primary">Agent Workspace</p>
              <p className="text-lg font-bold text-brand-heading">{agentName || meta.name}</p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            {isGmailAgent(agentId) && (
              <div className={cn(
                "rounded-2xl border px-3 py-2 text-xs",
                gmailConnected ? "border-green-100 bg-green-50 text-green-800" : "border-gray-200 bg-gray-50 text-gray-500"
              )}>
                <p className="font-black uppercase tracking-wider">Gmail</p>
                <p className="mt-1 font-medium normal-case">
                  {gmailConnected ? (gmailEmail || "Connected") : "Disconnected"}
                </p>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="px-4 py-6 lg:px-8 lg:pt-24">{children}</main>
    </div>
  );
}
