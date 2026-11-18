import { supabaseServer } from '../../lib/supabase/server'
import { Nav } from '../nav'
import { ImportForm } from './form'

export const dynamic = 'force-dynamic'

export default async function Import() {
  const supabase = await supabaseServer()
  const { count } = await supabase.from('transactions')
    .select('id', { count: 'exact', head: true }).eq('status', 'review')

  return (
    <>
      <Nav reviewCount={count ?? 0} />
      <main className="wrap grid" style={{ gap: 14 }}>
        <div>
          <h1>Import a statement</h1>
          <p className="sub" style={{ marginTop: 4 }}>
            For everything that happened before the app existed, and for anything
            a message never reached you about.
          </p>
        </div>
        <ImportForm />
        <section className="card">
          <div className="label">Where to get the file</div>
          <p className="sub" style={{ marginTop: 8 }}>
            BankA net banking, Cards, then Statements, downloaded as CSV rather
            than PDF. Money Manager exports from its own menu, and its categories
            are kept rather than thrown away.
          </p>
        </section>
      </main>
    </>
  )
}
