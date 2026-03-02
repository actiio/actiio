"use client";

import { useRouter } from "next/navigation";
import { Button, ButtonProps } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

interface SignOutButtonProps extends ButtonProps {
  className?: string;
}

export function SignOutButton({ className, variant = "outline", ...props }: SignOutButtonProps) {
  const router = useRouter();

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <Button
      variant={variant}
      className={className}
      onClick={signOut}
      {...props}
    >
      <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
      </svg>
      Sign out
    </Button>
  );
}
