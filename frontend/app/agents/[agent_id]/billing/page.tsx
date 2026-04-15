import { notFound, redirect } from "next/navigation";
import { AgentLayout } from "@/components/agents/agent-layout";
import { BillingClient } from "@/components/billing/billing-client";
import { isSupportedAgentId, normalizeAgentId } from "@/lib/agents";

export default async function BillingPage({ params }: { params: Promise<{ agent_id: string }> }) {
  const { agent_id } = await params;
  if (!isSupportedAgentId(agent_id)) {
    notFound();
  }
  const normalizedAgentId = normalizeAgentId(agent_id);
  if (normalizedAgentId !== agent_id) {
    redirect(`/agents/${normalizedAgentId}/billing`);
  }

  return (
    <AgentLayout agentId={normalizedAgentId} activePath="billing">
      <BillingClient agentId={normalizedAgentId} />
    </AgentLayout>
  );
}
