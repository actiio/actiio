import { notFound, redirect } from "next/navigation";

import { AgentLayout } from "@/components/agents/agent-layout";
import { SupportClient } from "@/components/support/support-client";
import { isSupportedAgentId, normalizeAgentId } from "@/lib/agents";

export default async function AgentSupportPage({ params }: { params: Promise<{ agent_id: string }> }) {
  const { agent_id } = await params;
  if (!isSupportedAgentId(agent_id)) {
    notFound();
  }
  const normalizedAgentId = normalizeAgentId(agent_id);
  if (normalizedAgentId !== agent_id) {
    redirect(`/agents/${normalizedAgentId}/support`);
  }

  return (
    <AgentLayout agentId={normalizedAgentId} activePath="support">
      <SupportClient agentId={normalizedAgentId} />
    </AgentLayout>
  );
}
