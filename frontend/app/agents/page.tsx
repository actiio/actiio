import { Suspense } from "react";

import { AgentsHub } from "@/components/agents/agents-hub";

export default function AgentsPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-white text-brand-body/50 text-sm font-medium">Loading workspace...</div>}>
      <AgentsHub />
    </Suspense>
  );
}
