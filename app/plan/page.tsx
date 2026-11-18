import Link from 'next/link'
import { supabaseServer } from '../../lib/supabase/server'
import { Nav } from '../nav'
import { PEOPLE } from '../../lib/drill'
import { catTree } from '../../lib/cats'
import { dayLabel } from '../../lib/format'
import { inrSigned } from '../parts'
import { Plans, type PlanRow } from './form'

export const dynamic = 'force-dynamic'

/**
 * Plan a payment. A split written down before the money goes, so that when
 * the bank's message arrives it is filed in parts by itself: rent, then
 * maintenance, then what the landlord paid back.
 */
export default async function Plan() {
  const supabase = await supabaseServer()
  const { data: u } = await supabase.auth.getUser()
  const [{ data: cats }, { count }, { data: open }, { data: done }, { data: me }] = await Promise.all([
    supabase.from('categories').select('id, name, parent_id').order('name'),
    supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('status', 'review'),
    supabase.from('planned_splits').select('*').eq('status', 'open').order('window_from'),
    supabase.from('planned_splits').select('*').neq('status', 'open').order('created_at', { ascending: false }).limit(10),
    supabase.from('people').select('id').eq('auth_uid', u.user?.id ?? '').maybeSingle(),
  ])
  const tree = catTree(cats ?? [])
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

  return (
    <>
      <Nav reviewCount={count ?? 0} />
      <main className="wrap grid" style={{ gap: 16 }}>
        <div>
          <h1>Plan a payment</h1>
          <p className="sub" style={{ marginTop: 4 }}>
            Say how a payment you are about to make splits up. When it arrives from the bank, inside the dates, to that payee or for exactly that amount, it is split by itself.
            If the payee matches but the amount is different, it waits in Review for you to change the parts.
          </p>
        </div>

        <Plans plans={(open ?? []) as PlanRow[]} categories={cats ?? []} people={PEOPLE} me={me?.id ?? Object.keys(PEOPLE)[0]} today={today} />

        {!!done?.length && (
          <section className="card">
            <div className="label">Used and cancelled</div>
            {(done as PlanRow[]).map(p => (
              <div key={p.id} className="row" style={{ alignItems: 'center' }}>
                {p.applied_to ? (
                  <Link href={`/t/${p.applied_to}`} style={{ minWidth: 0, flex: 1 }}>
                    <div className="name">{p.payee_hint ?? 'Any payee'} · {inrSigned(Number(p.expected_amount))}</div>
                    <div className="who">Applied{p.applied_at ? ` ${dayLabel(p.applied_at.slice(0, 10))}` : ''} · {(p.parts ?? []).map(x => tree.name(x.category_id) ?? 'part').join(', ')}</div>
                  </Link>
                ) : (
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="name">{p.payee_hint ?? 'Any payee'} · {inrSigned(Number(p.expected_amount))}</div>
                    <div className="who">{p.status === 'cancelled' ? 'Cancelled' : p.status}</div>
                  </div>
                )}
              </div>
            ))}
          </section>
        )}
      </main>
    </>
  )
}
