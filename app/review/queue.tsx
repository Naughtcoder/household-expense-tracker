'use client'
import { catTree } from '../../lib/cats'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { fileTransaction, ignoreTransaction } from './actions'
import { CategoryPicker, type Cat } from './picker'
import { inr, inrExact, dayLabel, timeLabel } from '../../lib/format'
import { SCOPES, isScope, type Scope } from '../../lib/scope'
import type { ReviewRow } from './card'
import { reasonsFor, type Reason } from '../../lib/review-reason'
import { CatIcon } from '../caticon'
import { IconChevronLeft, IconChevronRight, IconX } from '@tabler/icons-react'

export type QueueRow = ReviewRow & {
  category_id: number | null
  raw_text: string | null
  note: string | null
  account_tail: string | null
  direction?: 'debit' | 'credit'
  occurred_at?: string | null
}

/**
 * Review as a list you scroll, and one payment at a time when you open it.
 *
 * Tapping a card opens it in a panel with only what needs deciding: who it is
 * for, the category, and a note. Save moves straight to the next one, and
 * Previous and Next step through the queue without going back to the list, so
 * five hundred payments are five hundred taps, not five hundred scrolls.
 */
export function ReviewQueue({ rows, categories, suggested }: {
  rows: QueueRow[]
  categories: Cat[]
  suggested: Cat[]
}) {
  const router = useRouter()
  const [gone, setGone] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<number | null>(null)
  const list = useMemo(() => rows.filter(r => !gone.has(r.id)), [rows, gone])
  const tree = useMemo(() => catTree(categories), [categories])
  const nameOf = useMemo(() => (id: number | null) => tree.label(id) || null, [tree])
  const sameCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of list) if (r.merchant_key) m.set(r.merchant_key, (m.get(r.merchant_key) ?? 0) + 1)
    return m
  }, [list])

  function close() { setOpen(null); router.refresh() }

  // Swipe right files a payment with the category already guessed for it;
  // swipe left ignores it. Both leave the list at once and save behind it.
  const [note, setNote] = useState<string | null>(null)
  // A short line confirming what was just filed, gone after a few seconds.
  const [done, setDone] = useState<string | null>(null)
  useEffect(() => { if (!done) return; const t = setTimeout(() => setDone(null), 3500); return () => clearTimeout(t) }, [done])
  async function quickFile(r: QueueRow) {
    setGone(prev => new Set([...prev, r.id]))
    const res = await fileTransaction({ id: r.id, categoryId: r.category_id, scope: isScope(r.scope) ? r.scope : 'household',
      merchantKey: r.merchant_key, merchant: r.merchant, applyToAll: false })
    if (res.error && !res.ok) { setGone(prev => { const n = new Set(prev); n.delete(r.id); return n }); setNote(res.error) }
  }
  async function quickIgnore(r: QueueRow) {
    setGone(prev => new Set([...prev, r.id]))
    const res = await ignoreTransaction(r.id)
    if (res.error) { setGone(prev => { const n = new Set(prev); n.delete(r.id); return n }); setNote(res.error) }
  }

  return (
    <>
      {list.length === 0 && <div className="card"><div className="empty">Everything is filed.</div></div>}
      {list.length > 0 && <p className="sub" style={{ margin: '0 2px' }}>Swipe right to file as shown, left to ignore.</p>}
      {note && <div className="raw" style={{ color: 'var(--caution)' }}>{note}</div>}
      {done && <div className="toast" role="status">{done}</div>}
      {list.length > 0 && (
        <div className="card" style={{ paddingBlock: 4 }}>
          {list.map((r, i) => {
            const cat = nameOf(r.category_id)
            const why = reasonsFor(r, categories)
            const leaf = categories.find(c => c.id === r.category_id)
            const top = tree.root(leaf?.id)?.name
            const newDay = i === 0 || list[i - 1].occurred_on !== r.occurred_on
            return (
              <div key={r.id}>
                {newDay && <div className="dayhead" style={{ position: 'static', background: 'transparent', backdropFilter: 'none' }}><span>{dayLabel(r.occurred_on)}</span></div>}
                <Swipe onTap={() => setOpen(i)}
                  right={r.category_id && !categories.some(c => c.parent_id === r.category_id) && why.every(w => w.field === 'category') ? { label: `File as ${cat}`, run: () => quickFile(r) } : null}
                  left={{ label: 'Ignore', run: () => quickIgnore(r) }}>
                  <CatIcon name={r.direction === 'credit' && !leaf ? 'Income' : leaf?.name ?? 'Uncategorised'} group={top ?? 'Uncategorised'} />
                  <span className="rq-main">
                    <span className="t">{r.merchant ?? r.merchant_key ?? 'Unknown payee'}</span>
                    <span className="s">{r.payer?.name ? `${r.payer.name} · ` : ''}{why[0]?.short ?? cat ?? ''}</span>
                  </span>
                  <span className={`a${r.direction === 'credit' ? ' in' : ''}`}>{r.direction === 'credit' ? '+' : ''}{inr(Number(r.amount))}{r.occurred_at && <small>{timeLabel(r.occurred_at)}</small>}</span>
                </Swipe>
              </div>
            )
          })}
        </div>
      )}

      {open !== null && list[open] && (
        <Panel key={list[open].id} row={list[open]} index={open} total={list.length}
          more={list[open].merchant_key ? (sameCount.get(list[open].merchant_key!) ?? 1) - 1 : 0}
          categories={categories} suggested={suggested} nameOf={nameOf}
          onPrev={() => setOpen(Math.max(0, open - 1))}
          onNext={() => (open + 1 < list.length ? setOpen(open + 1) : close())}
          onClose={close}
          onFiled={(ids, next, what) => {
            setGone(prev => new Set([...prev, ...ids]))
            setDone(what)
            // Save closes the panel: the payment is filed and leaves the list.
            // "Save, next" keeps going down the list instead.
            const left = list.length - ids.length
            if (!next || left <= 0) { setOpen(null); return }
            // The list shrinks under us; the same index is now the next payment.
            setOpen(Math.min(open, left - 1))
          }}
          sameIds={list[open].merchant_key ? list.filter(x => x.merchant_key === list[open].merchant_key).map(x => x.id) : [list[open].id]}
        />
      )}
    </>
  )
}

function Panel({ row, index, total, more, categories, suggested, nameOf, onPrev, onNext, onClose, onFiled, sameIds }: {
  row: QueueRow; index: number; total: number; more: number
  categories: Cat[]; suggested: Cat[]; nameOf: (id: number | null) => string | null
  onPrev: () => void; onNext: () => void; onClose: () => void
  onFiled: (ids: string[], next: boolean, what: string) => void; sameIds: string[]
}) {
  const [pending, start] = useTransition()
  const [problem, setProblem] = useState<string | null>(null)
  const [scope, setScope] = useState<Scope>(isScope(row.scope) ? row.scope : 'household')
  const [cat, setCat] = useState<number | null>(row.category_id)
  const [note, setNote] = useState(row.note ?? '')
  const [all, setAll] = useState(more > 0)
  const reasons: Reason[] = reasonsFor(row, categories)
  const askPayee = reasons.some(r => r.field === 'payee')
  const [payee, setPayee] = useState(row.merchant ?? '')
  const needsCat = scope !== 'investment' && scope !== 'transfer'

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') onNext()
      if (e.key === 'ArrowLeft') onPrev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onNext, onPrev])

  function save(next = false) {
    setProblem(null)
    if (needsCat && !cat) { setProblem('Pick a category first.'); return }
    if (askPayee && !payee.trim()) { setProblem('Type who was paid first, for example the shop or the person.'); return }
    start(async () => {
      const res = await fileTransaction({
        id: row.id, categoryId: needsCat ? cat : null, scope,
        merchantKey: row.merchant_key, merchant: payee.trim() || row.merchant,
        applyToAll: all && more > 0, note,
      })
      if (res.error && !res.ok) { setProblem(res.error); return }
      if (res.error) setProblem(res.error)
      const n = all && more > 0 ? sameIds.length : 1
      onFiled(all && more > 0 ? sameIds : [row.id], next,
        `Filed ${row.merchant ?? row.merchant_key ?? 'payment'}${n > 1 ? ` and ${n - 1} more` : ''}${cat && needsCat ? ` as ${nameOf(cat)}` : ''}`)
    })
  }

  return (
    <div className="rq-back" role="presentation" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <section className="rq-panel" role="dialog" aria-modal="true" aria-label={`Payment ${index + 1} of ${total}`}>
        <div className="rq-top">
          <button type="button" className="pnav-arrow" onClick={onPrev} disabled={index === 0 || pending} aria-label="Previous" style={{ border: 0 }}><IconChevronLeft size={20} /></button>
          <span className="sub">{index + 1} of {total}</span>
          <button type="button" className="pnav-arrow" onClick={onNext} disabled={pending} aria-label="Next" style={{ border: 0 }}><IconChevronRight size={20} /></button>
          <span style={{ flex: 1 }} />
          <button type="button" className="pnav-arrow" onClick={onClose} aria-label="Close" style={{ border: 0 }}><IconX size={20} /></button>
        </div>

        <div className="rq-head" style={{ alignItems: 'center' }}>
          <CatIcon name={categories.find(c => c.id === cat)?.name ?? (row.direction === 'credit' ? 'Income' : 'Uncategorised')} size={44} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="name" style={{ fontSize: 18 }}>{row.merchant ?? row.merchant_key ?? 'Unknown payee'}</div>
            <div className="who">{row.payer?.name && <b style={{ color: 'var(--page-text)' }}>{row.payer.name}&apos;s · </b>}{dayLabel(row.occurred_on)}{row.occurred_at ? `, ${timeLabel(row.occurred_at)}` : ''} · {row.bank ?? 'unknown bank'}{row.account_tail ? ` · account ${row.account_tail}` : ''}</div>
          </div>
          <div className={`amt num${row.direction === 'credit' ? ' credit' : ''}`} style={{ fontSize: 20 }}>{row.direction === 'credit' ? '+' : ''}{inrExact(Number(row.amount))}</div>
        </div>
        {row.raw_text && <details className="rq-raw"><summary>What the bank said</summary><div className="raw">{row.raw_text}</div></details>}

        <div className="rq-reasons">
          {reasons.map(r => <div key={r.field} className="rq-why">{r.text}</div>)}
          {reasons.length === 0 && <div className="rq-why">Nothing unclear. Check it and save.</div>}
        </div>

        {askPayee && (
          <>
            <div className="label" style={{ marginTop: 14 }}>Who was paid</div>
            <input className="input" value={payee} onChange={e => setPayee(e.target.value)} autoFocus
              placeholder="The shop or the person" style={{ marginTop: 8 }} />
          </>
        )}

        <div className="label" style={{ marginTop: 14 }}>Who it is for</div>
        <div className="chips" style={{ marginTop: 8 }}>
          {SCOPES.map(s => (
            <button key={s.value} type="button" onClick={() => setScope(s.value)}
              className={`chip${scope === s.value ? ' sel' : ''}`} aria-pressed={scope === s.value}>{s.label}</button>
          ))}
        </div>

        {needsCat && (
          <>
            <div className="label" style={{ marginTop: 14 }}>
              Category{cat ? <>: <span style={{ color: 'var(--page-text)' }}>{nameOf(cat)}</span></> : ': not chosen yet'}
            </div>
            <CategoryPicker categories={categories} suggested={suggested} selected={cat}
              onPick={id => setCat(prev => (prev === id ? null : id))} disabled={pending} />
          </>
        )}

        <div className="label" style={{ marginTop: 14 }}>Note</div>
        <input className="input" id={`note-${row.id}`} value={note} onChange={e => setNote(e.target.value)}
          placeholder="Optional, for example dinner with Sam" style={{ marginTop: 8 }} />

        {more > 0 && (
          <label className={`chip${all ? ' sel' : ''}`} style={{ display: 'inline-flex', gap: 8, alignItems: 'center', marginTop: 14 }}>
            <input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} />
            Also file the other {more} from this payee the same way
          </label>
        )}

        {problem && <div className="raw" style={{ marginTop: 12, color: 'var(--warn)' }}>{problem}</div>}

        <div className="rq-actions">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
            <button className="btn" type="button" onClick={() => save(false)} disabled={pending}>
              {pending ? 'Saving…' : all && more > 0 ? `Save all ${more + 1}` : 'Save'}
            </button>
            <button className="chip" type="button" onClick={() => save(true)} disabled={pending} style={{ padding: '0 18px' }}>Save, next</button>
          </div>
          <button className="chip" type="button" disabled={pending} onClick={() => {
            setProblem(null)
            start(async () => {
              const res = await ignoreTransaction(row.id)
              if (res.error) { setProblem(res.error); return }
              onFiled([row.id], false, `Ignored ${row.merchant ?? row.merchant_key ?? 'payment'}`)
            })
          }}>Not a real expense, ignore</button>
        </div>
      </section>
    </div>
  )
}

/**
 * A row that can be dragged sideways. Past a third of its width it commits
 * the action on that side; short of it, it springs back and counts as a tap.
 */
function Swipe({ children, onTap, left, right }: {
  children: React.ReactNode; onTap: () => void
  left: { label: string; run: () => void } | null
  right: { label: string; run: () => void } | null
}) {
  const [dx, setDx] = useState(0)
  const start = useRef<{ x: number; y: number; w: number; locked: boolean | null } | null>(null)
  const moved = useRef(false)
  const limit = (d: number) => (d > 0 && !right) || (d < 0 && !left) ? 0 : d

  return (
    <div className="sw">
      <div className="sw-under" aria-hidden="true">
        <span className="sw-right">{dx > 0 && right?.label}</span>
        <span className="sw-left">{dx < 0 && left?.label}</span>
      </div>
      <button type="button" className="rq-item" style={{ transform: `translateX(${dx}px)`, transition: start.current ? 'none' : 'transform .18s' }}
        onPointerDown={e => { start.current = { x: e.clientX, y: e.clientY, w: e.currentTarget.offsetWidth, locked: null }; moved.current = false }}
        onPointerMove={e => {
          const s = start.current; if (!s) return
          const ddx = e.clientX - s.x, ddy = e.clientY - s.y
          // Decide once whether this is a sideways drag or a scroll.
          if (s.locked === null && (Math.abs(ddx) > 8 || Math.abs(ddy) > 8)) s.locked = Math.abs(ddx) > Math.abs(ddy)
          if (s.locked) { moved.current = true; setDx(limit(ddx)) }
        }}
        onPointerUp={() => {
          const s = start.current; start.current = null
          if (s && Math.abs(dx) > s.w / 3) {
            const act = dx > 0 ? right : left
            setDx(dx > 0 ? s.w : -s.w)
            act?.run()
          } else setDx(0)
        }}
        onPointerCancel={() => { start.current = null; setDx(0) }}
        onClick={() => { if (!moved.current) onTap() }}>
        {children}
      </button>
    </div>
  )
}
