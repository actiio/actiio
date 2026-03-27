"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/toast";



const AGENTS = [
  {
    id: "gmail_followup",
    name: "Gmail Follow-up Agent",
    tagline: "Operational & Live",
    desc: "Monitor your email inbox for silent leads and generate smart follow-up drafts automatically.",
    longDesc:
      "Monitors your Gmail inbox for silent sales leads and generates smart follow-up drafts automatically. Review subject-aware replies, approve the best option, and send via Gmail without leaving the dashboard.",
    icon: "📧",
    status: "active",
    price: "₹99/month",
    color: "from-brand-primary to-emerald-500",
    features: [
      "Inbox Monitoring",
      "Subject-Aware Drafts",
      "Reply via Gmail",
      "Silence Detection",
      "Context-Aware Follow-ups",
    ],
  },
  {
    id: "coming_soon",
    name: "More Agents Coming Soon",
    tagline: "Product Pipeline",
    desc: "Lead scoring, cold outreach, proposal generation and more are on the way.",
    longDesc:
      "Actiio is expanding beyond follow-up. Lead Scorer, Cold Outreach, Proposal Generator, and other workflow-specific agents will ship as separate products with their own subscriptions and setup flows.",
    icon: "✨",
    status: "coming_soon",
    color: "from-purple-500 to-pink-600",
    features: [
      "Lead Scoring",
      "Cold Outreach",
      "Proposal Generation",
      "More Channel Coverage",
      "Additional Sales Workflows",
    ],
  },
];

export function LandingPageClient({ isAuthenticated }: { isAuthenticated: boolean }) {
  const { pushToast } = useToast();
  const [selectedAgent, setSelectedAgent] = useState<typeof AGENTS[0] | null>(null);

  const [scrolled, setScrolled] = useState(false);
  const [showSuggestSkillModal, setShowSuggestSkillModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [skillForm, setSkillForm] = useState({ skill: "", description: "" });

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleSuggestSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      window.location.href = "/sign-up";
      return;
    }

    if (!skillForm.skill.trim()) {
      pushToast("Please provide a skill name.", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("suggested_skills").insert({
        user_id: user?.id,
        skill: skillForm.skill,
        description: skillForm.description,
      });

      if (error) throw error;

      pushToast("Thanks for your suggestion!", "success");
      setShowSuggestSkillModal(false);
      setSkillForm({ skill: "", description: "" });
    } catch (err: any) {
      console.error("Error suggesting skill:", err);
      pushToast(err.message || "Something went wrong.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      window.location.reload();
    } catch (err: any) {
      console.error("Sign out error:", err);
      pushToast(err.message || "Failed to sign out.", "error");
    }
  };

  return (
    <div className="min-h-screen bg-[#fcfcfc] text-brand-heading selection:bg-brand-primary/20">
      <nav
        className={cn(
          "fixed top-0 z-50 w-full transition-all duration-500 px-6 py-4",
          scrolled ? "bg-white/80 backdrop-blur-xl border-b border-gray-100 shadow-sm" : "bg-transparent"
        )}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between relative">
          {/* Left: Logo */}
          <Link href="/" className="flex items-center gap-2.5 group relative z-10">
            <div className="relative h-8 w-8 overflow-hidden rounded-xl bg-brand-primary p-1.5 transition-transform group-hover:rotate-12">
              <Image src="/logo.png" alt="Actiio Logo" width={32} height={32} className="h-full w-full object-contain brightness-0 invert" />
            </div>
            <span className="text-2xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-brand-heading to-brand-body">
              Actiio
            </span>
          </Link>

          {/* Middle: Links - Perfectly Centered */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden items-center gap-10 md:flex">
            {["Agents Hub", "Pricing", "How it works"].map((item) => (
              <a
                key={item}
                href={`#${item.toLowerCase().replace(/\s+/g, "-")}`}
                className="text-sm font-bold text-brand-body/60 transition-colors hover:text-brand-primary whitespace-nowrap"
              >
                {item}
              </a>
            ))}
          </div>

          {/* Right: Auth/Platform */}
          <div className="flex items-center gap-5 relative z-10">
            {!isAuthenticated ? (
              <Link href="/sign-in" className="text-sm font-bold text-brand-body/60 hover:text-brand-primary transition-colors">
                Sign in
              </Link>
            ) : (
              <button
                onClick={handleSignOut}
                className="text-sm font-bold text-brand-body/60 hover:text-red-500 transition-colors"
              >
                Sign out
              </button>
            )}
            <Link href={isAuthenticated ? "/agents" : "/sign-up"}>
              <Button size="lg" className="rounded-full px-8 font-black shadow-xl shadow-brand-primary/20 hover:scale-105 transition-all">
                {isAuthenticated ? "Go to Platform" : "Get Started"}
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      <main>
        <section className="relative overflow-hidden px-6 pb-24 pt-44 text-center lg:pb-32 lg:pt-56">
          <div className="absolute left-1/2 top-0 -translate-x-1/2 overflow-visible opacity-40 blur-[72px] pointer-events-none">
            <div className="h-[600px] w-[800px] rounded-full bg-gradient-to-tr from-brand-primary/20 to-brand-primary/5" />
          </div>

          <div className="relative z-10 mx-auto max-w-5xl">
            <div className="mx-auto mb-8 flex w-fit items-center gap-2 rounded-full border border-brand-primary/20 bg-brand-primary/5 px-5 py-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-primary"></span>
              </span>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-primary">Introducing the Multi-Agent Platform</span>
            </div>

            <h1 className="text-[clamp(2.5rem,8vw,5.5rem)] font-black leading-[0.95] tracking-tight text-brand-heading">
              Scale revenue,<br />
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-brand-primary via-emerald-400 to-brand-primary bg-[length:200%_auto] animate-gradient-x italic">
                not headcount.
              </span>
            </h1>

            <p className="mx-auto max-w-2xl text-xl leading-relaxed text-brand-body/70 font-medium pt-4">
              Actiio monitors your Gmail conversations, detects when leads go quiet, and generates smart follow-up
              messages automatically.
            </p>

            <div className="flex flex-col items-center justify-center gap-6 pt-10 sm:flex-row">
              <a href="#agents-hub">
                <Button size="xl" className="h-16 rounded-full px-12 text-lg font-black shadow-2xl shadow-brand-primary/30 hover:-translate-y-1 transition-all">
                  Browse All Agents
                </Button>
              </a>
              <a href="#how-it-works">
                <Button variant="ghost" size="xl" className="h-16 rounded-full px-10 text-lg font-black text-brand-body hover:text-brand-primary">
                  See how it works
                </Button>
              </a>
            </div>

            <div className="absolute -left-12 top-40 h-20 w-20 animate-float opacity-20 lg:block hidden">
              <div className="h-full w-full rounded-3xl bg-white shadow-xl flex items-center justify-center text-3xl">🤖</div>
            </div>
            <div className="absolute -right-20 top-60 h-24 w-24 animate-float opacity-20 lg:block hidden delay-1000">
              <div className="h-full w-full rounded-3xl bg-white shadow-xl flex items-center justify-center text-3xl">📧</div>
            </div>
          </div>
        </section>

        <section id="agents-hub" className="bg-[#050505] px-6 py-32 text-white relative overflow-hidden lg:rounded-[4rem] mx-6 shadow-[0_32px_80px_rgba(0,0,0,0.24)] scroll-mt-24">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(0,191,99,0.1),transparent_70%)] opacity-70" />

          <div className="mx-auto max-w-7xl relative z-20">
            <div className="text-center mb-24 space-y-4">
              <Badge className="bg-brand-primary text-white rounded-full px-4 py-1.5 font-black uppercase text-[10px] tracking-[0.2em] border-none">
                The Synthetic Squad
              </Badge>
              <h2 className="text-5xl md:text-7xl font-black tracking-tighter leading-none text-white">
                Enter the <span className="text-brand-primary">Agents Hub.</span>
              </h2>
              <p className="mx-auto max-w-2xl text-lg font-semibold text-white/40 leading-relaxed">
                One live follow-up agent today, with more specialized agents coming next.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {AGENTS.map((agent) => (
                <div
                  key={agent.id}
                  className={cn(
                    "group relative h-full flex flex-col p-1 rounded-[2.5rem] transition-all duration-500",
                    agent.status === "active" ? "bg-gradient-to-br from-brand-primary/20 via-white/5 to-white/5 hover:scale-[1.02]" : "bg-gradient-to-br from-white/10 to-white/5 hover:scale-[1.02]"
                  )}
                  onClick={() => agent.status === "active" && setSelectedAgent(agent)}
                >
                  <div className="relative flex-1 bg-brand-dark/70 rounded-[2.35rem] p-10 flex flex-col justify-between overflow-hidden border border-white/5">
                    {agent.status === "active" && (
                      <div className="absolute -right-20 -bottom-20 h-60 w-60 rounded-full bg-brand-primary/15 blur-[44px] group-hover:bg-brand-primary/20 transition-colors" />
                    )}

                    <div className={cn(agent.status === "active" && "transition-opacity duration-200 group-hover:opacity-15")}>
                      <div className="flex justify-between items-start mb-10">
                        <div
                          className={cn(
                            "h-16 w-16 rounded-2xl flex items-center justify-center text-4xl shadow-2xl transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3",
                            agent.status === "active" ? "bg-brand-primary text-white" : "bg-white/5 text-white/20"
                          )}
                        >
                          {agent.icon}
                        </div>
                        {agent.status === "active" ? (
                          <div className="flex flex-col items-end">
                            <Badge className="bg-green-500 text-white rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-widest border-none">
                              Live Now
                            </Badge>
                            <span className="text-[10px] font-black text-brand-primary mt-2">v.1.0 Operational</span>
                          </div>
                        ) : (
                          <Badge className="bg-brand-primary/20 text-brand-primary rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-widest border border-brand-primary/30">
                            Coming Soon
                          </Badge>
                        )}
                      </div>

                      <h3 className="text-3xl font-black text-white mb-4 tracking-tight transition-colors group-hover:text-brand-primary">{agent.name}</h3>
                      <p className="text-white/60 font-semibold leading-relaxed text-sm mb-8">{agent.desc}</p>
                    </div>

                    <div className={cn(
                      "flex items-center justify-between pt-8 border-t border-white/5",
                      agent.status === "active" && "transition-opacity duration-200 group-hover:opacity-15"
                    )}>
                      <div className="flex -space-x-2">
                        {[1, 2, 3].map((j) => <div key={j} className="h-6 w-6 rounded-full border-2 border-brand-dark bg-white/10" />)}
                      </div>
                      {agent.status !== "active" ? (
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/30">Connect in seconds</span>
                      ) : (
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white/55">
                          Get started
                        </span>
                      )}
                    </div>

                    {agent.status === "active" && (
                      <Link
                        href={isAuthenticated ? "/agents" : "/sign-up"}
                        onClick={(event) => event.stopPropagation()}
                        className="absolute inset-0 z-20 flex items-center justify-center rounded-[2.35rem] opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                      >
                        <div className="absolute inset-0 rounded-[2.35rem] bg-[#04120c]/52 backdrop-blur-md" />
                        <div className="absolute inset-0 rounded-[2.35rem] border border-emerald-200/18 bg-gradient-to-br from-[#00bf63]/28 via-[#00bf63]/12 to-[#7ef0b8]/8" />
                        <div className="absolute -left-2 top-0 h-40 w-40 rounded-full bg-[#00bf63]/32 blur-3xl opacity-95" />
                        <div className="absolute right-4 top-8 h-24 w-24 rounded-full bg-[#7ef0b8]/24 blur-3xl opacity-90" />
                        <div className="absolute bottom-2 right-2 h-32 w-32 rounded-full bg-[#00e07a]/20 blur-3xl opacity-85" />
                        <Button size="lg" className="relative rounded-full font-black px-8 bg-white text-brand-dark hover:bg-brand-primary hover:text-white shadow-[0_0_20px_rgba(255,255,255,0.12)] transition-colors">
                          {agent.id === "gmail_followup" ? "Get started →" : "View details"}
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              ))}

              <div className="group relative h-full flex flex-col p-1 rounded-[2.5rem] bg-gradient-to-br from-white/5 to-transparent hover:from-white/10 transition-all duration-700">
                <div className="relative flex-1 bg-[#0a0a0a]/78 rounded-[2.35rem] p-10 flex flex-col items-center justify-center text-center overflow-hidden border border-white/5">
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 border border-white/[0.03] rounded-full animate-pulse-glow" style={{ animationDuration: "5.5s" }} />
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 border border-white/[0.05] rounded-full animate-float" style={{ animationDuration: "6s" }} />

                  <div className="relative z-10 flex flex-col items-center gap-6">
                    <div className="h-20 w-20 rounded-full bg-white/5 flex items-center justify-center text-4xl text-white/20 border border-white/10 shadow-inner group-hover:scale-110 transition-transform duration-700">
                      ✨
                    </div>
                    <div className="space-y-2">
                      <Badge className="bg-white/5 text-white/40 rounded-full px-4 py-1.5 font-black uppercase text-[10px] tracking-[0.2em] border border-white/10">
                        In Development
                      </Badge>
                      <h3 className="text-2xl font-black text-white/60">The Intelligence Lab</h3>
                      <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest mt-2">
                        Expanding the squad&apos;s reach across every sales channel
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      className="text-white/40 hover:text-white hover:bg-white/5 rounded-full font-black text-xs px-6"
                      onClick={() => {
                        if (!isAuthenticated) {
                          window.location.href = "/sign-up";
                        } else {
                          setShowSuggestSkillModal(true);
                        }
                      }}
                    >
                      Suggest a Skill →
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-20 flex justify-center">
              <div className="px-8 py-3 rounded-full border border-white/5 bg-white/[0.02]">
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/30 text-center">
                  More specialized agents <span className="text-brand-primary">coming soon...</span>
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="pricing" className="mt-8 px-6 pb-28 lg:mt-12">
          <div className="mx-auto max-w-7xl">
            <div className="mb-12 text-center">
              <Badge className="bg-brand-primary/10 text-brand-primary rounded-full px-4 py-1.5 font-black uppercase text-[10px] tracking-[0.2em] border-none">
                Pricing
              </Badge>
              <h2 className="mt-4 text-4xl font-black tracking-tight text-brand-heading md:text-5xl">
                Choose your follow-up coverage.
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-lg font-medium text-brand-body/60">
                Start with the Gmail Follow-up Agent today. More sales agents will be available as separate subscriptions.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-1">
              {AGENTS.filter((agent) => agent.status === "active").map((agent) => (
                <Card key={agent.id} className="rounded-[2.5rem] border-gray-100 p-8 shadow-xl shadow-gray-200/40">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-3xl">{agent.icon}</p>
                      <h3 className="mt-4 text-3xl font-black tracking-tight text-brand-heading">{agent.name}</h3>
                      <p className="mt-3 max-w-md text-sm font-medium leading-relaxed text-brand-body/65">
                        {agent.desc}
                      </p>
                    </div>
                    <Badge className="rounded-full bg-brand-primary/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-brand-primary">
                      Available now
                    </Badge>
                  </div>

                  <div className="mt-6 grid gap-3 sm:grid-cols-3">
                    {agent.features.slice(0, 3).map((feature) => (
                      <div key={feature} className="rounded-2xl border border-gray-100 bg-gray-50/70 px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-brand-body/35">Included</p>
                        <p className="mt-1 text-sm font-bold leading-snug text-brand-heading">{feature}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-8 flex items-end justify-between border-t border-gray-100 pt-6">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-body/40">Price</p>
                      <p className="mt-2 text-4xl font-black text-brand-heading">₹99<span className="text-lg text-brand-body/50">/month</span></p>
                    </div>
                    <Link href={isAuthenticated ? "/agents" : "/sign-up"}>
                      <Button className="rounded-full px-8 font-black shadow-xl shadow-brand-primary/20">
                        Get started →
                      </Button>
                    </Link>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="relative px-6 py-32 bg-white">
          <div className="mx-auto max-w-7xl">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
              <div className="space-y-8">
                <Badge className="bg-brand-primary/10 text-brand-primary rounded-full px-4 py-1.5 font-black uppercase text-[10px] tracking-[0.2em] border-none">
                  The Workflow
                </Badge>
                <h2 className="text-5xl md:text-6xl font-black tracking-[calc(-0.02em)] leading-[1.05] text-brand-heading">
                  Intelligent monitoring <br />
                  across your <span className="text-brand-primary">core channels.</span>
                </h2>
                <div className="space-y-12 pt-8">
                  {[
                    { title: "Dedicated Gmail Agent", desc: "Connect the Gmail Follow-up Agent to monitor sales inbox activity and surface quiet leads automatically.", icon: "🔌" },
                    { title: "Quiet Lead Detection", desc: "The agent tracks conversation history, detects silence, and prepares contextual follow-up drafts from the actual thread.", icon: "🧠" },
                    { title: "Review And Send", desc: "Review the draft, make edits if needed, and reply through Gmail directly from the dashboard.", icon: "✨" }
                  ].map((item, i) => (
                    <div key={i} className="flex gap-6 items-start group">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gray-50 border border-gray-100 text-xl group-hover:bg-brand-primary/10 group-hover:border-brand-primary/30 transition-all duration-300">
                        {item.icon}
                      </div>
                      <div>
                        <h4 className="text-xl font-black mb-2 text-brand-heading group-hover:text-brand-primary transition-colors">{item.title}</h4>
                        <p className="text-brand-body/60 leading-relaxed font-semibold">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="relative aspect-square rounded-[3.5rem] border border-gray-100 bg-gray-50/50 p-1 flex items-center justify-center group overflow-hidden shadow-xl">
                <div className="absolute inset-0 bg-brand-primary/5 blur-3xl group-hover:bg-brand-primary/10 transition-colors" />
                <div className="relative w-full h-full rounded-[3.3rem] bg-white flex items-center justify-center p-8">
                  <div className="w-full space-y-6">
                    <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100 animate-float shadow-sm">
                      <div className="flex justify-between items-center mb-4">
                        <div className="h-4 w-32 bg-gray-200 rounded-full" />
                        <Badge className="bg-brand-primary text-[8px] px-3 font-black text-white">READY</Badge>
                      </div>
                      <div className="space-y-2">
                        <div className="h-2 w-full bg-gray-100 rounded-full" />
                        <div className="h-2 w-2/3 bg-gray-100 rounded-full" />
                      </div>
                    </div>
                    <div className="bg-white rounded-2xl p-6 border border-brand-primary/20 animate-float delay-700 translate-x-10 shadow-xl relative z-10">
                      <div className="flex justify-between items-center mb-4">
                        <div className="h-4 w-24 bg-brand-primary/10 rounded-full" />
                        <Badge className="bg-blue-500 text-[8px] px-3 font-black text-white">DRAFTING</Badge>
                      </div>
                      <div className="space-y-2">
                        <div className="h-2 w-full bg-blue-50 rounded-full" />
                        <div className="h-2 w-1/2 bg-blue-50 rounded-full" />
                      </div>
                      <div className="mt-4 pt-4 border-t border-gray-50 flex justify-end">
                        {/* <div className="h-8 w-24 bg-brand-primary rounded-lg" /> */}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Dialog open={!!selectedAgent} onClose={() => setSelectedAgent(null)} contentClassName="max-w-4xl p-0 overflow-hidden rounded-[3rem]">
        {selectedAgent && (
          <div className="flex flex-col md:flex-row min-h-[500px]">
            <div className={cn("md:w-72 p-12 flex flex-col items-center justify-center text-white relative", selectedAgent.status === "active" ? "bg-brand-dark" : "bg-brand-primary")}>
              <div className="text-9xl animate-float mb-8 drop-shadow-2xl">
                {selectedAgent.icon}
              </div>
              <div className="text-center">
                <span className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40">{selectedAgent.tagline}</span>
                <h4 className="text-xl font-black mt-1 leading-none">{selectedAgent.name}</h4>
              </div>
            </div>

            <div className="flex-1 bg-white p-12 relative">
              <button
                onClick={() => setSelectedAgent(null)}
                className="absolute right-8 top-8 h-10 w-10 rounded-full bg-gray-50 flex items-center justify-center hover:bg-gray-100 transition-colors"
              >
                <svg className="h-5 w-5 text-brand-body/40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>

              <div className="max-w-md">
                <Badge className={cn("mb-6 px-4 py-1 font-black uppercase border-none text-[10px] tracking-widest", selectedAgent.status === "active" ? "bg-brand-primary/10 text-brand-primary" : "bg-amber-100 text-amber-600")}>
                  {selectedAgent.status === "active" ? "Operational Status: 100%" : "Current Phase: Beta Lab"}
                </Badge>
                <h3 className="text-4xl font-black text-brand-heading mb-6 tracking-tight">{selectedAgent.name}</h3>
                <p className="text-lg font-medium text-brand-body/70 leading-relaxed mb-10">
                  {selectedAgent.longDesc}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-12">
                  {selectedAgent.features.map((f) => (
                    <div key={f} className="flex items-center gap-3 text-sm font-bold text-brand-heading/80">
                      <div className="h-2 w-2 rounded-full bg-brand-primary" />
                      {f}
                    </div>
                  ))}
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                  <Link href={selectedAgent.status === "active" ? (isAuthenticated ? "/agents" : "/sign-up") : "#agents-hub"} className="flex-1">
                    <Button
                      className="w-full h-14 rounded-2xl font-black shadow-xl shadow-brand-primary/20"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedAgent(null);
                      }}
                    >
                      {selectedAgent.status === "active" ? (isAuthenticated ? "View Agent" : "Get started →") : "View Details"}
                    </Button>
                  </Link>
                  {selectedAgent.status === "active" && (
                    <div className="flex flex-col justify-center px-4">
                      <span className="text-[10px] font-black uppercase tracking-widest text-brand-body/40">Usage Fee</span>
                      <span className="text-lg font-black text-brand-heading">{selectedAgent.price}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </Dialog>

      <Dialog open={showSuggestSkillModal} onClose={() => setShowSuggestSkillModal(false)} contentClassName="max-w-md bg-[#0a0a0a] border-white/10 rounded-[2.5rem] p-10">
        <div className="space-y-6">
          <div className="space-y-2">
            <Badge className="bg-brand-primary/20 text-brand-primary rounded-full px-4 py-1.5 font-black uppercase text-[10px] tracking-[0.2em] border border-brand-primary/30 w-fit">
              Co-creation Lab
            </Badge>
            <h3 className="text-3xl font-black text-white tracking-tight">Suggest a Skill</h3>
            <p className="text-white/60 font-semibold text-sm leading-relaxed">
              Tell us what other sales automated agents you&apos;d like to see.
            </p>
          </div>

          <form onSubmit={handleSuggestSkill} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 pl-1">What skill should we build?</label>
                <Input
                  placeholder="e.g. Sales Voice AI, LinkedIn Outreach..."
                  value={skillForm.skill}
                  onChange={(e) => setSkillForm({ ...skillForm, skill: e.target.value })}
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/20 h-14 rounded-2xl focus:border-brand-primary transition-all pr-4 pl-4"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 pl-1">How would you use it?</label>
                <Textarea
                  placeholder="Describe the workflow we should automate..."
                  value={skillForm.description}
                  onChange={(e) => setSkillForm({ ...skillForm, description: e.target.value })}
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/20 min-h-[120px] rounded-2xl focus:border-brand-primary transition-all p-4"
                />
              </div>
            </div>

            <div className="flex gap-4 pt-4">
              <Button type="button" variant="ghost" onClick={() => setShowSuggestSkillModal(false)} className="flex-1 h-14 rounded-2xl font-black text-white/50 hover:text-white hover:bg-white/5">
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="flex-1 h-14 rounded-2xl font-black bg-brand-primary hover:bg-emerald-500 shadow-xl shadow-brand-primary/20 hover:scale-[1.02] transition-all">
                {isSubmitting ? "Submitting..." : "Submit Suggestion"}
              </Button>
            </div>

            {!isAuthenticated && (
              <p className="text-center text-[10px] font-bold text-white/30 italic">
                * Note: You will be redirected to sign up to submit.
              </p>
            )}
          </form>
        </div>
      </Dialog>

      <footer className="bg-white border-t border-gray-100 px-6 py-20 pb-10">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col md:flex-row justify-between items-start gap-12 mb-20">
            <div className="space-y-6">
              <Link href="/" className="flex items-center gap-2.5">
                <div className="relative h-6 w-6 overflow-hidden rounded-lg bg-brand-primary p-1">
                  <Image src="/logo.png" alt="Actiio Logo" width={24} height={24} className="h-full w-full object-contain brightness-0 invert" />
                </div>
                <span className="text-xl font-black tracking-tight text-brand-heading">Actiio</span>
              </Link>
              <p className="max-w-xs text-brand-body/60 font-medium">The intelligent multi-agent platform for modern revenue teams. Scale intelligence, not headcount.</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-16">
              <div className="space-y-4">
                <h4 className="text-xs font-black uppercase tracking-widest text-brand-heading">Platform</h4>
                <ul className="space-y-2 text-sm font-bold text-brand-body/60">
                  <li><a href="#agents-hub" className="hover:text-brand-primary transition-colors">Agents Hub</a></li>
                  <li><a href="#" className="hover:text-brand-primary transition-colors">Pricing Hub</a></li>
                  <li><a href="#" className="hover:text-brand-primary transition-colors">API Documentation</a></li>
                </ul>
              </div>
              <div className="space-y-4">
                <h4 className="text-xs font-black uppercase tracking-widest text-brand-heading">Company</h4>
                <ul className="space-y-2 text-sm font-bold text-brand-body/60">
                  <li><a href="#" className="hover:text-brand-primary transition-colors">About Actiio</a></li>
                  <li><a href="#" className="hover:text-brand-primary transition-colors">The Vision</a></li>
                  <li><a href="#" className="hover:text-brand-primary transition-colors">Contact Support</a></li>
                </ul>
              </div>
            </div>
          </div>

          <div className="pt-8 border-t border-gray-50 flex flex-col sm:flex-row justify-between items-center gap-6">
            <p className="text-xs font-bold text-brand-body/40">© {new Date().getFullYear()} Actiio AI. Made for the builders.</p>
            <div className="flex gap-8 text-[10px] font-black uppercase tracking-widest text-brand-body/40">
              <a href="#" className="hover:text-brand-heading transition-colors">Privacy</a>
              <a href="#" className="hover:text-brand-heading transition-colors">Terms</a>
              <a href="#" className="hover:text-brand-heading transition-colors">Trust</a>
            </div>
          </div>
        </div>
      </footer>

      <style jsx global>{`
        @keyframes float {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-20px) rotate(2deg); }
        }
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.05); }
        }
        @keyframes gradient-x {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        .animate-float { animation: float 6s ease-in-out infinite; }
        .animate-pulse-glow { animation: pulse-glow 4s ease-in-out infinite; }
        .animate-gradient-x { animation: gradient-x 3s linear infinite; }
      `}</style>
    </div>
  );
}
