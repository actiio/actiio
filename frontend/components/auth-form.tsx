"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignIn = mode === "sign-in";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const { error: authError } = isSignIn
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    if (!isSignIn) {
      setError("Please check your email to confirm your account.");
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

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
            {isSignIn && (
              <Link href="#" className="text-xs font-medium text-brand-primary hover:underline">
                Forgot password?
              </Link>
            )}
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
