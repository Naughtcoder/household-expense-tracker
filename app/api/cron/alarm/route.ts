import { supabaseAdmin } from '../../../../lib/supabase/server'
import { personForKey } from '../../../../lib/intake'
import { notifyEveryone } from '../../../../lib/push'
import { findProblems, syncAlarms, syncGaps } from '../../../../lib/alarms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Called every 3 hours by GitHub (.github/workflows/alarm.yml) with a phone's
 * key. Looks for silent failures, keeps the alarms table in step, and sends a
 * notification for each alarm that is new or a day old. Add ?dry=1 to see
 * what it found without changing or sending anything.
 */
export async function POST(req: Request) {
  const supabase = supabaseAdmin()
  if (!(await personForKey(supabase, req.headers.get('x-api-key') ?? ''))) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }
  const findings = await findProblems(supabase)
  if (new URL(req.url).searchParams.get('dry')) return Response.json({ findings })
  const notify = await syncAlarms(supabase, findings)
  await syncGaps(supabase)
  for (const f of notify) {
    await notifyEveryone(supabase, { title: f.kind === 'gap' ? 'Phone back, some payments missing' : 'Expense tracker needs a look', body: f.message, url: '/', tag: `alarm-${f.kind}-${f.person_id ?? 'all'}` })
  }
  return Response.json({ found: findings.length, notified: notify.length })
}
