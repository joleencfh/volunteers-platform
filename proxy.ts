import { NextResponse, type NextRequest } from 'next/server'
import { localeForPath } from '@/lib/domain/locale'

// Every page lives under app/[lang]. The locale comes from the path (legal routes are Italian,
// the rest English), so the URL is rewritten, not redirected: visitors never see /en or /it.
export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone()
  url.pathname = `/${localeForPath(request.nextUrl.pathname)}${request.nextUrl.pathname}`
  return NextResponse.rewrite(url)
}

export const config = {
  // Pages only: skip Next.js internals and files with an extension (favicon, images).
  matcher: ['/((?!_next|.*\\..*).*)'],
}
