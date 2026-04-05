import { Suspense } from "react";

import { AgentsHub } from "@/components/agents/agents-hub";

export default function AgentsPage() {
  return (
    <Suspense fallback={null}>
      <AgentsHub />
    </Suspense>
  );
}
