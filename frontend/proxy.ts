import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = {
  name: string;
  value: string;
  options?: Record<string, unknown>;
};

function describeError(error: unknown): string {
  if (error instanceof Error) {
    const cause = "cause" in error ? (error as Error & { cause?: unknown }).cause : undefined;
    const causeMessage = cause instanceof Error ? cause.message : String(cause ?? "");
    return `${error.message} ${causeMessage}`.toLowerCase();
  }
  return String(error).toLowerCase();
}

function isSupabaseTlsError(error: unknown): boolean {
  const text = describeError(error);
  return (
    text.includes("cert_not_yet_valid") ||
    text.includes("certificate is not yet valid") ||
    text.includes("self signed certificate") ||
    text.includes("unable to verify the first certificate")
  );
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value));
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2])
          );
        },
      },
    }
  );

  let user = null;
  try {
    const {
      data: { user: resolvedUser },
    } = await supabase.auth.getUser();
    user = resolvedUser;
  } catch (error) {
    if (isSupabaseTlsError(error)) {
      console.warn(
        "[proxy] Supabase TLS validation failed. Check your system clock and NEXT_PUBLIC_SUPABASE_URL certificate validity."
      );
      return response;
    }
    throw error;
  }

  const isProtected =
    pathname === "/agents" ||
    pathname.startsWith("/agents/") ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/settings");

  if (isProtected && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/sign-in";
    redirectUrl.searchParams.set("next", "/agents");
    return NextResponse.redirect(redirectUrl);
  }

  if ((pathname === "/sign-in" || pathname === "/sign-up") && user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/agents";
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: ["/agents", "/agents/:path*", "/dashboard/:path*", "/onboarding/:path*", "/settings/:path*", "/sign-in", "/sign-up"],
};
