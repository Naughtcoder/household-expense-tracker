import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies, headers } from 'next/headers'

/** Acts as the logged-in person. Row level security applies.
 *
 *  The website signs in with a cookie. The phone app calls /api/app with its
 *  own sign-in token instead, and every server action then runs as that
 *  person through the same code, so the two can never file a payment
 *  differently. */
export async function supabaseServer() {
  const bearer = (await headers()).get('authorization')
  if (bearer?.startsWith('Bearer ')) {
    const token = bearer.slice(7)
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: bearer } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    // There is no stored session, so "who is this" has to be asked with the token.
    const getUser = client.auth.getUser.bind(client.auth)
    client.auth.getUser = ((jwt?: string) => getUser(jwt ?? token)) as typeof client.auth.getUser
    return client as unknown as ReturnType<typeof createServerClient>
  }
  const store = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list: { name: string; value: string; options: CookieOptions }[]) => {
          try { list.forEach(({ name, value, options }) => store.set(name, value, options)) }
          catch { /* called from a server component, middleware refreshes instead */ }
        },
      },
    },
  )
}

/** Bypasses row level security. Only for the ingest endpoint, which has no session. */
export function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}
