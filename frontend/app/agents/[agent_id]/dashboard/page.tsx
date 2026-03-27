import { notFound, redirect } from "next/navigation";

import { AgentLayout } from "@/components/agents/agent-layout";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { isSupportedAgentId, normalizeAgentId } from "@/lib/agents";

export default async function AgentDashboardPage({ params }: { params: Promise<{ agent_id: string }> }) {
  const { agent_id } = await params;
  if (!isSupportedAgentId(agent_id)) {
    notFound();
  }
  const normalizedAgentId = normalizeAgentId(agent_id);
  if (normalizedAgentId !== agent_id) {
    redirect(`/agents/${normalizedAgentId}/dashboard`);
  }

  return (
    <AgentLayout agentId={normalizedAgentId} activePath="dashboard">
      <DashboardClient agentId={normalizedAgentId} />
    </AgentLayout>
  );
}
