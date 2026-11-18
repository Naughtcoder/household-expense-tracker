import Link from 'next/link'
import { supabaseServer } from '../../lib/supabase/server'
import { Nav } from '../nav'
import { ReviewCard, type ReviewRow } from './card'
import { UnparsedCard } from './unparsed'
import { DuplicateCard, type Pair } from './dupe'
import { NotifyToggle } from './notify'
import { ReviewQueue, type QueueRow } from './queue'

export const dynamic = 'force-dynamic'

export default async function Review({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  const { v } = await searchParams
  const view = v === 'in' || v === 'twice' ? v : 'file'
  const supabase = await supabaseServer()
  const [{ data, error: reviewError }, { data: catRows }, { data: unread }, { data: recent }] = await Promise.all([
    supabase.from('transactions')
      .select('id, amount, direction, occurred_on, occurred_at, merchant, merchant_key, merchant_raw, bank, scope, currency, account_tail, raw_text, category_id, note, flags, possible_duplicate_of, entered:people!transactions_entered_by_fkey(name), payer:people!transactions_paid_by_fkey(name)')
      .eq('status', 'review').order('occurred_on', { ascending: false }).order('occurred_at', { ascending: false, nullsFirst: false }).limit(1000),
    supabase.from('categories').select('id, name, parent_id').order('name'),
    supabase.from('unparsed').select('id, raw_text, created_at').eq('resolved', false)
      .order('created_at', { ascending: false }).limit(20),
    // What has actually been used lately, to put likely choices first.
    supabase.from('transactions').select('category_id')
      .eq('status', 'confirmed').not('category_id', 'is', null)
      .order('created_at', { ascending: false }).limit(60),
  ])

  // A failed query must not look like an empty queue. This one failed silently
  // for days when the database stopped resolving a join by constraint name.
  if (reviewError) throw new Error('Review could not load: ' + reviewError.message)
  const everything = (data ?? []) as unknown as (ReviewRow & Pair & { possible_duplicate_of: string | null })[]
  // Suspected twins are a different question from "what category is this", so
  // they get their own card and come first.
  // The other half of each pair is read by id. A self-join here came back as a
  // list, not a row, so the card showed "Unknown", "Invalid Date" and NaN.
  const pairIds = everything.map(r => r.possible_duplicate_of).filter(Boolean) as string[]
  const { data: twins } = pairIds.length
    ? await supabase.from('transactions').select('id, amount, occurred_on, merchant, merchant_key, bank, account_tail, raw_text').in('id', pairIds)
    : { data: [] }
  const twinById = new Map((twins ?? []).map(t => [t.id, t]))
  const dupes = everything.filter(r => r.possible_duplicate_of)
    .map(r => ({ ...r, twin: twinById.get(r.possible_duplicate_of!) ?? null }))
  const all = everything.filter(r => !r.possible_duplicate_of) as unknown as (ReviewRow & { direction?: string })[]
  const moneyIn = all.filter(r => r.direction === 'credit')
  const toFile = all.filter(r => r.direction !== 'credit')
  const rows = (view === 'in' ? moneyIn : toFile) as unknown as ReviewRow[]
  const categories = catRows ?? []
  const stuck = unread ?? []

  const tally = new Map<number, number>()
  for (const r of recent ?? []) tally.set(r.category_id!, (tally.get(r.category_id!) ?? 0) + 1)
  const suggested = [...tally.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 4)
    .map(([id]) => categories.find(c => c.id === id))
    .filter(Boolean) as typeof categories

  // How many other waiting rows share each merchant, so one tap can clear them all.
  const perMerchant = new Map<string, number>()
  for (const r of rows) if (r.merchant_key) perMerchant.set(r.merchant_key, (perMerchant.get(r.merchant_key) ?? 0) + 1)

  return (
    <>
      <Nav reviewCount={all.length + stuck.length + dupes.length} />
      <main className="wrap grid" style={{ gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h1>Review</h1>
          <span className="sub">{all.length + dupes.length} to sort</span>
        </div>

        <nav className="seg" aria-label="What to review">
          <Link href="/review" className={view === 'file' ? 'on' : ''}>To file · {toFile.length}</Link>
          <Link href="/review?v=in" className={view === 'in' ? 'on' : ''}>Money in · {moneyIn.length}</Link>
          <Link href="/review?v=twice" className={view === 'twice' ? 'on' : ''}>Twice · {dupes.length}</Link>
        </nav>

        <NotifyToggle />

        {view === 'twice' && dupes.map(d => <DuplicateCard key={d.id} row={d} />)}
        {view === 'twice' && dupes.length === 0 && <div className="card"><div className="empty">Nothing looks charged twice.</div></div>}

        {view !== 'twice' && <ReviewQueue rows={rows as unknown as QueueRow[]} categories={categories} suggested={suggested} />}

        {view === 'file' && stuck.length > 0 && (
          <>
            <div style={{ marginTop: 10 }}>
              <h2>Could not read</h2>
              <p className="sub" style={{ marginTop: 4 }}>
                Kept so a pattern can be written. Send me the text and try again after.
              </p>
            </div>
            {stuck.map(u => <UnparsedCard key={u.id} row={u} />)}
          </>
        )}
      </main>
    </>
  )
}
