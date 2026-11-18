import { supabaseAdmin } from '../../../lib/supabase/server'
import { ingestText } from '../../../lib/ingest'
import { personForKey, logIntake } from '../../../lib/intake'

export const runtime = 'nodejs'

type Item = { text: string; at?: number | string; id?: string }

/**
 * Bank texts from a phone. One message, or a batch of up to 100 for a
 * history read.
 *
 * Each can carry when it arrived (`at`) and a stable id, so a resend after a
 * dropped connection is recognised and not booked twice. A history batch is
 * filed quietly: no phone notification for payments months old.
 */
export async function POST(req: Request) {
  // The key travels in a header. URLs end up in logs, so it never goes there.
  const supabase = supabaseAdmin()
  const person = await personForKey(supabase, req.headers.get('x-api-key') ?? '')
  if (!person) return Response.json({ message: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const items: Item[] = Array.isArray(body?.items) ? body.items.slice(0, 100) : [{ text: body?.text ?? '', at: body?.at, id: body?.id }]
  if (!items.some(i => String(i?.text ?? '').trim())) return Response.json({ message: 'nothing to read' }, { status: 400 })

  // A phone automation fires at every message matching a word, so some of what
  // arrives here will be nobody's business. Those get read and forgotten.
  // The Android reader is not unattended in that sense: the phone has already
  // kept only bank payment texts, so one the books cannot read is a format to
  // learn and must be kept. Dropping them lost 645 of Sam's on 3 Oct.
  const unattended = body?.source === 'auto'
  const history = body?.history === true
  const source = body?.source === 'android' ? (history ? 'sms-android-history' : 'sms-android') : unattended ? 'sms-auto' : 'sms-hand'

  const totals = { saved: 0, duplicates: 0, refused: 0, unreadable: 0 }
  for (const item of items) {
    const text = String(item?.text ?? '')
    if (!text.trim()) continue
    const at = item.at !== undefined ? new Date(typeof item.at === 'string' && /^\d+$/.test(item.at) ? Number(item.at) : item.at) : new Date()
    const key = item.id ? `sms:${person.id.slice(0, 8)}:${String(item.id).slice(0, 80)}` : undefined
    try {
      const result = await ingestText(supabase, text, person.id, unattended, key, history, isNaN(at.getTime()) ? new Date() : at)
      await logIntake(supabase, { person_id: person.id, source, text, ...result })
      for (const k of Object.keys(totals) as (keyof typeof totals)[]) totals[k] += Number(result[k] ?? 0)
    } catch (e) {
      await logIntake(supabase, { person_id: person.id, source, text, error: (e as Error).message })
      if (items.length === 1) return Response.json({ message: (e as Error).message }, { status: 500 })
    }
  }
  return Response.json(totals)
}
