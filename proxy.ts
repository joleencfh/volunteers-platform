import { NextResponse, type NextRequest } from 'next/server'
import { localeForPath } from '@/lib/domain/locale'
import { isAuthRoute, isPublicRoute } from '@/lib/domain/routes'
import { refreshSession } from '@/lib/supabase/session'

// Runs on every page request. It refreshes the session cookies, sends logged-out visitors from
// protected routes to /login, and picks the locale. Every page lives under app/[lang]; the locale
// comes from the path (legal routes are Italian, the rest English), so the URL is rewritten, not
// redirected: visitors never see /en or /it. /auth/* are route handlers outside that tree.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  const respond = () => {
    if (isAuthRoute(pathname)) return NextResponse.next({ request })
    const url = request.nextUrl.clone()
    url.pathname = `/${localeForPath(pathname)}${pathname}`
    return NextResponse.rewrite(url, { request })
  }

  const { response, signedIn } = await refreshSession(request, respond)

  const redirectTo = (path: string) => {
    const redirect = NextResponse.redirect(new URL(path, request.url))
    // Keep the refreshed session cookies on the redirect.
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
    return redirect
  }

  if (!signedIn && !isPublicRoute(pathname, process.env.NODE_ENV !== 'production')) {
    return redirectTo('/login')
  }
  // A refused sign-in lands on /login?error=...; do not bounce those away.
  if (signedIn && pathname === '/login' && !request.nextUrl.searchParams.has('error')) {
    return redirectTo('/')
  }
  return response
}

export const config = {
  // Pages only: skip Next.js internals and files with an extension (favicon, images).
  matcher: ['/((?!_next|.*\\..*).*)'],
}
