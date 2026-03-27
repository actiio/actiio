import { notFound, redirect } from "next/navigation";

import { AgentLayout } from "@/components/agents/agent-layout";
import { SettingsClient } from "@/components/settings/settings-client";
import { isSupportedAgentId, normalizeAgentId } from "@/lib/agents";

export default async function AgentSettingsPage({ params }: { params: Promise<{ agent_id: string }> }) {
  const { agent_id } = await params;
  if (!isSupportedAgentId(agent_id)) {
    notFound();
  }
  const normalizedAgentId = normalizeAgentId(agent_id);
  if (normalizedAgentId !== agent_id) {
    redirect(`/agents/${normalizedAgentId}/settings`);
  }

  return (
    <AgentLayout agentId={normalizedAgentId} activePath="settings">
      <SettingsClient agentId={normalizedAgentId} />
    </AgentLayout>
  );
}
