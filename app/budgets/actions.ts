'use server'
import { revalidatePath } from 'next/cache'
import { supabaseServer } from '../../lib/supabase/server'

/** Set or clear one category's monthly limit. Blank or zero clears it. */
export async function setBudget(categoryId: number, monthly: number | null) {
  const supabase = await supabaseServer()
  const { error } = monthly && monthly > 0
    ? await supabase.from('budgets').upsert({ category_id: categoryId, monthly, updated_at: new Date().toISOString() })
    : await supabase.from('budgets').delete().eq('category_id', categoryId)
  if (error) return { error: error.message }
  revalidatePath('/budgets'); revalidatePath('/')
  return {}
}
