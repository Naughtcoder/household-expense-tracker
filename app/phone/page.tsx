import { supabaseServer } from '../../lib/supabase/server'
import { Nav } from '../nav'
import { PhoneSetup } from './client'

export const dynamic = 'force-dynamic'

export default async function Phone() {
  const supabase = await supabaseServer()
  const { count } = await supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('status', 'review')
  return (
    <>
      <Nav reviewCount={count ?? 0} />
      <main className="wrap grid" style={{ gap: 14 }}>
        <h1>This phone</h1>
        <PhoneSetup />
      </main>
    </>
  )
}
