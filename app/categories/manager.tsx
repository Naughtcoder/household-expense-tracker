'use client'
import { useActionState, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { addCategory, editCategory, type Result } from './actions'
import { catTree, type Cat } from '../../lib/cats'
import { CatOptions } from '../catoptions'
import { CatIcon } from '../caticon'

/** Add a category anywhere in the tree, rename one, or move it under another.
 *  Nothing is deleted: a category with history is renamed or moved instead. */
export function Manager({ categories }: { categories: Cat[] }) {
  const tree = catTree(categories)
  const [state, act, pending] = useActionState<Result, FormData>(addCategory, {})
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => { if (state.ok) form.current?.reset() }, [state])
  const [editing, setEditing] = useState<number | null>(null)

  return (
    <>
      <section className="card">
        <h2>Add a category</h2>
        <p className="sub" style={{ marginTop: 4 }}>Put it under any category to nest it, as deep as you like. Leave it at the top for a new group.</p>
        <form ref={form} action={act} className="grid" style={{ gap: 10, marginTop: 12 }}>
          <input name="name" className="input" placeholder="Name, for example Toll" autoComplete="off" required />
          <select name="parent_id" className="input" defaultValue="">
            <option value="">At the top, a new group</option>
            <CatOptions categories={categories} />
          </select>
          <button className="btn" disabled={pending}>{pending ? 'Adding' : 'Add category'}</button>
          {state.error && <p className="sub" style={{ color: 'var(--warn)' }}>{state.error}</p>}
          {state.ok && <p className="sub" style={{ color: 'var(--positive)' }}>{state.ok}</p>}
        </form>
      </section>

      <section className="card">
        <h2>All categories</h2>
        <div style={{ marginTop: 8 }}>
          {tree.flat().map(({ cat, depth }) => (
            <div key={cat.id} className="row" style={{ display: 'block', paddingLeft: depth * 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
                <Link href={`/c/${cat.id}`} className="irow" style={{ gap: 10, minWidth: 0 }}>
                  <CatIcon name={cat.name} group={tree.root(cat.id)?.name} size={depth ? 28 : 34} />
                  <span className="name" style={{ fontWeight: depth ? 400 : 600 }}>{cat.name}</span>
                </Link>
                <button className="chip" onClick={() => setEditing(editing === cat.id ? null : cat.id)}>
                  {editing === cat.id ? 'Close' : 'Change'}
                </button>
              </div>
              {editing === cat.id && <Edit cat={cat} categories={categories} onDone={() => setEditing(null)} />}
            </div>
          ))}
        </div>
      </section>
    </>
  )
}

function Edit({ cat, categories, onDone }: { cat: Cat; categories: Cat[]; onDone: () => void }) {
  const [state, act, pending] = useActionState<Result, FormData>(editCategory, {})
  useEffect(() => { if (state.ok) onDone() }, [state, onDone])
  // It cannot move under itself or anything below it.
  const blocked = new Set(catTree(categories).family(cat.id))
  const choices = categories.filter(c => !blocked.has(c.id))
  return (
    <form action={act} className="grid" style={{ gap: 10, marginTop: 10 }}>
      <input type="hidden" name="id" value={cat.id} />
      <input name="name" className="input" defaultValue={cat.name} required />
      <select name="parent_id" className="input" defaultValue={cat.parent_id ?? ''}>
        <option value="">At the top</option>
        <CatOptions categories={choices} />
      </select>
      <button className="btn" disabled={pending}>{pending ? 'Saving' : 'Save'}</button>
      {state.error && <p className="sub" style={{ color: 'var(--warn)' }}>{state.error}</p>}
    </form>
  )
}
