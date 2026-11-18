import { supabaseAdmin } from '../../../lib/supabase/server'
import { personForKey } from '../../../lib/intake'

export const runtime = 'nodejs'

/** Gzipped reports only, and well under Vercel's 4.5 MB request limit. */
const MAX_BYTES = 4_000_000

/**
 * One crash report from an Android phone (see CrashReports.java): the gzipped
 * tombstone or freeze trace Android stored for one app stop. Sent again after
 * a failure, so a repeat of the same crash time is accepted and ignored.
 */
export async function POST(req: Request) {
  const supabase = supabaseAdmin()
  const person = await personForKey(supabase, req.headers.get('x-api-key') ?? '')
  if (!person) return Response.json({ message: 'unauthorized' }, { status: 401 })
  const at = new Date(Number(req.headers.get('x-crash-at')))
  const reason = Math.trunc(Number(req.headers.get('x-crash-reason')))
  if (isNaN(at.getTime()) || !Number.isFinite(reason)) return Response.json({ message: 'x-crash-at and x-crash-reason needed' }, { status: 400 })
  const body = Buffer.from(await req.arrayBuffer())
  if (!body.length || body.length > MAX_BYTES) return Response.json({ message: `report must be 1 to ${MAX_BYTES} bytes` }, { status: 413 })
  const { error } = await supabase.from('crash_reports').upsert({
    person_id: person.id,
    crashed_at: at.toISOString(),
    reason,
    app_version: (req.headers.get('x-app-version') ?? '').slice(0, 40) || null,
    bytes: body.length,
    body: '\\x' + body.toString('hex'),
  }, { onConflict: 'person_id,crashed_at', ignoreDuplicates: true })
  if (error) return Response.json({ message: error.message }, { status: 500 })
  return Response.json({ saved: 1 })
}
