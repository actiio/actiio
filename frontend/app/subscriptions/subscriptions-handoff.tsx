"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { safeRelativePath } from "@/lib/sanitize";
import { getSession } from "@/lib/supabase";

function buildAgentsReturnPath(searchParams: URLSearchParams): string {
  const next = new URLSearchParams();

  for (const key of ["subscription_id", "agent_id", "order_id", "subscribed"]) {
    const value = searchParams.get(key);
    if (value) {
      next.set(key, value);
    }
  }

  const query = next.toString();
  return query ? `/agents?${query}` : "/agents";
}

export function SubscriptionsHandoff() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [statusText, setStatusText] = useState("Finishing your Cashfree return and taking you back to your workspace.");

  useEffect(() => {
    async function handoff() {
      try {
        const params = new URLSearchParams(window.location.search);
        const nextPath = buildAgentsReturnPath(params);
        const retryDelayMs = [0, 400, 1200, 2400];

        for (let index = 0; index < retryDelayMs.length; index += 1) {
          const delay = retryDelayMs[index];
          if (delay > 0) {
            setStatusText(index < retryDelayMs.length - 1
              ? "Restoring your session..."
              : "Almost there..."
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
          }

          const session = await getSession();
          if (session) {
            router.replace(nextPath);
            return;
          }
        }

        setStatusText("Sign-in is needed to finish the handoff.");
        router.replace(`/sign-in?next=${encodeURIComponent(nextPath)}`);
      } catch (err) {
        console.error("Handoff redirect failed:", err);
        setStatusText("Redirecting to sign-in...");
        router.replace("/sign-in");
      }
    }

    void handoff();
  }, [router]);

  const nextPath = safeRelativePath(buildAgentsReturnPath(new URLSearchParams(searchParams.toString())));

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6">
      <div className="w-full max-w-md space-y-3 text-center">
        <h1 className="text-2xl font-bold text-brand-heading">One second</h1>
        <p className="text-sm text-brand-body/70">{statusText}</p>
        <p className="text-xs text-brand-body/50">Next stop: {nextPath}</p>
      </div>
    </main>
  );
}
