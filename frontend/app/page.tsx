import { LandingPageClient } from "@/components/landing-page-client";
import { getServerUser } from "@/lib/supabase-server";

export default async function LandingPage() {
  const user = await getServerUser();

  return <LandingPageClient isAuthenticated={Boolean(user)} />;
}
