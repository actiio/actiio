"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import "./landing-page.css";


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
  const [loading, setLoading] = useState<string | null>(null);
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
    if (loading === "sign-out") return;
    setLoading("sign-out");
    setSignedIn(false);

    try {
      const { supabase } = await import("@/lib/supabase");
      await supabase.auth.signOut();
      router.refresh();
    } catch (err: unknown) {
      setSignedIn(true);
      console.error("Sign out error:", err);
      setLoading(null);
    } finally {
      // Don't set loading to null if we're successful, 
      // the refresh will take care of it or the page will unmount.
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
                <Link 
                  href="/sign-in" 
                  className="lp__nav-link"
                  onClick={() => setLoading("sign-in")}
                >
                  {loading === "sign-in" ? <span className="lp__loader" /> : "Sign In"}
                </Link>
                <Link 
                  href="/sign-up" 
                  className="lp__btn lp__btn--primary lp__btn--sm"
                  onClick={() => setLoading("get-started")}
                >
                  {loading === "get-started" ? <span className="lp__loader" /> : "Get Started"}
                </Link>
              </>
            ) : (
              <>
                <button 
                  onClick={handleSignOut} 
                  className="lp__nav-link lp__nav-link--muted" 
                  disabled={loading === "sign-out"}
                >
                  {loading === "sign-out" ? <span className="lp__loader" /> : "Sign Out"}
                </button>
                <Link 
                  href="/agents" 
                  className="lp__btn lp__btn--primary lp__btn--sm"
                  onClick={() => setLoading("platform")}
                >
                  {loading === "platform" ? <span className="lp__loader" /> : "Go to Platform"}
                </Link>
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
            <Link 
              href={isAuthenticated ? "/agents" : "/sign-up"} 
              className="lp__btn lp__btn--hero lp__btn--glow"
              onClick={() => setLoading(isAuthenticated ? "enter" : "automate")}
            >
              {loading === "enter" || loading === "automate" ? (
                <span className="lp__loader" />
              ) : (
                <>
                  {isAuthenticated ? "Enter the App" : "Start Automating Follow-ups"}
                  <svg className="lp__btn-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </>
              )}
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
        <div className="lp__video-header" style={{ textAlign: "left", alignItems: "flex-start", maxWidth: "none" }}>
          <p className="lp__eyebrow">See it in action</p>
          <h2 className="lp__section-title" style={{ marginBottom: "0", whiteSpace: "nowrap" }}>
            From inbox to deal, in <span className="lp__green">minutes.</span>
          </h2>
          <p className="lp__section-sub">
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
              <Link 
                href={isAuthenticated ? "/agents" : "/sign-up"} 
                className="lp__btn lp__btn--hero lp__btn--glow"
                onClick={() => setLoading(isAuthenticated ? "enter-bottom" : "get-started-bottom")}
              >
                {loading === "enter-bottom" || loading === "get-started-bottom" ? (
                  <span className="lp__loader" />
                ) : (
                  <>
                    {isAuthenticated ? "Enter the App" : "Get Started Now"}
                    <svg className="lp__btn-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </>
                )}
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
    </main>
  );
}
