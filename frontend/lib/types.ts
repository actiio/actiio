export type BusinessProfile = {
  user_id: string;
  business_name: string;
  industry: string;
  target_customer: string;
  core_offer: string;
  price_range: string | null;
  differentiator: string | null;
  preferred_tone: "friendly" | "direct" | "formal";
  silence_threshold_hours: 24 | 48 | 72;
};

export type LeadThread = {
  id: string;
  contact_name: string | null;
  contact_email: string | null;
  channel: "gmail" | "whatsapp";
  status: "active" | "pending_approval" | "needs_review" | "closed";
  last_inbound_at: string | null;
  last_message_preview: string;
  gmail_thread_id?: string;
  last_message?: {
    content: string;
    timestamp: string;
    direction: "inbound" | "outbound";
    gmail_message_id?: string;
  };
};

export type DraftOption = {
  tone: "soft" | "balanced" | "direct";
  subject?: string;
  message: string;
};

export type ThreadDrafts = {
  id: string;
  thread_id: string;
  draft_1: DraftOption;
  draft_2: DraftOption;
  draft_3: DraftOption;
  status: string;
};

export type WhatsAppConnection = {
  id: string;
  user_id: string;
  phone_number_id: string;
  display_phone_number: string | null;
  business_account_id: string | null;
};
