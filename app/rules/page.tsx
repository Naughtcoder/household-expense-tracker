import { supabaseServer } from '../../lib/supabase/server'
import { catTree } from '../../lib/cats'
import { Nav } from '../nav'
import { RuleRow } from './row'
import { NewRule } from './new'

export const dynamic = 'force-dynamic'

export default async function Rules() {
  const supabase = await supabaseServer()
  const [{ data: rules }, { data: cats }, { count: reviewCount }] = await Promise.all([
    supabase.from('merchant_rules')
      .select('*').order('merchant'),
    supabase.from('categories').select('id, name, parent_id').order('name'),
    supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('status', 'review'),
  ])
  const all = cats ?? []
  const tree = catTree(all)
  const label = (id: number | null) => tree.label(id) || 'Uncategorised'

  return (
    <>
      <Nav reviewCount={reviewCount ?? 0} />
      <main className="wrap grid" style={{ gap: 14 }}>
        <div>
          <h1>Rules</h1>
          <p className="sub" style={{ marginTop: 4 }}>
            Written every time you file something in Review, or made here. A wrong one repeats forever until you change it here.
          </p>
        </div>
        <NewRule categories={all} />
        <section className="card">
          <div className="rows">
            {(rules ?? []).map(r => (
              <RuleRow key={r.id} rule={r} categories={all} label={label(r.category_id)} />
            ))}
            {(rules ?? []).length === 0 && (
              <div className="empty">No rules yet. They appear as you file things in Review.</div>
            )}
          </div>
        </section>
      </main>
    </>
  )
}
