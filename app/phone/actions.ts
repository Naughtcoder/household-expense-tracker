'use server'
import { supabaseServer, supabaseAdmin } from '../../lib/supabase/server'
import { mintDeviceKey } from '../../lib/intake'

/**
 * A key for the phone this page is open on, for its SMS reader. Only someone
 * signed in can make one, and it belongs to them: texts it sends are filed as
 * paid by that person.
 */
export async function linkThisPhone(label: string): Promise<{ key?: string; name?: string; error?: string }> {
  const supabase = await supabaseServer()
  const { data } = await supabase.auth.getUser()
  const { data: person } = await supabase.from('people').select('id, name').eq('auth_uid', data.user?.id ?? '').maybeSingle()
  if (!person) return { error: 'Sign in first.' }
  try {
    const key = await mintDeviceKey(supabaseAdmin(), person.id, label.slice(0, 60) || 'Android phone')
    return { key, name: person.name }
  } catch (e) {
    return { error: (e as Error).message }
  }
}
