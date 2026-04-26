"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/* ─── Data ─────────────────────────────────────────────────────────────────── */

const STEPS = [
  {
    num: "01",
    emoji: "📬",
    title: "Connect your Gmail",
    desc: "Link your inbox in seconds. Actiio reads your sales conversations immediately — no manual setup.",
    color: "rgba(0,191,99,0.15)",
    glow: "rgba(0,191,99,0.4)",
  },
  {
    num: "02",
    emoji: "🔍",
    title: "Find at-risk deals",
    desc: "Actiio surfaces threads going cold before they slip out of your pipeline for good.",
    color: "rgba(99,102,241,0.15)",
    glow: "rgba(99,102,241,0.4)",
  },
  {
    num: "03",
    emoji: "✍️",
    title: "Generate a perfect draft",
    desc: "Get a context-aware follow-up grounded in the real conversation — ready to review in one click.",
    color: "rgba(236,72,153,0.12)",
    glow: "rgba(236,72,153,0.4)",
  },
  {
    num: "04",
    emoji: "👀",
    title: "Review & approve",
    desc: "You stay in full control. Tweak the draft if needed, then send when it feels right.",
    color: "rgba(251,146,60,0.12)",
    glow: "rgba(251,146,60,0.4)",
  },
  {
    num: "05",
    emoji: "🔥",
    title: "Deal stays warm",
    desc: "The reply goes out in the existing thread so momentum never quietly dies again.",
    color: "rgba(0,191,99,0.15)",
    glow: "rgba(0,191,99,0.4)",
  },
];

const PROBLEMS = [
  {
    title: "Noisy & Overwhelming",
    desc: "Genuine leads buried under spam while your inbox volume keeps growing.",
    icon: "📩",
  },
  {
    title: "Missed Opportunities",
    desc: "Follow-up keeps getting pushed to tomorrow — until the prospect is already gone.",
    icon: "⏰",
  },
  {
    title: "Quiet Drop-offs",
    desc: "Conversations don't end with a rejection. They just go silent.",
    icon: "📉",
  },
];


/* ─── Hooks ─────────────────────────────────────────────────────────────────── */

function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, inView };
}

function useCountUp(target: number, duration = 1800, active = false) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!active) return;
    let start: number | null = null;
    const step = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      setVal(Math.round(p * p * target));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [active, target, duration]);
  return val;
}

/* ─── Sub-components ─────────────────────────────────────────────────────────── */

function StatCard({ val, suffix, label, delay }: { val: number; suffix: string; label: string; delay: number }) {
  const { ref, inView } = useInView(0.3);
  const count = useCountUp(val, 1600, inView);
  return (
    <div ref={ref} className="lp__stat" style={{ animationDelay: `${delay}ms` }}>
      <div className="lp__stat-num">
        <span className="lp__stat-val">{count}</span>
        <span className="lp__stat-suffix">{suffix}</span>
      </div>
      <p className="lp__stat-label">{label}</p>
    </div>
  );
}

/* ─── Component ─────────────────────────────────────────────────────────────── */

export function LandingPageClient({ isAuthenticated }: { isAuthenticated: boolean }) {
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });
  const [signedIn, setSignedIn] = useState(isAuthenticated);
  const [signingOut, setSigningOut] = useState(false);
  const heroRef = useRef<HTMLElement>(null);
  const { ref: psRef, inView: psInView } = useInView();
  const { ref: hiwRef, inView: hiwInView } = useInView();
  const { ref: ctaRef, inView: ctaInView } = useInView();
  const { ref: statsRef, inView: statsInView } = useInView(0.2);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setSignedIn(isAuthenticated);
  }, [isAuthenticated]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const hero = heroRef.current;
      if (!hero) return;
      const rect = hero.getBoundingClientRect();
      if (e.clientY > rect.bottom) return;
      setMousePos({
        x: ((e.clientX - rect.left) / rect.width) * 100,
        y: ((e.clientY - rect.top) / rect.height) * 100,
      });
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setSignedIn(false);

    try {
      const { supabase } = await import("@/lib/supabase");
      await supabase.auth.signOut();
      router.refresh();
    } catch (err: unknown) {
      setSignedIn(true);
      console.error("Sign out error:", err);
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <main className="lp">
      {/* ── Canvas noise + orbs ─────────────────────────────────── */}
      <div className="lp__bg" aria-hidden="true">
        <div className="lp__noise" />
        <div className="lp__grid" />
        <div className="lp__orb lp__orb--1" />
        <div className="lp__orb lp__orb--2" />
        <div className="lp__orb lp__orb--3" />
        <div
          className="lp__cursor-glow"
          style={{ left: `${mousePos.x}%`, top: `${mousePos.y}%` }}
        />
      </div>

      {/* ── Navbar ────────────────────────────────────────────────────── */}
      <nav className={`lp__nav${scrolled ? " lp__nav--solid" : ""}`}>
        <div className="lp__nav-inner">
          <Link href="/" className="lp__logo">
            <Image src="/logo.png" alt="Actiio" width={34} height={34} className="lp__logo-img" />
            <span className="lp__logo-name">Actiio</span>
          </Link>

          <div className="lp__nav-actions">
            {!signedIn ? (
              <>
                <Link href="/sign-in" className="lp__nav-link">Sign In</Link>
                <Link href="/sign-up" className="lp__btn lp__btn--primary lp__btn--sm">Get Started</Link>
              </>
            ) : (
              <>
                <button onClick={handleSignOut} className="lp__nav-link lp__nav-link--muted" disabled={signingOut}>
                  {signingOut ? "Signing Out..." : "Sign Out"}
                </button>
                <Link href="/agents" className="lp__btn lp__btn--primary lp__btn--sm">Go to Platform</Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="lp__hero" ref={heroRef}>
        {/* Floating cards */}
        <div className="lp__float lp__float--tl lp__anim" style={{ animationDelay: "600ms" }}>
          <span className="lp__float-icon">⚡</span>
          <div>
            <p className="lp__float-val">Auto-drafted</p>
            <p className="lp__float-sub">follow-up in 4s</p>
          </div>
        </div>
        <div className="lp__float lp__float--tr lp__anim" style={{ animationDelay: "750ms" }}>
          <span className="lp__float-icon">🎯</span>
          <div>
            <p className="lp__float-val">Deal recovered</p>
            <p className="lp__float-sub lp__float-sub--g">+$12,400</p>
          </div>
        </div>
        <div className="lp__float lp__float--bl lp__anim" style={{ animationDelay: "900ms" }}>
          <span className="lp__float-icon">📊</span>
          <div>
            <p className="lp__float-val">Pipeline health</p>
            <p className="lp__float-sub lp__float-sub--g">↑ 38%</p>
          </div>
        </div>

        <div className="lp__hero-inner">
          <div className="lp__badge lp__anim" style={{ animationDelay: "0ms" }}>
            <span className="lp__badge-dot" />
            Introducing the Gmail Follow-up Agent
          </div>

          <h1 className="lp__headline lp__anim" style={{ animationDelay: "80ms" }}>
            <span className="lp__headline-line">Deals don't die with a no.</span>
            <span className="lp__headline-line">They fade with</span>
            <span className="lp__headline-word">Silence.</span>
          </h1>

          <p className="lp__sub lp__anim" style={{ animationDelay: "160ms" }}>
            Actiio is an AI platform built for sales workflows. Our specialized agent
            ensures your warm leads never go cold — starting straight from your inbox.
          </p>

          <div className="lp__ctas lp__anim" style={{ animationDelay: "240ms" }}>
            <Link href={isAuthenticated ? "/agents" : "/sign-up"} className="lp__btn lp__btn--hero lp__btn--glow">
              {isAuthenticated ? "Enter the App" : "Start Automating Follow-ups"}
              <svg className="lp__btn-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </Link>
            <a href="#how-it-works" className="lp__btn lp__btn--ghost lp__btn--hero">
              See how it works
              <svg className="lp__btn-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </a>
          </div>

          {/* Trust badges */}
          <div className="lp__trust lp__anim" style={{ animationDelay: "380ms" }}>
            <span className="lp__trust-item">
              <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="lp__trust-icon">
                <path d="M7 1l1.6 3.3 3.6.5-2.6 2.5.6 3.6L7 9.3 3.8 11l.6-3.6L2 4.8l3.6-.5z" />
              </svg>
              No credit card required
            </span>
            <span className="lp__trust-dot" />
            <span className="lp__trust-item">
              <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="lp__trust-icon">
                <rect x="2" y="6" width="10" height="7" rx="1.5" /><path d="M4.5 6V4a2.5 2.5 0 015 0v2" />
              </svg>
              SOC 2 ready infrastructure
            </span>
            <span className="lp__trust-dot" />
            <span className="lp__trust-item">
              <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="lp__trust-icon">
                <path d="M7 1.5v11M1.5 7h11" />
              </svg>
              Setup in 60 seconds
            </span>
          </div>
        </div>
      </section>

      {/* ── Video ─────────────────────────────────────────────────────── */}
      <section className="lp__video-wrap lp__anim" style={{ animationDelay: "500ms" }}>
        <div className="lp__video-header">
          <p className="lp__eyebrow" style={{ textAlign: "center" }}>See it in action</p>
          <h2 className="lp__section-title" style={{ textAlign: "center", marginBottom: "0" }}>
            From inbox to deal, in minutes.
          </h2>
          <p className="lp__section-sub" style={{ textAlign: "center" }}>
            Watch how Actiio detects a cold thread, drafts the perfect follow-up, and puts you back in the conversation.
          </p>
        </div>
        <div className="lp__video-shell">
          <div className="lp__video-shine" />
          <div className="lp__video-topbar">
            <span className="lp__video-dot lp__video-dot--r" />
            <span className="lp__video-dot lp__video-dot--y" />
            <span className="lp__video-dot lp__video-dot--g" />
            <span className="lp__video-title">Actiio — Gmail Follow-up Agent</span>
          </div>
          <div className="lp__video-inner">
            <video className="lp__video" autoPlay muted loop playsInline controls preload="metadata">
              <source src="/main%20product%20video.mp4" type="video/mp4" />
            </video>
          </div>
        </div>
      </section>


      {/* ── Problem / Solution ─────────────────────────────────────────── */}
      <section className="lp__ps" ref={psRef}>
        <div className="lp__container lp__ps-inner">
          <div className={`lp__ps-left lp__reveal${psInView ? " lp__reveal--in" : ""}`}>
            <p className="lp__eyebrow">The Problem</p>
            <h2 className="lp__section-title">
              The biggest leak in your<br />
              pipeline is the <span className="lp__green">inbox.</span>
            </h2>
            <div className="lp__problems">
              {PROBLEMS.map((p, i) => (
                <div key={i} className="lp__problem" style={{ transitionDelay: `${i * 80}ms` }}>
                  <span className="lp__problem-icon">{p.icon}</span>
                  <div>
                    <p className="lp__problem-title">{p.title}</p>
                    <p className="lp__problem-desc">{p.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={`lp__ps-right lp__reveal${psInView ? " lp__reveal--in" : ""}`} style={{ transitionDelay: "180ms" }}>
            <div className="lp__sol-card">
              <div className="lp__sol-glow" />
              <div className="lp__sol-shimmer" />
              <div className="lp__sol-body">
                <span className="lp__tag">The Solution</span>
                <h3 className="lp__sol-title">A Gmail Follow-up Agent.</h3>
                <ul className="lp__features">
                  {[
                    { text: "Syncs securely with your Gmail inbox", icon: "🔒" },
                    { text: "Automatically classifies warm leads", icon: "🤖" },
                    { text: "Detects conversation silence", icon: "🔔" },
                    { text: "Generates contextual drafts for your approval", icon: "✨" },
                  ].map((f, i) => (
                    <li key={i} className="lp__feature">
                      <span className="lp__feature-icon">{f.icon}</span>
                      {f.text}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────────── */}
      <section id="how-it-works" className="lp__hiw" ref={hiwRef}>
        <div className="lp__container">
          <div className={`lp__section-header lp__reveal${hiwInView ? " lp__reveal--in" : ""}`}>
            <p className="lp__eyebrow">How it works</p>
            <h2 className="lp__section-title">
              From cold threads to{" "}
              <span className="lp__green">closed deals.</span>
            </h2>
            <p className="lp__section-sub">
              Five steps. Zero admin. Your pipeline stays alive on autopilot.
            </p>
          </div>

          <div className="lp__steps">
            {STEPS.map((s, i) => (
              <div
                key={i}
                className={`lp__step lp__reveal${hiwInView ? " lp__reveal--in" : ""}`}
                style={{ transitionDelay: `${i * 90}ms`, "--step-color": s.color, "--step-glow": s.glow } as React.CSSProperties}
              >
                <div className="lp__step-top">
                  <div className="lp__step-icon">
                    <span className="lp__step-emoji">{s.emoji}</span>
                  </div>
                  <span className="lp__step-num">{s.num}</span>
                </div>
                <h3 className="lp__step-title">{s.title}</h3>
                <p className="lp__step-desc">{s.desc}</p>
                <div className="lp__step-bar" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ────────────────────────────────────────────────── */}
      <section className="lp__cta-wrap" ref={ctaRef}>
        <div className="lp__container">
          <div className={`lp__cta-card lp__reveal${ctaInView ? " lp__reveal--in" : ""}`}>
            <div className="lp__cta-glow" />
            <div className="lp__cta-grid-overlay" />
            <div className="lp__cta-body">
              <span className="lp__badge" style={{ marginBottom: "1.5rem" }}>
                <span className="lp__badge-dot" />
                Limited Early Access
              </span>
              <h2 className="lp__cta-title">
                Ready to stop losing<br />warm leads?
              </h2>
              <p className="lp__cta-sub">
                Join the teams that use Actiio to maintain deal momentum
                with zero extra admin effort.
              </p>
              <Link href={isAuthenticated ? "/agents" : "/sign-up"} className="lp__btn lp__btn--hero lp__btn--glow">
                {isAuthenticated ? "Enter the App" : "Get Started Now"}
                <svg className="lp__btn-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </Link>
              <p className="lp__cta-fine">No credit card · Cancel anytime</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer className="lp__footer">
        <div className="lp__container lp__footer-inner">
          <div className="lp__footer-brand">
            <Image src="/logo.png" alt="Actiio" width={26} height={26} className="lp__footer-logo" />
            <span className="lp__footer-name">Actiio</span>
          </div>
          <p className="lp__footer-contact">Have questions or need a custom setup?</p>
          <a href="mailto:business@actiio.co" className="lp__footer-email">business@actiio.co</a>
          <div className="lp__footer-bottom">
            <span>© {new Date().getFullYear()} Actiio AI. All rights reserved.</span>
            <div className="lp__footer-links">
              <Link href="/privacy" className="lp__footer-link">Privacy Policy</Link>
              <Link href="/terms" className="lp__footer-link">Terms of Service</Link>
            </div>
          </div>
        </div>
      </footer>

      {/* ── Styles ────────────────────────────────────────────────────── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

        /* ─ Root / tokens ──────────────────────────────── */
        .lp {
          --g: #00bf63;
          --g-bright: #00e87a;
          --g-dim: rgba(0,191,99,0.10);
          --g-dim2: rgba(0,191,99,0.06);
          --g-border: rgba(0,191,99,0.22);
          --g-glow: rgba(0,191,99,0.30);
          --violet: rgba(99,102,241,0.70);
          --violet-dim: rgba(99,102,241,0.08);
          --pink: rgba(236,72,153,0.70);
          --ink: #ffffff;
          --ink-80: rgba(255,255,255,0.80);
          --ink-70: rgba(255,255,255,0.70);
          --ink-50: rgba(255,255,255,0.50);
          --ink-45: rgba(255,255,255,0.45);
          --ink-20: rgba(255,255,255,0.20);
          --ink-10: rgba(255,255,255,0.10);
          --ink-08: rgba(255,255,255,0.08);
          --ink-05: rgba(255,255,255,0.05);
          --ink-04: rgba(255,255,255,0.04);
          --bg: #06070a;
          --card: rgba(255,255,255,0.035);
          --pill: 9999px;
          --r-lg: 1.25rem;
          --r-xl: 1.75rem;
          --r-2xl: 2.25rem;
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          background: var(--bg);
          color: var(--ink);
          overflow-x: hidden;
          min-height: 100vh;
          -webkit-font-smoothing: antialiased;
        }

        /* ─ Background ─────────────────────────────────── */
        .lp__bg {
          position: fixed; inset: 0; z-index: 0; pointer-events: none;
          overflow: hidden;
        }

        /* Grain noise overlay */
        .lp__noise {
          position: absolute; inset: -50%;
          width: 200%; height: 200%;
          opacity: 0.028;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
          background-size: 256px 256px;
          animation: noiseShift 0.5s steps(2) infinite;
        }
        @keyframes noiseShift {
          0%   { transform: translate(0, 0); }
          25%  { transform: translate(-2%, 1%); }
          50%  { transform: translate(1%, -2%); }
          75%  { transform: translate(-1%, 1.5%); }
          100% { transform: translate(0.5%, -0.5%); }
        }

        .lp__grid {
          position: absolute; inset: 0;
          background-image:
            linear-gradient(to right,  rgba(255,255,255,0.028) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.028) 1px, transparent 1px);
          background-size: 48px 48px;
          mask-image: radial-gradient(ellipse 90% 60% at 50% 0%, #000 50%, transparent 100%);
        }

        .lp__orb {
          position: absolute; border-radius: 9999px; filter: blur(120px);
          animation: orbPulse 12s ease-in-out infinite;
        }
        .lp__orb--1 {
          top: -18%; left: -12%; width: 55%; height: 55%; opacity: 0.60;
          background: radial-gradient(circle, rgba(0,191,99,0.20) 0%, transparent 65%);
        }
        .lp__orb--2 {
          top: 25%; right: -15%; width: 42%; height: 62%; opacity: 0.40;
          background: radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 65%);
          animation-delay: 5s;
        }
        .lp__orb--3 {
          bottom: -10%; left: 30%; width: 38%; height: 38%; opacity: 0.30;
          background: radial-gradient(circle, rgba(236,72,153,0.14) 0%, transparent 65%);
          animation-delay: 8s; animation-duration: 15s;
        }
        @keyframes orbPulse {
          0%,100% { opacity: 0.40; transform: scale(1) translate(0,0); }
          33%      { opacity: 0.65; transform: scale(1.07) translate(1%,-1%); }
          66%      { opacity: 0.50; transform: scale(0.96) translate(-1%,1%); }
        }

        /* Interactive cursor glow */
        .lp__cursor-glow {
          position: absolute;
          width: 700px; height: 700px;
          border-radius: 9999px;
          background: radial-gradient(circle, rgba(0,191,99,0.06) 0%, transparent 65%);
          transform: translate(-50%, -50%);
          pointer-events: none;
          transition: left 0.6s ease, top 0.6s ease;
          filter: blur(30px);
        }

        /* ─ Layout ─────────────────────────────────────── */
        .lp__container { max-width: 72rem; margin: 0 auto; padding: 0 1.5rem; }

        /* ─ Animations ─────────────────────────────────── */
        .lp__anim {
          opacity: 0; transform: translateY(24px);
          animation: fadeUp 0.78s cubic-bezier(0.16,1,0.3,1) forwards;
        }
        @keyframes fadeUp {
          to { opacity: 1; transform: translateY(0); }
        }

        /* Scroll-triggered reveal */
        .lp__reveal {
          opacity: 0; transform: translateY(32px);
          transition: opacity 0.75s cubic-bezier(0.16,1,0.3,1), transform 0.75s cubic-bezier(0.16,1,0.3,1);
        }
        .lp__reveal--in { opacity: 1; transform: translateY(0); }

        /* ─ Navbar ─────────────────────────────────────── */
        .lp__nav {
          position: fixed; top: 0; left: 0; right: 0; z-index: 100;
          padding: 1rem 1.5rem;
          border-bottom: 1px solid transparent;
          transition: background 0.35s, border-color 0.35s, backdrop-filter 0.35s;
        }
        .lp__nav--solid {
          background: rgba(6,7,10,0.82);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border-color: var(--ink-08);
        }
        .lp__nav-inner {
          max-width: 72rem; margin: 0 auto;
          display: flex; align-items: center; justify-content: space-between;
        }
        .lp__logo { display: flex; align-items: center; gap: 0.625rem; text-decoration: none; }
        .lp__logo-img { width: 2rem; height: 2rem; object-fit: contain; }
        .lp__logo-name {
          font-size: 1.25rem; font-weight: 900; letter-spacing: -0.03em; color: var(--ink);
        }
        .lp__nav-actions { display: flex; align-items: center; gap: 1rem; }
        .lp__nav-link {
          font-size: 0.875rem; font-weight: 500; color: var(--ink-50);
          text-decoration: none; background: none; border: none; cursor: pointer;
          transition: color 0.2s;
        }
        .lp__nav-link:hover { color: var(--ink); }
        .lp__nav-link--muted:hover { color: #f87171; }

        /* ─ Buttons ─────────────────────────────────────── */
        .lp__btn {
          display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem;
          font-weight: 700; border-radius: var(--pill); text-decoration: none;
          border: none; cursor: pointer; transition: all 0.22s; white-space: nowrap;
          font-family: inherit;
        }
        .lp__btn--sm  { height: 2.375rem; padding: 0 1.125rem; font-size: 0.8125rem; }
        .lp__btn--hero{ height: 3.375rem; padding: 0 2rem; font-size: 0.9375rem; }
        .lp__btn--primary { background: var(--g); color: #000; }
        .lp__btn--primary:hover { background: var(--g-bright); transform: scale(1.03); }
        .lp__btn--primary:active { transform: scale(0.97); }
        .lp__btn--glow {
          background: linear-gradient(135deg, var(--g) 0%, var(--g-bright) 100%);
          color: #000;
          box-shadow: 0 0 0 0 var(--g-glow), 0 4px 24px rgba(0,191,99,0.20);
          transition: all 0.25s;
          position: relative; overflow: hidden;
        }
        .lp__btn--glow::after {
          content: '';
          position: absolute; inset: 0;
          background: linear-gradient(135deg, transparent 0%, rgba(255,255,255,0.15) 100%);
          opacity: 0; transition: opacity 0.25s;
        }
        .lp__btn--glow:hover {
          transform: scale(1.04) translateY(-1px);
          box-shadow: 0 0 40px 8px var(--g-glow), 0 8px 32px rgba(0,191,99,0.30);
        }
        .lp__btn--glow:hover::after { opacity: 1; }
        .lp__btn--glow:active { transform: scale(0.98); }
        .lp__btn--ghost {
          background: rgba(255,255,255,0.05); color: var(--ink-70);
          border: 1px solid var(--ink-10);
          backdrop-filter: blur(8px);
        }
        .lp__btn--ghost:hover { background: var(--ink-08); color: var(--ink); border-color: var(--ink-20); }
        .lp__btn-arrow { width: 1rem; height: 1rem; flex-shrink: 0; transition: transform 0.2s; }
        .lp__btn:hover .lp__btn-arrow { transform: translateX(3px); }

        /* ─ Hero ─────────────────────────────────────────── */
        .lp__hero {
          position: relative; z-index: 10;
          min-height: 90vh;
          display: flex; align-items: center; justify-content: center;
          padding: 6rem 1.25rem 4rem;
          overflow: hidden;
        }
        @media(min-width: 1024px) {
          .lp__hero { padding: 9rem 1.5rem 6rem; }
        }
        .lp__hero-inner {
          max-width: 72rem; margin: 0 auto; text-align: center;
          display: flex; flex-direction: column; align-items: center;
        }

        /* Floating cards */
        .lp__float {
          position: absolute; z-index: 20;
          display: flex; align-items: center; gap: 0.75rem;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.10);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-radius: 1rem;
          padding: 0.75rem 1rem;
          box-shadow: 0 8px 32px rgba(0,0,0,0.40);
          animation: floatCard 6s ease-in-out infinite;
        }
        .lp__float--tl { top: 20%; left: 2%; animation-delay: 0s; }
        .lp__float--tr { top: 24%; right: 2%; animation-delay: 2s; }
        .lp__float--bl { bottom: 14%; left: 4%; animation-delay: 4s; }
        @keyframes floatCard {
          0%,100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        .lp__float-icon { font-size: 1.5rem; line-height: 1; flex-shrink: 0; }
        .lp__float-val { font-size: 0.75rem; font-weight: 700; color: var(--ink-80); margin: 0; line-height: 1.3; }
        .lp__float-sub { font-size: 0.7rem; font-weight: 500; color: var(--ink-50); margin: 0; line-height: 1.3; }
        .lp__float-sub--g { color: var(--g); }
        @media(max-width: 1100px) { .lp__float { display: none; } }

        /* Badge */
        .lp__badge {
          display: inline-flex; align-items: center; gap: 0.5rem;
          padding: 0.375rem 1rem; border-radius: var(--pill);
          border: 1px solid var(--g-border); background: var(--g-dim2);
          color: var(--g); font-size: 0.75rem; font-weight: 700;
          letter-spacing: 0.04em; margin-bottom: 2rem;
          box-shadow: 0 0 16px rgba(0,191,99,0.12);
        }
        .lp__badge-dot {
          width: 6px; height: 6px; border-radius: 9999px;
          background: var(--g); flex-shrink: 0;
          box-shadow: 0 0 6px 2px rgba(0,191,99,0.6);
          animation: dotPing 2s ease-in-out infinite;
        }
        @keyframes dotPing {
          0%,100% { box-shadow: 0 0 6px 2px rgba(0,191,99,0.5); transform: scale(1); }
          50%      { box-shadow: 0 0 12px 5px rgba(0,191,99,0.85); transform: scale(1.15); }
        }

        /* Headline */
        .lp__headline {
          display: flex; flex-direction: column; align-items: center;
          font-weight: 900; letter-spacing: -0.028em; color: var(--ink);
          margin: 0 0 1.75rem; line-height: 1.10;
        }
        .lp__headline-line {
          font-size: clamp(1.5rem, 6vw, 3rem);
          display: block; color: var(--ink-80);
        }
        .lp__headline-word {
          display: block;
          font-size: clamp(3.5rem, 15vw, 9rem);
          line-height: 1.0;
          letter-spacing: -0.05em;
          background: linear-gradient(130deg, #00bf63 0%, #00e87a 40%, #34d399 65%, #ffffff 100%);
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent;
          margin-top: 0.1em;
          filter: drop-shadow(0 0 40px rgba(0,191,99,0.35));
        }

        .lp__sub {
          font-size: clamp(1rem, 1.8vw, 1.2rem); color: var(--ink-50);
          line-height: 1.75; max-width: 48rem; margin: 0 0 2.25rem;
          font-weight: 400;
        }
        .lp__ctas { display: flex; flex-wrap: wrap; gap: 0.875rem; align-items: center; justify-content: center; }

        /* Trust row */
        .lp__trust {
          display: flex; flex-wrap: wrap; align-items: center; justify-content: center;
          gap: 0.75rem; margin-top: 2.25rem;
          max-width: 22rem; margin-inline: auto;
        }
        @media(min-width: 640px) {
          .lp__trust { max-width: none; }
        }
        .lp__trust-item {
          display: flex; align-items: center; gap: 0.35rem;
          font-size: 0.75rem; font-weight: 600; color: var(--ink-45);
          letter-spacing: 0.01em;
        }
        .lp__trust-icon { width: 0.8rem; height: 0.8rem; opacity: 0.6; }
        .lp__trust-dot { width: 3px; height: 3px; border-radius: 9999px; background: var(--ink-20); }

        /* ─ Video ─────────────────────────────────────────── */
        .lp__video-wrap {
          position: relative; z-index: 10;
          padding: 0 1.25rem 4rem;
          display: flex; flex-direction: column; align-items: center; gap: 2rem;
        }
        @media(min-width: 1024px) {
          .lp__video-wrap { padding: 0 1.5rem 6rem; gap: 3rem; }
        }
        .lp__video-header {
          max-width: 42rem; text-align: center;
          display: flex; flex-direction: column; gap: 0.75rem;
        }
        .lp__video-shell {
          width: 100%; max-width: 72rem; position: relative;
          border-radius: var(--r-2xl);
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.03);
          box-shadow:
            0 50px 120px rgba(0,0,0,0.70),
            0 0 0 1px rgba(255,255,255,0.04),
            0 0 60px rgba(0,191,99,0.06);
          overflow: hidden;
        }
        .lp__video-shine {
          position: absolute; left: 10%; right: 10%; top: 0; height: 1px;
          background: linear-gradient(to right, transparent, rgba(255,255,255,0.30), transparent);
          pointer-events: none; z-index: 2;
        }
        .lp__video-topbar {
          display: flex; align-items: center; gap: 0.5rem;
          padding: 0.75rem 1.125rem;
          background: rgba(255,255,255,0.03);
          border-bottom: 1px solid rgba(255,255,255,0.06);
          position: relative; z-index: 2;
        }
        .lp__video-dot {
          width: 12px; height: 12px; border-radius: 9999px; flex-shrink: 0;
        }
        .lp__video-dot--r { background: #ff5f57; }
        .lp__video-dot--y { background: #febc2e; }
        .lp__video-dot--g { background: #28c840; }
        .lp__video-title {
          margin-left: auto; margin-right: auto;
          font-size: 0.75rem; font-weight: 600; color: var(--ink-30, rgba(255,255,255,0.30));
          letter-spacing: 0.02em;
        }
        .lp__video-inner {
          aspect-ratio: 16/9; background: #040507;
        }
        .lp__video { width: 100%; height: 100%; object-fit: cover; display: block; }

        /* ─ Stats ─────────────────────────────────────────── */
        .lp__stats-section {
          position: relative; z-index: 10;
          padding: 3rem 0 5rem;
        }
        .lp__stats-grid {
          display: grid;
          grid-template-columns: repeat(1, 1fr);
          gap: 1px;
          background: var(--ink-08);
          border-radius: var(--r-xl);
          overflow: hidden;
          border: 1px solid var(--ink-08);
        }
        @media(min-width: 640px) {
          .lp__stats-grid { grid-template-columns: repeat(3, 1fr); }
        }
        .lp__stat {
          background: rgba(6,7,10,0.95);
          padding: 2.5rem 2rem;
          text-align: center;
          position: relative;
          overflow: hidden;
          transition: background 0.25s;
        }
        .lp__stat::before {
          content: ''; position: absolute; inset: 0;
          background: radial-gradient(ellipse 80% 60% at 50% 0%, rgba(0,191,99,0.07) 0%, transparent 70%);
          opacity: 0; transition: opacity 0.3s;
        }
        .lp__stat:hover { background: rgba(0,191,99,0.04); }
        .lp__stat:hover::before { opacity: 1; }
        .lp__stat-num {
          display: flex; align-items: baseline; justify-content: center; gap: 0.1em;
          margin-bottom: 0.5rem;
        }
        .lp__stat-val {
          font-size: clamp(2.5rem, 5vw, 3.75rem); font-weight: 900;
          letter-spacing: -0.04em;
          background: linear-gradient(130deg, var(--g) 0%, var(--g-bright) 100%);
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent;
          line-height: 1;
        }
        .lp__stat-suffix {
          font-size: clamp(1.5rem, 3vw, 2.25rem); font-weight: 900;
          background: linear-gradient(130deg, var(--g) 0%, var(--g-bright) 100%);
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent;
          letter-spacing: -0.02em;
        }
        .lp__stat-label {
          font-size: 0.8125rem; color: var(--ink-45); line-height: 1.5; margin: 0;
          max-width: 16rem; margin-inline: auto; font-weight: 500;
        }

        /* ─ Problem / Solution ───────────────────────────── */
        .lp__ps {
          position: relative; z-index: 10;
          padding: 4rem 0;
          border-top: 1px solid var(--ink-08);
          border-bottom: 1px solid var(--ink-08);
          background:
            linear-gradient(180deg, rgba(0,191,99,0.03) 0%, transparent 50%),
            linear-gradient(0deg, rgba(99,102,241,0.03) 0%, transparent 50%);
        }
        @media(min-width: 1024px) {
          .lp__ps { padding: 6rem 0; }
        }
        .lp__ps-inner {
          display: flex; flex-direction: column; gap: 4rem;
        }
        @media(min-width: 1024px) {
          .lp__ps-inner { flex-direction: row; align-items: center; gap: 5rem; }
        }
        .lp__ps-left, .lp__ps-right { flex: 1; }

        .lp__eyebrow {
          font-size: 0.6875rem; font-weight: 800; letter-spacing: 0.20em;
          text-transform: uppercase; color: var(--g); margin: 0 0 1rem;
        }
        .lp__section-title {
          font-size: clamp(1.875rem, 3.8vw, 3rem);
          font-weight: 900; line-height: 1.10; letter-spacing: -0.028em;
          color: var(--ink); margin: 0 0 2rem;
        }
        .lp__muted { color: var(--ink-20); }
        .lp__green { color: var(--g); }

        .lp__problems { display: flex; flex-direction: column; gap: 1.25rem; }
        .lp__problem {
          display: flex; gap: 1rem; align-items: flex-start;
          padding: 1.125rem; border-radius: 0.875rem;
          border: 1px solid transparent;
          transition: background 0.25s, border-color 0.25s, transform 0.25s;
          cursor: default;
        }
        .lp__problem:hover {
          background: rgba(255,255,255,0.03);
          border-color: var(--ink-08);
          transform: translateX(4px);
        }
        .lp__problem-icon {
          font-size: 1.5rem; line-height: 1; flex-shrink: 0; margin-top: 1px;
          filter: grayscale(40%) opacity(0.75);
          transition: filter 0.25s;
        }
        .lp__problem:hover .lp__problem-icon { filter: none; }
        .lp__problem-title {
          font-size: 0.9375rem; font-weight: 700; color: var(--ink-70); margin: 0 0 0.25rem;
        }
        .lp__problem-desc {
          font-size: 0.875rem; color: var(--ink-45); line-height: 1.65; margin: 0;
        }

        /* Solution card */
        .lp__sol-card {
          position: relative; overflow: hidden;
          border-radius: var(--r-2xl);
          border: 1px solid var(--g-border);
          background: linear-gradient(145deg, rgba(0,191,99,0.08) 0%, rgba(0,0,0,0) 60%);
          transition: border-color 0.3s, transform 0.3s, box-shadow 0.3s;
          box-shadow: 0 0 0 0 rgba(0,191,99,0);
        }
        .lp__sol-card:hover {
          border-color: rgba(0,191,99,0.40);
          transform: translateY(-4px);
          box-shadow: 0 20px 60px rgba(0,0,0,0.50), 0 0 40px rgba(0,191,99,0.10);
        }
        .lp__sol-glow {
          position: absolute; top: -6rem; right: -6rem;
          width: 22rem; height: 22rem; border-radius: 9999px;
          background: radial-gradient(circle, rgba(0,191,99,0.20) 0%, transparent 65%);
          filter: blur(50px); pointer-events: none;
        }
        /* shimmer line */
        .lp__sol-shimmer {
          position: absolute; left: 10%; right: 10%; top: 0; height: 1px;
          background: linear-gradient(to right, transparent, rgba(0,191,99,0.40), transparent);
          pointer-events: none;
        }
        .lp__sol-body { position: relative; z-index: 1; padding: 2.5rem; }
        .lp__tag {
          display: inline-flex; align-items: center;
          padding: 0.25rem 0.75rem; border-radius: var(--pill);
          border: 1px solid var(--g-border); background: var(--g-dim);
          color: var(--g); font-size: 0.6875rem; font-weight: 800;
          letter-spacing: 0.15em; text-transform: uppercase; margin-bottom: 1.25rem;
        }
        .lp__sol-title {
          font-size: 1.875rem; font-weight: 900; letter-spacing: -0.025em;
          color: var(--ink); margin: 0 0 1.75rem;
        }
        .lp__features { list-style: none; padding: 0; margin: 0 0 2rem; display: flex; flex-direction: column; gap: 0.875rem; }
        .lp__feature {
          display: flex; align-items: center; gap: 0.875rem;
          font-size: 0.9375rem; font-weight: 500; color: var(--ink-70);
          padding: 0.625rem 0;
          border-bottom: 1px solid var(--ink-05);
        }
        .lp__feature:last-child { border-bottom: none; }
        .lp__feature-icon { font-size: 1.125rem; line-height: 1; flex-shrink: 0; }
        .lp__sol-cta { margin-top: 0.5rem; }

        /* ─ How it works ─────────────────────────────────── */
        .lp__hiw {
          position: relative; z-index: 10;
          padding: 7rem 0;
        }
        .lp__section-header {
          text-align: center; max-width: 38rem; margin: 0 auto 4rem;
        }
        .lp__section-sub {
          font-size: 1rem; color: var(--ink-45); line-height: 1.7; margin: 0.875rem 0 0;
        }

        .lp__steps {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1px;
          background: var(--ink-08);
          border-radius: var(--r-xl);
          overflow: hidden;
          border: 1px solid var(--ink-08);
        }
        @media(min-width: 640px) {
          .lp__steps { grid-template-columns: repeat(2, 1fr); }
        }
        @media(min-width: 1024px) {
          .lp__steps { grid-template-columns: repeat(3, 1fr); }
        }

        .lp__step {
          position: relative;
          background: var(--bg);
          padding: 2.25rem;
          display: flex; flex-direction: column;
          transition: background 0.30s, transform 0.30s;
          overflow: hidden;
        }
        .lp__step::before {
          content: '';
          position: absolute; top: 0; left: 0; right: 0;
          height: 3px;
          background: linear-gradient(to right, var(--step-color, var(--g-dim)), transparent);
          opacity: 0; transition: opacity 0.3s;
        }
        .lp__step:hover { background: rgba(255,255,255,0.028); }
        .lp__step:hover::before { opacity: 1; }

        /* Step inner glow on hover */
        .lp__step::after {
          content: '';
          position: absolute; top: 0; left: 0; right: 0; bottom: 0;
          background: radial-gradient(ellipse 80% 50% at 50% 0%, var(--step-color, var(--g-dim)) 0%, transparent 70%);
          opacity: 0; transition: opacity 0.35s;
          pointer-events: none;
        }
        .lp__step:hover::after { opacity: 1; }

        .lp__step-bar {
          position: absolute; bottom: 0; left: 0; right: 0; height: 2px;
          background: linear-gradient(to right, var(--step-glow, var(--g-glow)), transparent);
          transform: scaleX(0); transform-origin: left;
          transition: transform 0.4s cubic-bezier(0.16,1,0.3,1);
        }
        .lp__step:hover .lp__step-bar { transform: scaleX(1); }

        .lp__step-top {
          display: flex; align-items: flex-start; justify-content: space-between;
          margin-bottom: 1.5rem; position: relative; z-index: 1;
        }
        .lp__step-icon {
          display: flex; align-items: center; justify-content: center;
          width: 3rem; height: 3rem; border-radius: 0.875rem;
          background: var(--step-color, var(--g-dim));
          border: 1px solid rgba(255,255,255,0.10);
          transition: background 0.30s, transform 0.30s, box-shadow 0.30s;
        }
        .lp__step:hover .lp__step-icon {
          transform: scale(1.08) rotate(-3deg);
          box-shadow: 0 8px 24px var(--step-glow, var(--g-glow));
        }
        .lp__step-emoji { font-size: 1.375rem; line-height: 1; display: block; }
        .lp__step-num {
          font-size: 2rem; font-weight: 900;
          color: rgba(255,255,255,0.06); letter-spacing: -0.05em;
          user-select: none; line-height: 1;
          transition: color 0.25s;
        }
        .lp__step:hover .lp__step-num { color: rgba(255,255,255,0.12); }
        .lp__step-title {
          font-size: 1rem; font-weight: 700; color: var(--ink);
          margin: 0 0 0.5rem; letter-spacing: -0.01em;
          position: relative; z-index: 1;
        }
        .lp__step-desc {
          font-size: 0.875rem; color: var(--ink-45); line-height: 1.72; margin: 0;
          transition: color 0.25s; flex: 1; position: relative; z-index: 1;
        }
        .lp__step:hover .lp__step-desc { color: var(--ink-70); }

        @media(min-width: 1024px) {
          .lp__step:nth-child(4) { border-bottom-left-radius: 0; }
          .lp__step:nth-child(5) { grid-column: span 2; }
        }

        /* ─ Bottom CTA ───────────────────────────────────── */
        .lp__cta-wrap {
          position: relative; z-index: 10;
          padding: 2rem 1.5rem 6rem;
        }
        .lp__cta-card {
          position: relative; overflow: hidden;
          border-radius: var(--r-2xl);
          border: 1px solid rgba(0,191,99,0.18);
          background: linear-gradient(145deg, rgba(0,191,99,0.06) 0%, rgba(6,7,10,0.95) 60%);
          text-align: center;
          padding: 6rem 2rem;
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.04),
            0 30px 80px rgba(0,0,0,0.60),
            0 0 80px rgba(0,191,99,0.06);
        }
        .lp__cta-glow {
          position: absolute; inset: 0;
          background:
            radial-gradient(ellipse 70% 70% at 50% -10%, rgba(0,191,99,0.16) 0%, transparent 65%),
            radial-gradient(ellipse 40% 40% at 80% 80%, rgba(99,102,241,0.08) 0%, transparent 65%);
          pointer-events: none;
        }
        .lp__cta-grid-overlay {
          position: absolute; inset: 0;
          background-image:
            linear-gradient(to right,  rgba(255,255,255,0.018) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.018) 1px, transparent 1px);
          background-size: 48px 48px;
          mask-image: radial-gradient(ellipse 80% 80% at 50% 50%, #000 40%, transparent 80%);
          pointer-events: none;
        }
        .lp__cta-body {
          position: relative; z-index: 1;
          display: flex; flex-direction: column; align-items: center; gap: 1.25rem;
          max-width: 42rem; margin: 0 auto;
        }
        .lp__cta-title {
          font-size: clamp(2rem, 5vw, 3.75rem);
          font-weight: 900; letter-spacing: -0.03em;
          color: var(--ink); line-height: 1.08; margin: 0;
        }
        .lp__cta-sub {
          font-size: 1rem; color: var(--ink-50); max-width: 30rem; line-height: 1.7; margin: 0;
        }
        .lp__cta-fine {
          font-size: 0.75rem; color: var(--ink-30, rgba(255,255,255,0.30));
          margin: 0; letter-spacing: 0.02em;
        }

        /* ─ Footer ───────────────────────────────────────── */
        .lp__footer {
          position: relative; z-index: 10;
          border-top: 1px solid var(--ink-08);
          background: rgba(0,0,0,0.50);
          padding: 3rem 0;
        }
        .lp__footer-inner {
          display: flex; flex-direction: column; align-items: center; text-align: center; gap: 0.5rem;
        }
        .lp__footer-brand {
          display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.625rem;
        }
        .lp__footer-logo { opacity: 0.25; }
        .lp__footer-name {
          font-size: 1rem; font-weight: 900; letter-spacing: -0.02em; color: var(--ink-20);
        }
        .lp__footer-contact { font-size: 0.875rem; color: var(--ink-45); margin: 0; }
        .lp__footer-email {
          font-size: 0.875rem; font-weight: 600; color: var(--ink-70);
          text-decoration: none; transition: color 0.2s;
        }
        .lp__footer-email:hover { color: var(--g); }
        .lp__footer-bottom {
          margin-top: 1.75rem; padding-top: 1.5rem;
          border-top: 1px solid var(--ink-08);
          width: 100%;
          display: flex; flex-direction: column; align-items: center; gap: 0.875rem;
          font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.06em;
          text-transform: uppercase; color: var(--ink-20);
        }
        @media(min-width: 640px) {
          .lp__footer-bottom { flex-direction: row; justify-content: space-between; text-align: left; }
        }
        .lp__footer-links { display: flex; gap: 1.5rem; }
        .lp__footer-link {
          text-decoration: none; color: var(--ink-20); transition: color 0.2s;
        }
        .lp__footer-link:hover { color: var(--ink); }
      `}</style>
    </main>
  );
}
