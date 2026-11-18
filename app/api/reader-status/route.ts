import { supabaseAdmin } from '../../../lib/supabase/server'
import { personForKey } from '../../../lib/intake'

export const runtime = 'nodejs'

type Report = {
  event?: string; at?: number; screenReader?: boolean; notificationReader?: boolean
  sms?: boolean; errors?: number; detail?: string; appVersion?: string
}
// app_exit, android_warning, android_warning_closed: why a reader went off (phone build 13 on, see OffReason.java).
const EVENTS = new Set(['status', 'screen_on', 'screen_off', 'screen_error', 'notification_on', 'notification_off', 'linked', 'app_open',
  'app_exit', 'android_warning', 'android_warning_closed'])
const bool = (v: unknown) => (typeof v === 'boolean' ? v : null)

/**
 * An Android phone reporting whether its payment readers are on (see
 * ReaderStatus.java). Up to 50 reports at a time, queued while offline.
 * The alarm job turns an "off" into a notification.
 */
export async function POST(req: Request) {
  const supabase = supabaseAdmin()
  const person = await personForKey(supabase, req.headers.get('x-api-key') ?? '')
  if (!person) return Response.json({ message: 'unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => null)
  const items: Report[] = Array.isArray(body?.items) ? body.items.slice(0, 50) : []
  const rows = items.filter(r => EVENTS.has(String(r?.event))).map(r => {
    const at = new Date(Number(r.at))
    return {
      person_id: person.id,
      at: isNaN(at.getTime()) ? new Date().toISOString() : at.toISOString(),
      event: String(r.event),
      screen_reader: bool(r.screenReader),
      notification_reader: bool(r.notificationReader),
      sms: bool(r.sms),
      errors: Number.isFinite(Number(r.errors)) ? Math.trunc(Number(r.errors)) : null,
      detail: r.detail ? String(r.detail).slice(0, 600) : null,
      app_version: r.appVersion ? String(r.appVersion).slice(0, 40) : null,
    }
  })
  if (rows.length) {
    const { error } = await supabase.from('reader_status').insert(rows)
    if (error) return Response.json({ message: error.message }, { status: 500 })
  }
  return Response.json({ saved: rows.length })
}
