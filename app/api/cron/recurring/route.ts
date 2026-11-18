import { supabaseAdmin } from '../../../../lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The daily job. It used to book rent and the staff salaries on the 1st as if
 * they had been paid. Alex ruled on 1 October 2026 that nothing is booked
 * until the money actually moves, and the bank emails now report rent
 * transfers, so the posting is gone. Recurring entries stay as a list of what
 * is expected each month; they never create a transaction.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }
  const supabase = supabaseAdmin()

  // While we are here once a day: re-learn what the words in a merchant name
  // suggest. Every category confirmed since yesterday makes the next unknown
  // merchant a little more likely to arrive pre-filled.
  let hints: number | string = 0
  const { data: rebuilt, error: hintError } = await supabase.rpc('rebuild_category_hints')
  hints = hintError ? hintError.message : (rebuilt ?? 0)

  return Response.json({ hints })
}
