import { supabaseServer } from '../../lib/supabase/server'
import { Nav } from '../nav'
import { Manager } from './manager'

export const dynamic = 'force-dynamic'

export default async function Recurring() {
  const supabase = await supabaseServer()
  const [{ data: entries }, { data: cats }, { data: people }, { count: reviewCount }] = await Promise.all([
    supabase.from('recurring').select('id, label, amount, last_amount, day_of_month, category_id, scope, paid_by, active').order('day_of_month'),
    supabase.from('categories').select('id, name, parent_id').order('name'),
    supabase.from('people').select('id, name').order('name'),
    supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('status', 'review'),
  ])

  return (
    <>
      <Nav reviewCount={reviewCount ?? 0} />
      <main className="wrap grid" style={{ gap: 14 }}>
        <div>
          <h1>Recurring</h1>
          <p className="sub" style={{ marginTop: 4 }}>
            What you expect to pay every month. Nothing here is booked as spending
            until the bank reports the payment.
          </p>
        </div>
        <Manager
          entries={entries ?? []}
          categories={cats ?? []}
          people={people ?? []}
        />
      </main>
    </>
  )
}
