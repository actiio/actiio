"use client";

import { getAuthHeader } from "@/lib/supabase";
import { supabase } from "@/lib/supabase";
import { AgentThreadsSummary, AgentsSummary, AgentWithSubscription, BusinessProfile, SubscriptionStatus } from "@/lib/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

declare global {
  interface Window {
    Cashfree?: (options: { mode: "sandbox" | "production" }) => {
      checkout: (options: {
        paymentSessionId: string;
        redirectTarget?: "_self" | "_blank" | "_top" | "_modal";
      }) => Promise<{ error?: { message?: string } }>;
      subscriptionsCheckout: (options: {
        subsSessionId: string;
        redirectTarget?: "_self" | "_blank" | "_top" | "_modal";
      }) => Promise<{ error?: { message?: string } }>;
    };
  }
}
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  async function doFetch(useFreshAuth: boolean): Promise<Response> {
    if (useFreshAuth) {
      await supabase.auth.refreshSession();
    }
    const authHeader = await getAuthHeader();
    const headers = new Headers(init?.headers || {});
    Object.entries(authHeader).forEach(([key, value]) => headers.set(key, value));
    if (!headers.has("Content-Type") && init?.body) {
      headers.set("Content-Type", "application/json");
    }
    return fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
    });
  }

  let response: Response;
  try {
    response = await doFetch(false);
  } catch (error) {
    const transient = error instanceof TypeError || (error instanceof DOMException && error.name === "AbortError");
    if (!transient) {
      throw error;
    }
    // One retry for transient browser/network failures such as "Load failed".
    response = await doFetch(false);
  }

  if (!response.ok && response.status === 401) {
    response = await doFetch(true);
  }

  if (!response.ok) {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try {
        const data = await response.json();
        const detail = typeof data?.detail === "string"
          ? data.detail
          : Array.isArray(data?.detail)
            ? data.detail
                .map((item: any) => {
                  const location = Array.isArray(item?.loc) ? item.loc.join(".") : null;
                  const message = typeof item?.msg === "string" ? item.msg : null;
                  return [location, message].filter(Boolean).join(": ");
                })
                .filter(Boolean)
                .join("; ")
          : typeof data?.message === "string"
            ? data.message
            : null;
        throw new Error(detail || "API request failed");
      } catch (error) {
        if (error instanceof Error) {
          throw error;
        }
      }
    }
    const text = await response.text();
    throw new Error(text || "API request failed");
  }

  return (await response.json()) as T;
}

export async function getAgents(): Promise<AgentWithSubscription[]> {
  return apiFetch<AgentWithSubscription[]>("/api/agents");
}

export async function joinWaitlist(agentId: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/api/agents/${agentId}/waitlist`, {
    method: "POST",
  });
}

export async function suggestSkill(skill: string, description?: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>("/api/agents/suggest-skill", {
    method: "POST",
    body: JSON.stringify({ skill, description }),
  });
}

export async function submitSupportRequest(
  agentId: string,
  subject: string,
  message: string
): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>("/api/agents/support-request", {
    method: "POST",
    body: JSON.stringify({ agent_id: agentId, subject, message }),
  });
}

export async function getThreads(agentId: string = "gmail_followup"): Promise<{ threads: any[] }> {
  return apiFetch<{ threads: any[] }>(`/api/agents/${agentId}/threads`);
}

export async function getAgentThreadsSummary(agentId: string): Promise<AgentThreadsSummary> {
  return apiFetch<AgentThreadsSummary>(`/api/agents/${agentId}/threads/summary`);
}

export async function ignoreThread(threadId: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/api/threads/${threadId}/ignore`, {
    method: "POST",
  });
}

export async function getAgentsSummary(): Promise<AgentsSummary> {
  return apiFetch<AgentsSummary>("/api/agents/summary");
}

export async function getDrafts(agentId: string, threadId: string): Promise<{ drafts: any }> {
  return apiFetch<{ drafts: any }>(`/api/agents/${agentId}/drafts/${threadId}`);
}



export async function connectGmail(agentId: string = "gmail_followup"): Promise<{ auth_url: string }> {
  return apiFetch<{ auth_url: string }>(`/api/gmail/auth?agent_id=${encodeURIComponent(agentId)}`);
}

export async function syncGmail(
  agentId: string = "gmail_followup"
): Promise<{ leads_found: number; updated_threads: number; replied_threads: number; last_synced_at?: string | null }> {
  return apiFetch<{ leads_found: number; updated_threads: number; replied_threads: number; last_synced_at?: string | null }>("/api/gmail/sync", {
    method: "POST",
    body: JSON.stringify({ agent_id: agentId }),
  });
}

export async function sendGmail(agentId: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  return apiFetch<Record<string, unknown>>("/api/gmail/send", {
    method: "POST",
    body: JSON.stringify({ agent_id: agentId, ...payload }),
  });
}

export async function getBusinessProfile(agentId: string = "gmail_followup"): Promise<BusinessProfile> {
  return apiFetch<BusinessProfile>(`/api/business-profile?agent_id=${encodeURIComponent(agentId)}`);
}

export async function saveBusinessProfile(agentId: string, data: Record<string, unknown>): Promise<any> {
  return apiFetch("/api/business-profile", {
    method: "POST",
    body: JSON.stringify({ agent_id: agentId, ...data }),
  });
}

// ---------------------------------------------------------------------------
// Payment / Subscription
// ---------------------------------------------------------------------------

export async function createPaymentOrder(
  agentId: string
): Promise<{ payment_session_id: string; order_id: string }> {
  return apiFetch<{ payment_session_id: string; order_id: string }>(
    "/api/payment/create-order",
    {
      method: "POST",
      body: JSON.stringify({ agent_id: agentId }),
    }
  );
}

export async function createAutopaySubscription(
  agentId: string
): Promise<{ subscription_session_id?: string; subscription_id?: string; status?: string }> {
  return apiFetch<{ subscription_session_id?: string; subscription_id?: string; status?: string }>(
    "/api/payment/create-autopay",
    {
      method: "POST",
      body: JSON.stringify({ agent_id: agentId }),
    }
  );
}

export async function getSubscriptionStatus(
  agentId: string
): Promise<SubscriptionStatus> {
  return apiFetch<SubscriptionStatus>(
    `/api/payment/status/${encodeURIComponent(agentId)}`
  );
}

export async function renewSubscription(
  agentId: string
): Promise<{ payment_session_id: string; order_id: string }> {
  return apiFetch<{ payment_session_id: string; order_id: string }>(
    "/api/payment/renew",
    {
      method: "POST",
      body: JSON.stringify({ agent_id: agentId }),
    }
  );
}
