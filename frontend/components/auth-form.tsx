"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { hasUnsafeControlChars, mergeQueryParams, safeRelativePath, sanitizeEmail } from "@/lib/sanitize";
import { supabase } from "@/lib/supabase";

let pendingSignInEmailPrefill = "";

function toFriendlyAuthError(message: string): string {
  const normalized = message.trim().toLowerCase();
  if (
    normalized === "load failed" ||
    normalized.includes("failed to fetch") ||
    normalized.includes("networkerror") ||
    normalized.includes("network request failed")
  ) {
    return "Could not reach authentication service. Please try again.";
  }
  return message;
}

export function AuthForm({ mode = "sign-in", isSilent = false }: { mode?: "sign-in" | "sign-up"; isSilent?: boolean }) {
  const router = useRouter();
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const initialEmail = mode === "sign-in" ? pendingSignInEmailPrefill : "";
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignIn = mode === "sign-in";

  useEffect(() => {
    if (mode === "sign-in" && pendingSignInEmailPrefill) {
      setEmail(pendingSignInEmailPrefill);
      pendingSignInEmailPrefill = "";
    }
  }, [mode]);

  useEffect(() => {
    // If already signed in (e.g. Cashfree redirected back to /sign-in),
    // redirect immediately rather than waiting for a new SIGNED_IN event.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        const search = new URLSearchParams(window.location.search);
        let nextPath = safeRelativePath(search.get("next"));
        
        // Preserve subscription params if they were provided at the top level
        nextPath = mergeQueryParams(nextPath, search);
        
        router.push(nextPath);
        router.refresh();
      }
    }).catch(err => {
      console.error("Session check failed:", err);
    });

    // Also handle cases where auth state changes (e.g. magic links, login completion)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        const search = new URLSearchParams(window.location.search);
        let nextPath = safeRelativePath(search.get("next"));
        nextPath = mergeQueryParams(nextPath, search);
        
        router.push(nextPath);
        router.refresh();
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const safeEmail = sanitizeEmail(email);
    if (hasUnsafeControlChars(password)) {
      setError("Password contains unsupported control characters.");
      setLoading(false);
      return;
    }

    let authError: { message: string } | null = null;
    let authResult: any = null;

    try {
      if (isSignIn) {
        authResult = await supabase.auth.signInWithPassword({ email: safeEmail, password });
        authError = authResult.error;
      } else {
        // Sign up through our backend to trigger custom Resend emails
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/auth/sign-up`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: safeEmail, password }),
        });
        
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          authError = { message: data.detail || "Sign up failed." };
        } else {
          authResult = { data: await res.json(), error: null };
          // If signup returned tokens (meaning email confirm is off), set the session
          if (authResult.data.access_token) {
            await supabase.auth.setSession({
              access_token: authResult.data.access_token,
              refresh_token: authResult.data.refresh_token,
            });
          }
        }
      }
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Authentication failed.";
      setError(toFriendlyAuthError(message));
      setLoading(false);
      return;
    }

    if (authError) {
      setError(toFriendlyAuthError(authError.message));
      setLoading(false);
      return;
    }

    if (!isSignIn) {
      setError(authResult.data?.message || "If this email is new, you'll receive a confirmation shortly.");
      setLoading(false);
      return;
    }

    const search = new URLSearchParams(window.location.search);
    let nextPath = safeRelativePath(search.get("next"));
    nextPath = mergeQueryParams(nextPath, search);
    
    router.push(nextPath);
    router.refresh();
  }

  if (isSilent) return null;

  return (
    <div className="w-full max-w-sm space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-brand-heading">
          {isSignIn ? "Welcome back" : "Create account"}
        </h1>
        <p className="text-brand-body/60 text-sm">
          {isSignIn
            ? "Enter your credentials to access your leads"
            : "Start monitoring your leads and closing more deals"}
        </p>
      </div>

      <form className="space-y-5" onSubmit={onSubmit}>
        <div className="space-y-2">
          <label className="text-sm font-semibold text-brand-heading">Email</label>
          <Input
            type="email"
            placeholder="johndoe@example.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-brand-heading">Password</label>
          </div>
          <Input
            type="password"
            placeholder="••••••••"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
          />
          {isSignIn && (
            <div className="flex justify-end">
              <Link 
                href="/forgot-password"
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Forgot password?
              </Link>
            </div>
          )}
        </div>

        {error && (
          <div className={`p-4 rounded-xl text-sm ${error.includes("check your email") ? "bg-blue-50 text-blue-700 border border-blue-100" : "bg-red-50 text-red-600 border border-red-100"}`}>
            {error}
          </div>
        )}

        <Button className="w-full py-7 text-lg drop-shadow-lg shadow-brand-primary/20" disabled={loading}>
          {loading ? "Please wait..." : isSignIn ? "Sign In" : "Get Started"}
        </Button>
      </form>

      <div className="text-center pt-4">
        <p className="text-sm text-brand-body/60">
          {isSignIn ? "No account yet?" : "Already have an account?"}{" "}
          <Link
            href={isSignIn ? "/sign-up" : "/sign-in"}
            className="font-bold text-brand-heading hover:text-brand-primary transition-colors hover:underline"
          >
            {isSignIn ? "Create one" : "Sign in"}
          </Link>
        </p>
      </div>

      {!isSignIn && (
        <p className="text-center text-xs text-brand-body/50 leading-relaxed max-w-[280px] mx-auto pt-8">
          By continuing, you agree to Actiio's{" "}
          <Link href="#" className="underline">Terms of Service</Link> and{" "}
          <Link href="#" className="underline">Privacy Policy</Link>.
        </p>
      )}
    </div>
  );
}
