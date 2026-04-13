import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth-form";
import { getServerUser } from "@/lib/supabase-server";
import { mergeQueryParams, safeRelativePath } from "@/lib/sanitize";

export default async function SignInPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getServerUser();
  const searchParams = await props.searchParams;
  
  // Check if this is a payment return/handoff based on URL params
  const isPaymentReturn = !!(searchParams.subscription_id || searchParams.order_id || searchParams.autopay);

  if (user) {
    // If already signed in, redirect immediately on the server
    const nextArg = typeof searchParams.next === "string" ? searchParams.next : "/agents";
    let nextPath = safeRelativePath(nextArg);
    
    // Carry over relevant params like subscription_id, etc.
    const params = new URLSearchParams();
    Object.entries(searchParams).forEach(([key, val]) => {
      if (typeof val === "string") params.set(key, val);
    });
    
    nextPath = mergeQueryParams(nextPath, params);
    redirect(nextPath);
  }

  // If this is a payment return but we don't have a user session yet, 
  // show a clean loading state instead of the full sign-in branding to avoid a "flash".
  // The AuthForm will handle the client-side session detection and redirect.
  if (isPaymentReturn) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-white p-6 text-center">
        <div className="w-full max-w-sm space-y-8">
          <div className="flex justify-center">
            <Image src="/logo.png" alt="Actiio Logo" width={64} height={64} className="h-16 w-auto animate-pulse" />
          </div>
          <div className="space-y-3">
            <h1 className="text-3xl font-black tracking-tight text-brand-heading">One second</h1>
            <p className="text-brand-body/60 font-medium">
              We're verifying your account and finishing your setup...
            </p>
          </div>
          <div className="pt-4">
             <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                <div className="h-full w-2/3 animate-[loading_2s_ease-in-out_infinite] rounded-full bg-brand-primary"></div>
             </div>
          </div>
          {/* We still render AuthForm hiddenly or for its effects, or just wait for client-side to take over */}
          <AuthForm mode="sign-in" isSilent />
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen bg-white overflow-visible">
      {/* Left side - dark branding */}
      <div className="hidden min-h-screen w-1/2 flex-col justify-between bg-brand-heading p-16 text-white lg:flex overflow-visible relative">
        <Link href="/" className="group z-20 mb-auto flex items-center gap-2">
          <Image src="/logo.png" alt="Actiio Logo" width={24} height={24} className="h-6 w-auto brightness-0 invert opacity-60 transition-opacity group-hover:opacity-100" />
          <span className="text-lg font-bold tracking-tight text-white/60 transition-colors group-hover:text-white">Actiio</span>
        </Link>

        <div className="flex flex-col items-center justify-center text-center space-y-12 py-20 overflow-visible relative z-10">
          <div className="group relative flex items-center justify-center overflow-visible">
            {/* Cinematic Radial Glow (Gradient-based) */}
            <div
              className="absolute h-[600px] w-[600px] transition-all duration-1000 opacity-100 group-hover:opacity-30"
              style={{
                pointerEvents: 'none',
                background: 'radial-gradient(circle, rgba(0, 191, 99, 0.25) 0%, transparent 65%)',
                transform: 'translate(-50%, -50%)',
                left: '50%',
                top: '50%'
              }}
            />

            <div className="relative z-10 transition-all duration-700 group-hover:scale-105">
              <Image
                src="/logo.png"
                alt="Actiio Logo"
                width={200}
                height={200}
                className="h-48 w-auto transition-all duration-700"
                style={{
                  filter: "invert(48%) sepia(79%) saturate(2476%) hue-rotate(123deg) brightness(97%) contrast(101%) drop-shadow(0 0 20px rgba(0,191,99,0.3))"
                }}
              />
            </div>
          </div>

          <div className="max-w-xs space-y-6">
            <h2 className="text-5xl font-black tracking-tighter text-white leading-[0.9]">
              NEVER LOSE <br />
              <span className="text-brand-primary italic">A WARM LEAD.</span>
            </h2>
            <p className="text-xl font-medium text-white/30 leading-relaxed uppercase tracking-widest text-[12px]">
              Intelligent Sales Infrastructure
            </p>
          </div>
        </div>

        <p className="mt-auto text-[10px] font-black tracking-[0.2em] uppercase text-white/20">
          © {new Date().getFullYear()} Actiio AI. All rights reserved.
        </p>
      </div>

      {/* Right side - white login form */}
      <div className="flex w-full flex-col items-center justify-center bg-white px-8 lg:w-1/2">
        <div className="mb-12 lg:hidden">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.png" alt="Actiio Logo" width={24} height={24} className="h-6 w-auto" />
            <span className="text-xl font-bold tracking-tight text-brand-heading">Actiio</span>
          </Link>
        </div>
        <AuthForm mode="sign-in" />
      </div>
    </main>
  );
}
