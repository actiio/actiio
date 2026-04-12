"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { sanitizeEmail } from "@/lib/sanitize";

const RESET_LINK_TIMEOUT_MS = 15000;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"default" | "success" | "error">("default");
  const [errorMsg, setErrorMsg] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setStatus("default");
    setErrorMsg("");
    const safeEmail = sanitizeEmail(email);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), RESET_LINK_TIMEOUT_MS);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: safeEmail }),
        signal: controller.signal,
      });

      window.clearTimeout(timeoutId);
      setLoading(false);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setStatus("error");
        setErrorMsg(data.detail || "Something went wrong. Try again.");
      } else {
        setEmail(safeEmail);
        setStatus("success");
      }
    } catch (err: any) {
      window.clearTimeout(timeoutId);
      setLoading(false);
      setStatus("error");
      setErrorMsg(
        err?.name === "AbortError"
          ? "The reset request is taking too long. Please try again in a moment."
          : "Network error. Please make sure the service is reachable."
      );
    }
  }

  return (
    <main className="flex min-h-screen bg-white overflow-visible">
      {/* Left side - dark branding */}
      <div className="hidden min-h-screen w-1/2 flex-col justify-between bg-brand-heading p-16 text-white lg:flex overflow-visible relative">
        <Link href="/" className="group z-20 mb-auto flex items-center gap-2">
          <Image src="/logo.png" alt="Actiio Logo" width={24} height={24} className="h-6 w-auto brightness-0 invert opacity-60 transition-opacity group-hover:opacity-100" />
          <span className="text-lg font-bold tracking-tight text-white/60 transition-colors group-hover:text-white">Actiio</span>
        </Link>
        <div className="flex flex-col items-center justify-center text-center space-y-12 py-20 overflow-visible relative z-10">
          <div className="group relative flex items-center justify-center overflow-visible">
            <div
              className="absolute h-[600px] w-[600px] transition-all duration-1000 opacity-100 group-hover:opacity-30"
              style={{
                pointerEvents: 'none',
                background: 'radial-gradient(circle, rgba(0, 191, 99, 0.25) 0%, transparent 65%)',
                transform: 'translate(-50%, -50%)',
                left: '50%',
                top: '50%'
              }}
            />
            <div className="relative z-10 transition-all duration-700 group-hover:scale-105">
              <Image
                src="/logo.png"
                alt="Actiio Logo"
                width={200}
                height={200}
                className="h-48 w-auto transition-all duration-700"
                style={{
                  filter: "invert(48%) sepia(79%) saturate(2476%) hue-rotate(123deg) brightness(97%) contrast(101%) drop-shadow(0 0 20px rgba(0,191,99,0.3))"
                }}
              />
            </div>
          </div>
          <div className="max-w-xs space-y-6">
            <h2 className="text-5xl font-black tracking-tighter text-white leading-[0.9]">
              NEVER LOSE <br />
              <span className="text-brand-primary italic">A WARM LEAD.</span>
            </h2>
            <p className="text-xl font-medium text-white/30 leading-relaxed uppercase tracking-widest text-[12px]">
              Intelligent Sales Infrastructure
            </p>
          </div>
        </div>
        <p className="mt-auto text-[10px] font-black tracking-[0.2em] uppercase text-white/20">
          © {new Date().getFullYear()} Actiio AI. All rights reserved.
        </p>
      </div>

      {/* Right side - form */}
      <div className="flex w-full flex-col items-center justify-center bg-white px-8 lg:w-1/2">
        <div className="mb-12 lg:hidden">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.png" alt="Actiio Logo" width={24} height={24} className="h-6 w-auto" />
            <span className="text-xl font-bold tracking-tight text-brand-heading">Actiio</span>
          </Link>
        </div>
        
        <div className="w-full max-w-sm space-y-8">
          {status === "success" ? (
            <div className="space-y-6 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <svg className="h-8 w-8 text-[#00bf63]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tight text-[#00bf63]">Check your email</h1>
                <p className="text-brand-body/60 text-sm">
                  We've sent a password reset link to <span className="font-semibold">{email}</span>. Check your inbox and spam folder.
                </p>
              </div>
              <div className="pt-4">
                <Link href="/sign-in" className="text-sm font-semibold text-[#00bf63] hover:underline">
                  Back to sign in
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tight text-brand-heading">Reset your password</h1>
                <p className="text-brand-body/60 text-sm">
                  Enter your email and we'll send you a link to reset your password.
                </p>
              </div>

              <form className="space-y-5" onSubmit={onSubmit}>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-brand-heading">Email</label>
                  <input
                    type="email"
                    placeholder="johndoe@example.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#00bf63]"
                  />
                </div>

                {status === "error" && (
                  <div className="p-4 rounded-xl text-sm bg-red-50 text-red-500 border border-red-100">
                    {errorMsg}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#00bf63] text-white rounded-full font-medium py-3 hover:bg-[#00a857] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {loading ? (
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    "Send reset link"
                  )}
                </button>
              </form>

              <div className="text-center pt-4">
                <Link href="/sign-in" className="text-sm font-medium text-gray-500 hover:text-gray-700">
                  Back to sign in
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
