import { supabaseServer } from '../../lib/supabase/server'
import { Nav } from '../nav'
import { Crumbs } from '../crumbs'
import { Manager } from './manager'

export const dynamic = 'force-dynamic'

export default async function Categories() {
  const supabase = await supabaseServer()
  const [{ data: cats }, { count: reviewCount }] = await Promise.all([
    supabase.from('categories').select('id, name, parent_id').order('name'),
    supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('status', 'review'),
  ])
  return (
    <>
      <Nav reviewCount={reviewCount ?? 0} />
      <main className="wrap grid" style={{ gap: 16 }}>
        <Crumbs fallback="/" trail={[{ label: 'Home', href: '/' }, { label: 'Categories' }]} />
        <Manager categories={cats ?? []} />
      </main>
    </>
  )
}
