import { notFound, redirect } from "next/navigation";

import { AgentLayout } from "@/components/agents/agent-layout";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { isSupportedAgentId, normalizeAgentId } from "@/lib/agents";

export default async function AgentOnboardingPage({ params }: { params: Promise<{ agent_id: string }> }) {
  const { agent_id } = await params;
  if (!isSupportedAgentId(agent_id)) {
    notFound();
  }
  const normalizedAgentId = normalizeAgentId(agent_id);
  if (normalizedAgentId !== agent_id) {
    redirect(`/agents/${normalizedAgentId}/onboarding`);
  }

  return (
    <AgentLayout agentId={normalizedAgentId} activePath="settings">
      <OnboardingFlow agentId={normalizedAgentId} />
    </AgentLayout>
  );
}
