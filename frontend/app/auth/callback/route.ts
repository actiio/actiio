import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

import { safeRelativePath } from '@/lib/sanitize'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Email confirmations should land on sign-in unless an explicit next path is provided.
  const next = safeRelativePath(searchParams.get('next'), '/sign-in')

  if (code) {
    const nextPath = `${origin}${next}`
    const response = NextResponse.redirect(nextPath)
    
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          async getAll() {
            const cookieStore = await cookies()
            return cookieStore.getAll()
          },
          setAll(cookiesToSet: any[]) {
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options)
            })
          },
        },
      }
    )
    
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error) {
      const forwardedHost = request.headers.get('x-forwarded-host')
      const isLocalEnv = process.env.NODE_ENV === 'development'

      const isAllowedHost = forwardedHost && (
        forwardedHost.endsWith('.actiio.co') || 
        forwardedHost === 'actiio.co' ||
        forwardedHost.endsWith('.vercel.app')
      )

      if (isLocalEnv) {
        return response
      } else if (forwardedHost && isAllowedHost) {
        // Update the redirect URL if we are on a whitelisted host
        const finalUrl = new URL(next, `https://${forwardedHost}`)
        const finalResponse = NextResponse.redirect(finalUrl.toString())
        // Copy cookies to the new response
        response.cookies.getAll().forEach((cookie) => {
          finalResponse.cookies.set(cookie.name, cookie.value)
        })
        return finalResponse
      } else {
        return response
      }
    }
  }

  // Handle errors
  return NextResponse.redirect(`${origin}/sign-in?error=Invalid_Token`)
}
