import { supabaseAdmin } from '../../../../lib/supabase/server'
import { notifyEveryone } from '../../../../lib/push'
import { digestText } from '../../../../lib/insights'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const iso = (d: Date) => d.toISOString().slice(0, 10)

/**
 * Monday morning, 9:00 in Bengaluru. One notification to each phone with last
 * week's spend, any budget past 80%, and how many payments are waiting.
 * Add ?dry=1 to see the text without sending it.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }
  const supabase = supabaseAdmin()
  const now = new Date()
  // Monday to Sunday just gone.
  const end = new Date(now); end.setUTCDate(now.getUTCDate() - ((now.getUTCDay() + 6) % 7) - 1)
  const start = new Date(end); start.setUTCDate(end.getUTCDate() - 6)
  const back = new Date(start); back.setUTCDate(start.getUTCDate() - 7 * 12)
  const monthFrom = iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)))

  const [{ data: week }, { data: hist }, { count: waiting }, { data: month }, { data: budgets }, { data: cats }] = await Promise.all([
    supabase.rpc('spend_by_top', { p_from: iso(start), p_to: iso(end) }),
    supabase.rpc('spend_by_top', { p_from: iso(back), p_to: iso(new Date(start.getTime() - 86400000)) }),
    supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('status', 'review'),
    supabase.rpc('spend_by_top', { p_from: monthFrom, p_to: iso(now) }),
    supabase.from('budgets').select('category_id, monthly'),
    supabase.from('categories').select('id, name'),
  ])
  const sum = (rows: { total: number }[] | null) => (rows ?? []).reduce((s, r) => s + Number(r.total), 0)
  const spentByTop = new Map<number, number>()
  for (const r of (month ?? []) as { top_id: number; total: number }[]) spentByTop.set(r.top_id, (spentByTop.get(r.top_id) ?? 0) + Number(r.total))
  const name = new Map((cats ?? []).map(c => [c.id, c.name]))

  const body = digestText({
    week: sum(week), usualWeek: sum(hist) / 12, waiting: waiting ?? 0,
    budgets: (budgets ?? []).map(b => ({ name: name.get(b.category_id) ?? '?', used: (spentByTop.get(b.category_id) ?? 0) / Number(b.monthly) })),
  })
  const msg = { title: 'Your week in money', body, url: '/', tag: `digest-${iso(end)}` }
  if (new URL(req.url).searchParams.get('dry')) return Response.json({ dry: true, ...msg })
  const sent = await notifyEveryone(supabase, msg)
  return Response.json({ sent, ...msg })
}
