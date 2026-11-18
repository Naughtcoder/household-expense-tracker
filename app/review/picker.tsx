'use client'
import { useMemo, useRef, useState, useTransition } from 'react'
import { CatIcon } from '../caticon'
import { catTree, titleCase, catMatches } from '../../lib/cats'
import { createCategory } from '../categories/actions'

export type Cat = { id: number; name: string; parent_id: number | null }

/**
 * Two steps instead of one long list. First the groups (Food, Rent, Travel),
 * one icon each, about six rows on a phone. Tap one and only what is inside it
 * shows, with a way back. Typing searches everything at once. The old screen
 * laid every category of every group out together and scrolled for ever.
 *
 * "New category" is the last thing, full width, and makes one under the group
 * that is open (or at the top) and picks it.
 */
export function CategoryPicker({ categories, suggested, onPick, onCreated, disabled, selected = null }: {
  categories: Cat[]
  suggested: Cat[]
  /** Called with the tapped category. Tapping the one already picked unpicks it. */
  onPick: (id: number) => void
  selected?: number | null
  disabled?: boolean
  /** Told about a category made from the picker, before it is picked. */
  onCreated?: (c: Cat) => void
}) {
  const [extra, setExtra] = useState<Cat[]>([])
  const all = useMemo(() => [...categories, ...extra.filter(e => !categories.some(c => c.id === e.id))], [categories, extra])
  const tree = useMemo(() => catTree(all), [all])
  const [q, setQ] = useState('')
  const [group, setGroup] = useState<number | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const parentOf = (c: Cat) => tree.path(c.id).slice(0, -1).map(x => x.name).join(' · ') || null
  const rootOf = (c: Cat) => tree.root(c.id)?.name ?? null

  const matches = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return null
    return all
      .filter(c => catMatches(c.name, term) || tree.path(c.id).some(p => p.name.toLowerCase().includes(term)))
      // Whole-word starts rank above matches buried in the middle.
      .sort((a, b) => {
        const rank = (c: Cat) => (c.name.toLowerCase().startsWith(term) ? 0 : 1)
        return rank(a) - rank(b) || a.name.localeCompare(b.name)
      })
      .slice(0, 12)
  }, [q, all, tree])

  // Inside a group: the group itself ("Food, general") and every level under
  // it, a deeper one written "Car › Toll".
  const inside = (rootId: number) => {
    const out: { c: Cat; label: string }[] = []
    const walk = (id: number, trail: string) => {
      for (const k of tree.children(id)) {
        const label = trail ? `${trail} › ${k.name}` : k.name
        out.push({ c: k, label: tree.hasChildren(k.id) ? `${label}, general` : label })
        walk(k.id, label)
      }
    }
    walk(rootId, '')
    return out
  }
  const open = group !== null ? tree.get(group) : null
  // The group of the current pick shows as chosen on the first step.
  const pickedRoot = selected ? tree.root(selected)?.id : null

  return (
    <>
      <input
        ref={input}
        className="input"
        placeholder="Type to find a category"
        value={q}
        onChange={e => setQ(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && matches?.length) { e.preventDefault(); onPick(matches[0].id) }
          if (e.key === 'Escape') setQ('')
        }}
        disabled={disabled}
        style={{ marginTop: 10 }}
      />

      {matches ? (
        <div className="tiles" style={{ marginTop: 12 }}>
          {matches.map(c => <Tile key={c.id} c={c} group={rootOf(c)} caption={parentOf(c)} disabled={disabled} onPick={onPick} on={selected === c.id} />)}
          {matches.length === 0 && <span className="sub">Nothing matches that.</span>}
        </div>
      ) : (
        <>
          {suggested.length > 0 && !open && (
            <div className="catgroup">
              <div className="label">Likely</div>
              <div className="tiles">
                {suggested.map(c => <Tile key={c.id} c={c} group={rootOf(c)} caption={parentOf(c)} disabled={disabled} onPick={onPick} on={selected === c.id} />)}
              </div>
            </div>
          )}

          {open ? (
            <div className="catgroup">
              <button type="button" className="chip" onClick={() => setGroup(null)} style={{ marginBottom: 6 }}>‹ All groups</button>
              <div className="label">{open.name}</div>
              <div className="tiles">
                <Tile c={{ ...open, name: tree.hasChildren(open.id) ? `${open.name}, general` : open.name }} icon={open.name} group={open.name}
                  disabled={disabled} onPick={onPick} on={selected === open.id} />
                {inside(open.id).map(({ c, label }) => (
                  <Tile key={c.id} c={{ ...c, name: label }} icon={c.name} group={open.name} disabled={disabled} onPick={onPick} on={selected === c.id} />
                ))}
              </div>
            </div>
          ) : (
            <div className="catgroup">
              <div className="label">Groups</div>
              <div className="tiles">
                {tree.roots().map(r => (
                  <button key={r.id} type="button" className={`tilebtn${pickedRoot === r.id ? ' on' : ''}`} disabled={disabled}
                    // A group with nothing inside it is a category in its own right: pick it.
                    onClick={() => (tree.hasChildren(r.id) ? setGroup(r.id) : onPick(r.id))}>
                    <CatIcon name={r.name} group={r.name} size={44} />
                    <span>{r.name}</span>
                    {tree.hasChildren(r.id) && <small className="tilecount">{tree.children(r.id).length} inside</small>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <NewCategory under={open?.id ?? null} all={all} disabled={disabled}
        onMade={c => { setExtra(x => [...x, c]); onCreated?.(c); setQ(''); onPick(c.id) }} />
    </>
  )
}

/** Full width under the grid: a name, where it goes, and it is picked. */
function NewCategory({ under, all, disabled, onMade }: {
  under: number | null; all: Cat[]; disabled?: boolean; onMade: (c: Cat) => void
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [parent, setParent] = useState<string>('')
  const [note, setNote] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const tree = catTree(all)
  const add = () => start(async () => {
    const parentId = parent ? Number(parent) : null
    const r = await createCategory(name, parentId)
    if (r.error || !r.id) { setNote(r.error ?? 'Could not add it.'); return }
    onMade({ id: r.id, name: titleCase(name), parent_id: parentId })
    setOpen(false); setName(''); setNote(null)
  })
  if (!open) return (
    <button type="button" className="newcat" disabled={disabled}
      onClick={() => { setParent(under ? String(under) : ''); setOpen(true) }}>+ New category</button>
  )
  return (
    <div className="newcat open">
      <input className="input" placeholder="Name, for example Books" value={name} onChange={e => setName(e.target.value)} autoFocus />
      <select className="input" value={parent} onChange={e => setParent(e.target.value)} aria-label="Goes under">
        <option value="">At the top, a new group</option>
        {tree.flat().map(({ cat, depth }) => (
          <option key={cat.id} value={cat.id}>{'   '.repeat(depth)}{depth ? '› ' : ''}{cat.name}</option>
        ))}
      </select>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn" style={{ flex: 1 }} disabled={pending || !name.trim()} onClick={add}>{pending ? 'Adding' : 'Add and pick it'}</button>
        <button type="button" className="chip" onClick={() => { setOpen(false); setNote(null) }}>Cancel</button>
      </div>
      {note && <p className="sub" style={{ color: 'var(--warn)' }}>{note}</p>}
    </div>
  )
}

/** One choice: the category's icon tile with its name underneath. */
function Tile({ c, group, caption, icon, disabled, onPick, on }: {
  c: Cat; group?: string | null; caption?: string | null; icon?: string; disabled?: boolean; onPick: (id: number) => void; on?: boolean
}) {
  return (
    <button type="button" className={`tilebtn${on ? ' on' : ''}`} aria-pressed={!!on} disabled={disabled} onClick={() => onPick(c.id)}>
      <CatIcon name={icon ?? c.name} group={group} size={44} />
      <span>{c.name}</span>
      {caption && <small className="tilecount">{caption}</small>}
    </button>
  )
}
