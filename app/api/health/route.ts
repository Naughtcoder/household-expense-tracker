// Reports whether the deployment is configured. Names only, never values.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const present = (k: string) => Boolean(process.env[k] && process.env[k]!.length > 10)
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: present('NEXT_PUBLIC_SUPABASE_URL'),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: present('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    SUPABASE_SERVICE_ROLE_KEY: present('SUPABASE_SERVICE_ROLE_KEY'),
    NEXT_PUBLIC_SITE_URL: present('NEXT_PUBLIC_SITE_URL'),
  }

  let database: unknown = 'not tried'
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (url && env.SUPABASE_SERVICE_ROLE_KEY) {
    // Raw request rather than the client library, so the real HTTP status and
    // body come back instead of an empty error object.
    try {
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
      const r = await fetch(`${url.replace(/\/$/, '')}/rest/v1/people?select=id`, {
        headers: { apikey: key, authorization: `Bearer ${key}` },
        cache: 'no-store',
      })
      const body = await r.text()
      if (!r.ok) {
        database = { status: r.status, body: body.slice(0, 300) }
      } else {
        // Counts, so a failed ingest can be diagnosed without catching a
        // notification before it disappears.
        const head = { apikey: key, authorization: `Bearer ${key}`, prefer: 'count=exact' }
        const countOf = async (table: string, q = '') => {
          const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${table}?select=id${q}`, {
            headers: { ...head, range: '0-0' }, cache: 'no-store',
          })
          return res.headers.get('content-range')?.split('/')[1] ?? '?'
        }
        const latest = await fetch(
          `${url.replace(/\/$/, '')}/rest/v1/transactions?select=occurred_on,merchant,amount,status,scope,direction,category_id,pattern_id,bank&order=created_at.desc&limit=6`,
          { headers: head, cache: 'no-store' }).then(x => x.json()).catch(() => [])
        const unread = await fetch(
          `${url.replace(/\/$/, '')}/rest/v1/unparsed?select=created_at,raw_text&resolved=is.false&order=created_at.desc&limit=5`,
          { headers: head, cache: 'no-store' }).then(x => x.json()).catch(() => [])
        const inReview = await fetch(
          `${url.replace(/\/$/, '')}/rest/v1/transactions?select=id,merchant,amount,status,category_id,scope&status=eq.review`,
          { headers: head, cache: 'no-store' }).then(x => x.json()).catch(() => [])
        const cats = await fetch(`${url.replace(/\/$/, '')}/rest/v1/categories?select=id,name,parent_id&order=id`,
          { headers: head, cache: 'no-store' }).then(x => x.json()).catch(() => [])
        const rules = await fetch(`${url.replace(/\/$/, '')}/rest/v1/merchant_rules?select=match_key,merchant,category_id,default_scope`,
          { headers: head, cache: 'no-store' }).then(x => x.json()).catch(() => [])
        database = {
          people: JSON.parse(body).length,
          categories: Array.isArray(cats) ? cats.length : cats,
          categoryIds: Array.isArray(cats) ? cats.map((c: {id: number}) => c.id).slice(0, 80) : [],
          rules,
          inReview,
          transactions: await countOf('transactions'),
          unparsed: await countOf('unparsed'),
          latest,
          unread,
        }
      }
    } catch (e) {
      database = { threw: (e as Error).message }
    }
  }

  // Which key is which, without showing either.
  const shape = (k: string) => {
    const v = process.env[k]
    if (!v) return 'missing'
    if (v.startsWith('eyJ')) {
      try {
        const role = JSON.parse(Buffer.from(v.split('.')[1], 'base64').toString()).role
        return `jwt role=${role}`
      } catch { return 'jwt, unreadable' }
    }
    return `${v.slice(0, 6)}… len ${v.length}`
  }
  const keys = {
    NEXT_PUBLIC_SUPABASE_ANON_KEY: shape('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    SUPABASE_SERVICE_ROLE_KEY: shape('SUPABASE_SERVICE_ROLE_KEY'),
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'missing',
  }

  const ok = Object.values(env).every(Boolean) && typeof database === 'object' && database !== null && 'people' in database
  return Response.json({ ok, env, keys, database }, { status: ok ? 200 : 503 })
}
