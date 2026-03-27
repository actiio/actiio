import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

type CookieOptions = Parameters<Awaited<ReturnType<typeof cookies>>["set"]>[2];
type CookieToSet = {
  name: string;
  value: string;
  options?: CookieOptions;
};

function isReadonlyCookieStoreError(error: unknown) {
  return error instanceof Error && error.message.includes("Cookies can only be modified in a Server Action or Route Handler");
}

export async function getServerUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            try {
              cookieStore.set(name, value, options as CookieOptions);
            } catch (error) {
              // Server Components can read cookies during render, but writes must stay in middleware,
              // route handlers, or server actions. Ignore write attempts here and let proxy.ts refresh
              // session cookies when Next.js provides a writable response context.
              if (!isReadonlyCookieStoreError(error)) {
                throw error;
              }
            }
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}
