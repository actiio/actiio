import { Suspense } from "react";

import { SubscriptionsHandoff } from "./subscriptions-handoff";

export default function SubscriptionsPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-white text-brand-body/50 text-sm font-medium">Preparing handoff...</div>}>
      <SubscriptionsHandoff />
    </Suspense>
  );
}
