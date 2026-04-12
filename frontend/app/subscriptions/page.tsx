import { Suspense } from "react";

import { SubscriptionsHandoff } from "./subscriptions-handoff";

export default function SubscriptionsPage() {
  return (
    <Suspense fallback={null}>
      <SubscriptionsHandoff />
    </Suspense>
  );
}
