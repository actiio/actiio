import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Image from "next/image";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-brand-heading selection:bg-brand-primary/20">
      {/* Top Navbar */}
      <nav className="fixed top-0 z-50 w-full border-b border-gray-100 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.png" alt="Actiio Logo" width={32} height={32} className="h-8 w-auto" />
            <span className="text-xl font-bold tracking-tight">Actiio</span>
          </Link>
          <div className="hidden items-center gap-8 md:flex">
            <a href="#how-it-works" className="text-sm font-medium text-brand-body transition-colors hover:text-brand-primary">How it works</a>
            <a href="#pricing" className="text-sm font-medium text-brand-body transition-colors hover:text-brand-primary">Pricing</a>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/sign-in" className="text-sm font-medium text-brand-body hover:text-brand-primary">Sign in</Link>
            <Link href="/sign-up">
              <Button size="sm">Get Started</Button>
            </Link>
          </div>
        </div>
      </nav>

      <main>
        {/* Hero Section */}
        <section className="relative flex min-h-screen flex-col items-center justify-center px-6 pt-20 text-center">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_120%,rgba(0,191,99,0.08),transparent_50%)]" />
          <div className="max-w-4xl space-y-8">
            <h1 className="text-6xl font-bold tracking-tight sm:text-7xl lg:text-8xl">
              Your leads deserve <br />
              <span className="text-brand-primary italic">a follow-up.</span>
            </h1>
            <p className="mx-auto max-w-2xl text-xl leading-relaxed text-brand-body/80">
              Actiio monitors your Gmail and WhatsApp, detects when
              leads go quiet, and drafts the perfect follow-up.
              Automatically.
            </p>
            <div className="flex flex-col items-center justify-center gap-4 pt-4 sm:flex-row">
              <Link href="/sign-up">
                <Button size="lg" className="px-10 py-7 text-lg shadow-xl shadow-brand-primary/20 hover:shadow-2xl hover:shadow-brand-primary/30">
                  Start for free
                </Button>
              </Link>
              <Link href="#how-it-works">
                <Button variant="outline" size="lg" className="px-10 py-7 text-lg">
                  See how it works
                </Button>
              </Link>
            </div>
          </div>

          {/* Floating Feature Cards */}
          <div className="mt-24 grid w-full max-w-6xl gap-6 md:grid-cols-3">
            {[
              {
                title: "Watches your inbox",
                desc: "Monitors Gmail and WhatsApp for sales conversations automatically.",
                icon: (
                  <svg className="h-6 w-6 text-brand-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                ),
              },
              {
                title: "Detects silence",
                desc: "Knows exactly when a lead has gone quiet and flags it for you.",
                icon: (
                  <svg className="h-6 w-6 text-brand-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ),
              },
              {
                title: "Drafts the follow-up",
                desc: "Generates 3 ready-to-send messages with the right tone for the moment.",
                icon: (
                  <svg className="h-6 w-6 text-brand-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                ),
              },
            ].map((f, i) => (
              <Card key={i} className="group relative overflow-hidden border-gray-100 p-8 text-left transition-all hover:border-brand-primary/20">
                <div className="mb-6 inline-flex rounded-2xl bg-brand-primary/10 p-4 transition-colors group-hover:bg-brand-primary/20">
                  {f.icon}
                </div>
                <h3 className="mb-2 text-xl font-bold">{f.title}</h3>
                <p className="text-brand-body/80 leading-relaxed">{f.desc}</p>
              </Card>
            ))}
          </div>
        </section>

        {/* How It Works Section */}
        <section id="how-it-works" className="bg-brand-surface px-6 py-32 text-center">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl font-bold tracking-tight text-brand-heading sm:text-5xl">
              From quiet lead to sent follow-up <br /> in seconds
            </h2>
            <div className="relative mt-24 flex flex-col gap-12 md:flex-row md:items-start md:justify-between">
              {/* Connector line for desktop */}
              <div className="absolute top-8 left-0 hidden h-0.5 w-full bg-gray-200 md:block" />

              {[
                { title: "Connect", desc: "Connect Gmail or WhatsApp" },
                { title: "Identify", desc: "Agent identifies your sales conversations" },
                { title: "Detect", desc: "Detects when a lead goes quiet" },
                { title: "Approve", desc: "You approve a draft and send" },
              ].map((s, i) => (
                <div key={i} className="relative z-10 flex flex-col items-center gap-4 text-center md:flex-1">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-primary text-2xl font-bold text-white shadow-xl shadow-brand-primary/20">
                    {i + 1}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">{s.title}</h3>
                    <p className="mt-2 text-sm text-brand-body/70 max-w-[200px] mx-auto">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Social Proof Stats */}
        <section className="bg-white px-6 py-24">
          <div className="mx-auto grid max-w-4xl grid-cols-1 gap-12 text-center md:grid-cols-3">
            {[
              { label: "Setup time", val: "< 2 min" },
              { label: "Draft options", val: "3 per lead" },
              { label: "Follow-up window", val: "48hr default" },
            ].map((s, i) => (
              <div key={i}>
                <p className="text-4xl font-bold tracking-tight text-brand-heading">{s.val}</p>
                <p className="mt-2 text-sm font-medium uppercase tracking-widest text-brand-body/60">{s.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Pricing Section */}
        <section id="pricing" className="bg-white px-6 pb-40">
          <div className="mx-auto max-w-lg">
            <Card className="overflow-hidden border-2 border-brand-primary/20 p-12 text-center shadow-2xl">
              <div className="inline-block rounded-full bg-brand-primary/10 px-4 py-1 text-sm font-bold text-brand-primary uppercase tracking-widest mb-6">
                Premium
              </div>
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-7xl font-bold tracking-tighter text-brand-heading">$29</span>
                <span className="text-xl font-medium text-brand-body">/month</span>
              </div>
              <p className="mt-4 text-brand-body/60">Everything you need to never lose a lead.</p>

              <ul className="mt-10 space-y-4 text-left">
                {[
                  "Gmail + WhatsApp monitoring",
                  "AI-generated follow-up drafts",
                  "3 tone options (soft, balanced, direct)",
                  "Context-aware messaging",
                  "Unlimited leads",
                  "Cancel anytime",
                ].map((f, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <svg className="h-5 w-5 text-brand-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-brand-heading font-medium">{f}</span>
                  </li>
                ))}
              </ul>

              <Link href="/sign-up" className="block mt-12">
                <Button size="lg" className="w-full py-8 text-lg font-bold">
                  Get started — $29/month
                </Button>
              </Link>
            </Card>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-brand-heading px-6 py-20 text-white">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-12 md:flex-row">
          <div className="space-y-4 text-center md:text-left">
            <Link href="/" className="flex items-center justify-center gap-2 md:justify-start">
              <Image src="/logo.png" alt="Actiio Logo" width={24} height={24} className="h-6 w-auto brightness-0 invert" />
              <span className="text-2xl font-bold tracking-tight">Actiio</span>
            </Link>
            <p className="text-gray-400">Never lose a warm lead again.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-10 text-sm font-medium text-gray-400">
            <a href="#" className="transition-colors hover:text-white">Privacy Policy</a>
            <a href="#" className="transition-colors hover:text-white">Terms of Service</a>
            <a href="#" className="transition-colors hover:text-white">Contact Us</a>
          </div>
        </div>
        <div className="mx-auto mt-20 max-w-7xl border-t border-white/10 pt-8 text-center text-xs text-gray-500">
          © {new Date().getFullYear()} Actiio AI. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
