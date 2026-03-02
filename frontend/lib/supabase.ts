import { createBrowserClient } from "@supabase/ssr";

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function getSession() {
  let session = null;
  try {
    const {
      data: { session: resolvedSession },
    } = await supabase.auth.getSession();
    session = resolvedSession;
  } catch {
    return null;
  }

  if (!session) {
    return null;
  }

  const expiresAt = session.expires_at ?? 0;
  const now = Math.floor(Date.now() / 1000);
  const isExpiringSoon = expiresAt > 0 && expiresAt - now < 60;

  if (!isExpiringSoon) {
    return session;
  }

  let data = null;
  let error = null;
  try {
    const refreshed = await supabase.auth.refreshSession();
    data = refreshed.data;
    error = refreshed.error;
  } catch {
    return session;
  }
  if (error) {
    return session;
  }

  return data.session ?? session;
}

export async function getAuthHeader(): Promise<Record<string, string>> {
  const session = await getSession();
  const token = session?.access_token;

  if (!token) {
    return {};
  }

  return {
    Authorization: `Bearer ${token}`,
  };
}
