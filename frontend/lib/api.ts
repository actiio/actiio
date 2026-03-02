"use client";

import { getAuthHeader } from "@/lib/supabase";
import { supabase } from "@/lib/supabase";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

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
    const text = await response.text();
    throw new Error(text || "API request failed");
  }

  return (await response.json()) as T;
}

export async function createCheckoutSession(): Promise<void> {
  const data = await apiFetch<{ url: string }>("/api/stripe/create-checkout-session", {
    method: "POST",
  });
  if (data.url) {
    window.location.href = data.url;
  }
}

export async function createPortalSession(): Promise<void> {
  const data = await apiFetch<{ url: string }>("/api/stripe/create-portal-session", {
    method: "POST",
  });
  if (data.url) {
    window.location.href = data.url;
  }
}
