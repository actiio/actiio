"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { safeRelativePath } from "@/lib/sanitize";
import { getSession } from "@/lib/supabase";

function buildAgentsReturnPath(searchParams: URLSearchParams): string {
  const next = new URLSearchParams();

  for (const key of ["subscription_id", "agent_id", "autopay", "order_id", "subscribed"]) {
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

  useEffect(() => {
    async function handoff() {
      const nextPath = buildAgentsReturnPath(new URLSearchParams(searchParams.toString()));
      const session = await getSession();

      if (session) {
        router.replace(nextPath);
        return;
      }

      router.replace(`/sign-in?next=${encodeURIComponent(nextPath)}`);
    }

    void handoff();
  }, [router, searchParams]);

  const nextPath = safeRelativePath(buildAgentsReturnPath(new URLSearchParams(searchParams.toString())));

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6">
      <div className="w-full max-w-md space-y-3 text-center">
        <h1 className="text-2xl font-bold text-brand-heading">One second</h1>
        <p className="text-sm text-brand-body/70">
          Finishing your Cashfree return and taking you back to your workspace.
        </p>
        <p className="text-xs text-brand-body/50">Next stop: {nextPath}</p>
      </div>
    </main>
  );
}
