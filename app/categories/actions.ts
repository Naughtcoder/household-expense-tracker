'use server'
import { supabaseServer } from '../../lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { titleCase } from '../../lib/cats'

export type Result = { error?: string; ok?: string }

function read(formData: FormData) {
  const name = titleCase(String(formData.get('name') ?? ''))
  const parentId = Number(formData.get('parent_id')) || null
  return { name, parentId }
}

async function nameTaken(name: string, parentId: number | null, except?: number) {
  const supabase = await supabaseServer()
  let q = supabase.from('categories').select('id').ilike('name', name)
  q = parentId ? q.eq('parent_id', parentId) : q.is('parent_id', null)
  const { data } = await q
  return (data ?? []).some(c => c.id !== except)
}

export async function addCategory(_prev: Result, formData: FormData): Promise<Result> {
  const { name, parentId } = read(formData)
  if (!name) return { error: 'Give it a name.' }
  if (name.length > 40) return { error: 'Keep the name under 40 characters.' }
  if (await nameTaken(name, parentId)) return { error: `There is already a ${name} there.` }
  const supabase = await supabaseServer()
  const { data, error } = await supabase.from('categories').insert({ name, parent_id: parentId }).select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Nothing was added. An access rule is blocking it.' }
  revalidatePath('/', 'layout')
  return { ok: `Added ${name}.` }
}

export async function editCategory(_prev: Result, formData: FormData): Promise<Result> {
  const id = Number(formData.get('id'))
  const { name, parentId } = read(formData)
  if (!id) return { error: 'Which category?' }
  if (!name) return { error: 'Give it a name.' }
  if (parentId === id) return { error: 'A category cannot sit under itself.' }
  if (await nameTaken(name, parentId, id)) return { error: `There is already a ${name} there.` }
  const supabase = await supabaseServer()
  // The database refuses a move that would put a category under its own
  // subcategory, and says so.
  const { data, error } = await supabase.from('categories').update({ name, parent_id: parentId }).eq('id', id).select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Nothing changed. An access rule is blocking it.' }
  revalidatePath('/', 'layout')
  return { ok: 'Saved.' }
}

/** For the category list on a payment: makes one and hands back its id. */
export async function createCategory(name: string, parentId: number | null): Promise<{ id?: number; error?: string }> {
  const clean = titleCase(name)
  if (!clean) return { error: 'Give it a name.' }
  if (clean.length > 40) return { error: 'Keep the name under 40 characters.' }
  if (await nameTaken(clean, parentId)) return { error: `There is already a ${clean} there.` }
  const supabase = await supabaseServer()
  const { data, error } = await supabase.from('categories').insert({ name: clean, parent_id: parentId }).select('id').single()
  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return { id: data.id }
}
