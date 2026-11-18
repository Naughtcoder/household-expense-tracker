import { supabaseServer, supabaseAdmin } from '../../../lib/supabase/server'
import { publicKey } from '../../../lib/push'

export const runtime = 'nodejs'

/** The key a phone needs to subscribe. Only signed-in people reach this. */
export async function GET() {
  const key = await publicKey(supabaseAdmin())
  return key ? Response.json({ key }) : Response.json({ message: 'not configured' }, { status: 500 })
}

/** Save this phone's subscription against the signed-in person. */
export async function POST(req: Request) {
  const session = await supabaseServer()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return Response.json({ message: 'unauthorized' }, { status: 401 })

  const admin = supabaseAdmin()
  const { data: person } = await admin.from('people').select('id').eq('auth_uid', user.id).maybeSingle()
  if (!person) return Response.json({ message: 'no person for this login' }, { status: 403 })

  const sub = await req.json().catch(() => null)
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return Response.json({ message: 'not a subscription' }, { status: 400 })
  }
  const { error } = await admin.from('push_subscriptions').upsert({
    endpoint: sub.endpoint, person_id: person.id, p256dh: sub.keys.p256dh, auth: sub.keys.auth,
  })
  return error ? Response.json({ message: error.message }, { status: 500 }) : Response.json({ ok: true })
}
