import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Vercel's Hobby plan puts this app on a public URL with no wall in front of
// it, so this middleware is the only thing between the internet and the
// household's finances. Everything except login and the keyed phone endpoints
// (ingest, reader-status, crash-report) requires a session.
//
// It must never throw. A middleware that throws returns
// MIDDLEWARE_INVOCATION_FAILED for every route, including the login page, so a
// small misconfiguration takes the whole site down rather than one page.
export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname
  const open = path.startsWith('/login') || path.startsWith('/auth') || path.startsWith('/api/health')

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Misconfigured rather than broken. Say so plainly instead of a blank 500,
  // and refuse every page, because we cannot tell who anyone is.
  if (!url || !anon) {
    if (path.startsWith('/api/health')) return NextResponse.next({ request })
    return new NextResponse(
      'Supabase environment variables are missing on this deployment.\n' +
      'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel, then redeploy.\n' +
      'Visit /api/health for detail.\n',
      { status: 503, headers: { 'content-type': 'text/plain' } },
    )
  }

  let response = NextResponse.next({ request })

  try {
    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list: { name: string; value: string; options: CookieOptions }[]) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    })

    // getClaims checks the signed token here, without a round trip to the
    // login server on every tap; it refreshes an expired session itself.
    // getUser asked the server each time, which added a network hop to
    // every page. Writes still confirm the user with the server.
    const { data: claims } = await supabase.auth.getClaims()
    const user = claims?.claims?.sub ? claims.claims : null

    if (!user && !open) {
      const to = request.nextUrl.clone()
      to.pathname = '/login'
      return NextResponse.redirect(to)
    }
    if (user && path.startsWith('/login')) {
      const to = request.nextUrl.clone()
      to.pathname = '/'
      return NextResponse.redirect(to)
    }
    return response
  } catch {
    // Supabase unreachable, or a bad key. Treat the caller as a stranger and
    // send them to login rather than serving anything.
    if (open) return NextResponse.next({ request })
    const to = request.nextUrl.clone()
    to.pathname = '/login'
    return NextResponse.redirect(to)
  }
}

export const config = {
  // Anything the browser or the launcher fetches before anyone has signed in.
  // `icon-` with a hyphen matched icon-192.png and walked straight past
  // icon.svg, so the svg favicon was answering with a redirect to the login
  // page. The character class covers both spellings.
  matcher: ['/((?!api/ingest|api/reader-status|api/crash-report|api/cron|api/app|api/updates|_next/static|_next/image|favicon.ico|manifest.webmanifest|icon[-.]|apple-touch-icon|sw.js).*)'],
}
