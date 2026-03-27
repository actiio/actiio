export type SalesAsset = {
  id: string;
  name: string;
  path: string;
  mime_type: string;
  size: number;
  uploaded_at: string;
};

export type BusinessProfile = {
  user_id: string;
  agent_id: string;
  business_name: string;
  industry: string;
  target_customer: string;
  core_offer: string;
  price_range: string | null;
  differentiator: string | null;
  email_footer?: string | null;
  sales_assets?: SalesAsset[];
};

export type LeadThread = {
  id: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone?: string | null;
  subject?: string | null;
  has_pending_draft?: boolean;
  channel: "gmail";
  status: "active" | "pending_approval" | "needs_review" | "closed" | "ignored";
  close_reason?: "opt_out" | "chose_competitor" | "not_interested" | "manual" | "follow_up_limit" | null;
  last_inbound_at: string | null;
  last_outbound_at?: string | null;
  follow_up_count?: number;
  created_at?: string;
  message_count?: number;
  stage_label?: string | null;
  has_attachments?: boolean;
  last_message_preview: string;
  gmail_thread_id?: string;
  last_message?: {
    content?: string;
    subject?: string;
    timestamp: string;
    direction: "inbound" | "outbound";
    gmail_message_id?: string;
    has_attachments?: boolean;
    attachment_names?: string[];
  };
  recent_messages?: Array<{
    content?: string;
    subject?: string;
    timestamp: string;
    direction: "inbound" | "outbound";
    gmail_message_id?: string;
    has_attachments?: boolean;
    attachment_names?: string[];
  }>;
};

export type DraftOption = {
  tone: "soft" | "balanced" | "direct";
  subject?: string;
  message: string;
};

export type ThreadDrafts = {
  id: string;
  thread_id: string;
  draft_1: DraftOption | null;
  draft_2: DraftOption | null;
  draft_3: DraftOption | null;
  selected_draft?: DraftOption | null;
  status: string;
};

export type Agent = {
  id: string;
  name: string;
  description: string;
  icon: string;
  channel?: "gmail" | "any" | null;
  free_price_inr: number;
  pro_price_inr: number;
  stripe_free_price_id: string | null;
  stripe_pro_price_id: string | null;
  status: "active" | "coming_soon";
  sort_order?: number;
  created_at: string;
};

export type UserSubscription = {
  id: string;
  user_id: string;
  agent_id: string;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  plan: "free" | "pro";
  status: "active" | "inactive" | "past_due" | "canceled";
  current_period_end: string | null;
  created_at: string;
};

export type AgentWithSubscription = {
  agent: Agent;
  subscription: UserSubscription | null;
  on_waitlist: boolean;
  business_profile_configured?: boolean;
  gmail_connected?: boolean;
  setup_complete?: boolean;
  thread_summary?: AgentThreadsSummary | null;
};

export type AgentThreadsSummary = {
  needs_attention: number;
  active_leads: number;
  total_leads: number;
  last_synced: string | null;
};

export type AgentsSummary = {
  total_needs_attention: number;
  total_active_leads: number;
  total_leads: number;
  follow_ups_sent_this_week: number;
};
