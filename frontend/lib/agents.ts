export type SupportedAgentId =
  | "gmail_followup"
  | "lead_scorer"
  | "cold_outreach"
  | "proposal_generator";

const LEGACY_AGENT_ID_MAP: Record<string, SupportedAgentId> = {
  actiio: "gmail_followup",
  follow_up: "gmail_followup",
};

export type AgentChannel = "gmail" | "any";

export type AgentMeta = {
  id: SupportedAgentId;
  name: string;
  shortName: string;
  icon: string;
  channel: AgentChannel;
  dashboardTitle: string;
  dashboardSubtitle: string;
  settingsTitle: string;
  settingsSubtitle: string;
  emptyStateCta: string;
};

const DEFAULT_AGENT: AgentMeta = {
  id: "gmail_followup",
  name: "Gmail Follow-up Agent",
  shortName: "Gmail Follow-up",
  icon: "📧",
  channel: "gmail",
  dashboardTitle: "Gmail Follow-up Workspace",
  dashboardSubtitle: "Monitor quiet email threads, review drafts, and send follow-ups before momentum disappears.",
  settingsTitle: "Gmail Follow-up Agent",
  settingsSubtitle: "Business profile and Gmail connection",
  emptyStateCta: "Connect Gmail",
};

const AGENT_META: Record<SupportedAgentId, AgentMeta> = {
  gmail_followup: DEFAULT_AGENT,
  lead_scorer: {
    id: "lead_scorer",
    name: "Lead Scorer Agent",
    shortName: "Lead Scorer",
    icon: "🎯",
    channel: "any",
    dashboardTitle: "Lead Scorer",
    dashboardSubtitle: "Score and prioritize inbound opportunities.",
    settingsTitle: "Lead Scorer Agent",
    settingsSubtitle: "Configuration",
    emptyStateCta: "Open settings",
  },
  cold_outreach: {
    id: "cold_outreach",
    name: "Cold Outreach Agent",
    shortName: "Cold Outreach",
    icon: "📨",
    channel: "any",
    dashboardTitle: "Cold Outreach",
    dashboardSubtitle: "Research prospects and create outbound sequences.",
    settingsTitle: "Cold Outreach Agent",
    settingsSubtitle: "Configuration",
    emptyStateCta: "Open settings",
  },
  proposal_generator: {
    id: "proposal_generator",
    name: "Proposal Generator",
    shortName: "Proposal Generator",
    icon: "📄",
    channel: "any",
    dashboardTitle: "Proposal Generator",
    dashboardSubtitle: "Turn meetings into polished proposals faster.",
    settingsTitle: "Proposal Generator",
    settingsSubtitle: "Configuration",
    emptyStateCta: "Open settings",
  },
};

export function isSupportedAgentId(agentId?: string): agentId is SupportedAgentId {
  return Boolean(agentId && normalizeAgentId(agentId) in AGENT_META);
}

export function normalizeAgentId(agentId?: string): SupportedAgentId {
  if (!agentId) return DEFAULT_AGENT.id;
  const normalized = LEGACY_AGENT_ID_MAP[agentId] || agentId;
  return (normalized as SupportedAgentId) in AGENT_META
    ? (normalized as SupportedAgentId)
    : DEFAULT_AGENT.id;
}

export function getAgentMeta(agentId?: string): AgentMeta {
  return AGENT_META[normalizeAgentId(agentId)] || DEFAULT_AGENT;
}

export function isGmailAgent(agentId?: string) {
  return getAgentMeta(agentId).channel === "gmail";
}
