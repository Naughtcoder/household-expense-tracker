'use client'
import { useState } from 'react'
import { CategoryPicker } from './review/picker'
import { CatIcon } from './caticon'
import { catTree, type Cat } from '../lib/cats'

/** A category field: shows the chosen one, and tapping it opens the grid
 *  picker (groups first, then what is inside) in place. Replaces the native
 *  list, which ran to seventy lines. */
export function CatSelect({ categories, value, onChange, name, empty = 'Uncategorised', ariaLabel }: {
  categories: Cat[]
  value: string
  onChange: (v: string) => void
  name?: string
  empty?: string
  ariaLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<Cat[]>(categories)
  const tree = catTree(list)
  const id = value ? Number(value) : null
  const label = id ? tree.label(id) : ''
  return (
    <>
      {name && <input type="hidden" name={name} value={value} />}
      <button type="button" className="input catfield" aria-label={ariaLabel ?? 'Category'} aria-expanded={open} onClick={() => setOpen(o => !o)}>
        {id && <CatIcon name={tree.name(id) ?? ''} group={tree.root(id)?.name} size={26} />}
        <span style={{ flex: 1, color: label ? 'var(--page-text)' : 'var(--page-text-subdued)' }}>{label || empty}</span>
        <span aria-hidden style={{ color: 'var(--page-text-subdued)' }}>{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div style={{ marginTop: 6 }}>
          <CategoryPicker categories={list} suggested={[]} selected={id}
            onCreated={c => setList(l => [...l, c])}
            onPick={pick => { onChange(id === pick ? '' : String(pick)); setOpen(false) }} />
        </div>
      )}
    </>
  )
}
