"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { hasUnsafeControlChars } from "@/lib/sanitize";

export default function ResetPasswordPage() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"default" | "success" | "error">("default");
  const [errorMsg, setErrorMsg] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isValidToken, setIsValidToken] = useState(false);

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsValidToken(true);
      }
    });

    // Also check if we already have a session
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setIsValidToken(true);
      }
    };
    checkSession();

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const getStrengthIndicator = () => {
    if (newPassword.length === 0) return null;
    if (newPassword.length < 8) return <div className="h-1 w-full bg-red-500 rounded-full mt-2" />;
    
    const hasMixed = /[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword) && /[0-9]/.test(newPassword);
    if (newPassword.length >= 12 && hasMixed) {
      return <div className="h-1 w-full bg-green-500 rounded-full mt-2" />;
    }
    
    return <div className="h-1 w-full bg-yellow-500 rounded-full mt-2" />;
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setStatus("default");
    setErrorMsg("");

    if (newPassword.length < 8) {
      setStatus("error");
      setErrorMsg("Password must be at least 8 characters");
      setLoading(false);
      return;
    }

    if (hasUnsafeControlChars(newPassword) || hasUnsafeControlChars(confirmPassword)) {
      setStatus("error");
      setErrorMsg("Password contains unsupported control characters");
      setLoading(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setStatus("error");
      setErrorMsg("Passwords do not match");
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    setLoading(false);
    if (error) {
      setStatus("error");
      setErrorMsg(error.message || "Failed to update password.");
    } else {
      setStatus("success");
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
          {!isValidToken && status !== "success" ? (
            <div className="space-y-6 text-center">
              <h1 className="text-3xl font-bold tracking-tight text-brand-heading">Invalid Link</h1>
              <p className="text-brand-body/60 text-sm">
                Reset link has expired or is invalid. Please request a new one.
              </p>
              <Link href="/forgot-password" className="text-sm font-semibold text-[#00bf63] hover:underline block pt-4">
                Request new link
              </Link>
            </div>
          ) : status === "success" ? (
            <div className="space-y-6 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <svg className="h-8 w-8 text-[#00bf63]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tight text-[#00bf63]">Password updated successfully</h1>
                <p className="text-brand-body/60 text-sm">
                  Your password has been changed. You can now sign in with your new password.
                </p>
              </div>
              <div className="pt-4">
                <Link href="/sign-in" className="inline-flex w-full bg-[#00bf63] text-white rounded-full font-medium py-3 hover:bg-[#00a857] transition-colors items-center justify-center">
                  Sign in
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tight text-brand-heading">Set new password</h1>
                <p className="text-brand-body/60 text-sm">
                  Enter your new password below.
                </p>
              </div>

              <form className="space-y-5" onSubmit={onSubmit}>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-brand-heading">New password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      disabled={loading}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 pr-10 focus:outline-none focus:ring-2 focus:ring-[#00bf63]"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.29 3.29m0 0a10.05 10.05 0 015.71-1.55c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0l-3.29-3.29"></path></svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                      )}
                    </button>
                  </div>
                  {getStrengthIndicator()}
                  <p className="text-xs text-gray-500 mt-1">Minimum 8 characters</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-brand-heading">Confirm password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      disabled={loading}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 pr-10 focus:outline-none focus:ring-2 focus:ring-[#00bf63]"
                    />
                  </div>
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
                    "Update password"
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
