import Link from 'next/link'
import { supabaseServer } from '../../lib/supabase/server'
import { Nav } from '../nav'
import { AddForms } from './forms'

export const dynamic = 'force-dynamic'

// Android shares land here as ?text=... through the manifest's share target.
export default async function Add({ searchParams }: { searchParams: Promise<{ text?: string; title?: string }> }) {
  const sp = await searchParams
  const shared = [sp.title, sp.text].filter(Boolean).join('\n')
  const supabase = await supabaseServer()
  const [{ data: cats }, { count }] = await Promise.all([
    supabase.from('categories').select('id, name, parent_id').order('name'),
    supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('status', 'review'),
  ])

  const today = new Date()
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  return (
    <>
      <Nav reviewCount={count ?? 0} />
      <main className="wrap grid" style={{ gap: 16 }}>
        <div>
          <h1>Add cash</h1>
          <p className="sub" style={{ marginTop: 4 }}>
            Card and UPI payments arrive from the bank emails by themselves. This is for cash.
          </p>
        </div>
        <AddForms categories={cats ?? []} shared={shared} today={iso} />
        <Link className="stat" href="/plan" style={{ display: 'block' }}>
          <div className="k">About to pay something that covers more than one thing?</div>
          <div className="v" style={{ fontSize: 15 }}>Plan a payment, and it splits itself when it arrives</div>
        </Link>
      </main>
    </>
  )
}
