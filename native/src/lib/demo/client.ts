// The demo app's stand-in for Supabase. It answers the same calls the app
// makes (from, select with embedded tables, the filters, order, range,
// insert, update, upsert, delete, rpc, auth) out of tables held in memory,
// made up by seed.ts. Nothing leaves the phone, and every change is gone the
// next time the app starts, so anyone can press anything.

import { db, newId, type Row } from './store'
import { rpc } from './rpc'

type Result = { data: unknown; error: { message: string } | null; count?: number | null }
type Filter = (r: Row) => boolean

/** Tables a column points at, so "paid:people!transactions_paid_by_fkey(name)" can be joined. */
const FKS: Record<string, Record<string, string>> = {
  transactions: { paid_by: 'people', entered_by: 'people', category_id: 'categories', possible_duplicate_of: 'transactions', split_of: 'transactions' },
  transaction_tags: { transaction_id: 'transactions', tag_id: 'tags' },
  categories: { parent_id: 'categories' },
  merchant_rules: { category_id: 'categories', paid_by: 'people' },
  recurring: { category_id: 'categories', paid_by: 'people' },
  budgets: { category_id: 'categories' },
  planned_splits: { paid_by: 'people' },
  salary_tax_rates: { person_id: 'people' },
}
const KEYS: Record<string, string[]> = {
  transaction_tags: ['transaction_id', 'tag_id'], budgets: ['category_id'], settings: ['key'], fx_rates: ['day', 'currency'],
  push_config: ['key'], push_subscriptions: ['endpoint'], category_hints: ['token'], salary_tax_rates: ['person_id', 'from_month'],
}
const keyOf = (table: string) => KEYS[table] ?? ['id']

/** Splits on commas that are not inside brackets. */
function splitTop(s: string) {
  const out: string[] = []
  let depth = 0, cur = ''
  for (const ch of s) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue }
    cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

type Field = { kind: 'all' } | { kind: 'col'; name: string; as: string } | { kind: 'embed'; table: string; as: string; hint?: string; inner: boolean; fields: Field[] }

function parseSelect(s: string): Field[] {
  return splitTop(s || '*').map(part => {
    if (part === '*') return { kind: 'all' }
    const m = part.match(/^(?:(\w+):)?(\w+)((?:!\w+)*)\((.*)\)$/s)
    if (m) {
      const bangs = (m[3] ?? '').split('!').filter(Boolean)
      return { kind: 'embed', as: m[1] ?? m[2], table: m[2], hint: bangs.find(b => b !== 'inner'), inner: bangs.includes('inner'), fields: parseSelect(m[4]) }
    }
    const c = part.match(/^(?:(\w+):)?(\w+)(?:::\w+)?$/)
    if (c) return { kind: 'col', as: c[1] ?? c[2], name: c[2] }
    return { kind: 'col', as: part, name: part }
  })
}

/** The column on `from` that points at `to`, using the hint when there is one. */
function fkColumn(from: string, to: string, hint?: string) {
  const fks = FKS[from] ?? {}
  if (hint) {
    const byName = Object.keys(fks).find(c => hint === c || hint.includes(`_${c}_`) || hint.endsWith(`_${c}_fkey`))
    if (byName && fks[byName] === to) return byName
  }
  return Object.keys(fks).find(c => fks[c] === to) ?? null
}

/** One row cut down to the fields asked for, embedded tables joined in. Null when an inner join finds nothing. */
function shape(table: string, row: Row, fields: Field[]): Row | null {
  const out: Row = {}
  for (const f of fields) {
    if (f.kind === 'all') Object.assign(out, row)
    else if (f.kind === 'col') out[f.as] = row[f.name] ?? null
    else {
      const down = fkColumn(table, f.table, f.hint)
      if (down) {
        const target = (db[f.table] ?? []).find(r => r[keyOf(f.table)[0]] === row[down])
        const v = target ? shape(f.table, target, f.fields) : null
        if (f.inner && !v) return null
        out[f.as] = v
      } else {
        // The other way round: rows of that table pointing at this one.
        const up = fkColumn(f.table, table)
        const list = up ? (db[f.table] ?? []).filter(r => r[up] === row[keyOf(table)[0]]).map(r => shape(f.table, r, f.fields)).filter(Boolean) : []
        if (f.inner && !list.length) return null
        out[f.as] = list
      }
    }
  }
  return out
}

const like = (pattern: string) => new RegExp('^' + pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$', 'is')
const same = (a: unknown, b: unknown) => a === b || (a != null && b != null && String(a) === String(b))
const num = (v: unknown) => (typeof v === 'number' ? v : /^-?\d+(\.\d+)?$/.test(String(v)) ? Number(v) : v)
const cmp = (a: unknown, b: unknown) => {
  const x = num(a), y = num(b)
  if (typeof x === 'number' && typeof y === 'number') return x - y
  return String(x ?? '').localeCompare(String(y ?? ''))
}
const parseList = (v: string) => v.replace(/^\(|\)$/g, '').split(',').map(s => s.trim().replace(/^"|"$/g, ''))

/** "merchant.ilike.%x%,note.ilike.%x%" and the like, for .or(). */
function orFilter(expr: string): Filter {
  const parts = splitTop(expr).map(p => {
    const [col, op, ...rest] = p.split('.')
    const val = rest.join('.')
    return (r: Row) => {
      const v = r[col]
      switch (op) {
        case 'eq': return same(v, val)
        case 'neq': return !same(v, val)
        case 'ilike': return like(val).test(String(v ?? ''))
        case 'like': return like(val).test(String(v ?? ''))
        case 'is': return val === 'null' ? v == null : same(v, val)
        case 'gt': return cmp(v, val) > 0
        case 'gte': return cmp(v, val) >= 0
        case 'lt': return cmp(v, val) < 0
        case 'lte': return cmp(v, val) <= 0
        case 'in': return parseList(val).some(x => same(v, x))
        default: return false
      }
    }
  })
  return r => parts.some(f => f(r))
}

class Query implements PromiseLike<Result> {
  private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select'
  private fields: Field[] = [{ kind: 'all' }]
  private returning = false
  private filters: Filter[] = []
  private orders: { col: string; asc: boolean; nullsFirst: boolean }[] = []
  private from = 0
  private to = Infinity
  private one: 'single' | 'maybe' | null = null
  private count = false
  private head = false
  private payload: Row[] = []
  private patch: Row = {}
  private conflict: string[] | null = null

  constructor(private table: string) {}

  select(cols = '*', opts?: { count?: string; head?: boolean }) {
    this.fields = parseSelect(cols)
    if (this.op !== 'select') this.returning = true
    if (opts?.count) this.count = true
    if (opts?.head) this.head = true
    return this
  }
  insert(rows: Row | Row[]) { this.op = 'insert'; this.payload = Array.isArray(rows) ? rows : [rows]; return this }
  upsert(rows: Row | Row[], opts?: { onConflict?: string }) {
    this.op = 'upsert'; this.payload = Array.isArray(rows) ? rows : [rows]
    this.conflict = opts?.onConflict ? opts.onConflict.split(',').map(s => s.trim()) : keyOf(this.table)
    return this
  }
  update(patch: Row) { this.op = 'update'; this.patch = patch; return this }
  delete() { this.op = 'delete'; return this }

  eq(c: string, v: unknown) { this.filters.push(r => same(r[c], v)); return this }
  neq(c: string, v: unknown) { this.filters.push(r => !same(r[c], v)); return this }
  gt(c: string, v: unknown) { this.filters.push(r => r[c] != null && cmp(r[c], v) > 0); return this }
  gte(c: string, v: unknown) { this.filters.push(r => r[c] != null && cmp(r[c], v) >= 0); return this }
  lt(c: string, v: unknown) { this.filters.push(r => r[c] != null && cmp(r[c], v) < 0); return this }
  lte(c: string, v: unknown) { this.filters.push(r => r[c] != null && cmp(r[c], v) <= 0); return this }
  in(c: string, vs: unknown[]) { this.filters.push(r => vs.some(v => same(r[c], v))); return this }
  is(c: string, v: unknown) { this.filters.push(r => (v === null ? r[c] == null : same(r[c], v))); return this }
  ilike(c: string, p: string) { const re = like(p); this.filters.push(r => re.test(String(r[c] ?? ''))); return this }
  like(c: string, p: string) { return this.ilike(c, p) }
  contains(c: string, v: unknown[]) { this.filters.push(r => Array.isArray(r[c]) && v.every(x => (r[c] as unknown[]).includes(x))); return this }
  not(c: string, op: string, v: unknown) {
    if (op === 'is') this.filters.push(r => (v === null ? r[c] != null : !same(r[c], v)))
    else if (op === 'in') { const list = typeof v === 'string' ? parseList(v) : (v as unknown[]); this.filters.push(r => !list.some(x => same(r[c], x))) }
    else if (op === 'eq') this.filters.push(r => !same(r[c], v))
    else if (op === 'ilike') { const re = like(String(v)); this.filters.push(r => !re.test(String(r[c] ?? ''))) }
    return this
  }
  or(expr: string) { this.filters.push(orFilter(expr)); return this }
  match(o: Row) { for (const [k, v] of Object.entries(o)) this.eq(k, v); return this }
  filter(c: string, op: string, v: unknown) {
    const m = this as unknown as Record<string, (c: string, v: unknown) => Query>
    return m[op] ? m[op].call(this, c, v) : this
  }
  order(col: string, o?: { ascending?: boolean; nullsFirst?: boolean }) { this.orders.push({ col, asc: o?.ascending !== false, nullsFirst: !!o?.nullsFirst }); return this }
  range(a: number, b: number) { this.from = a; this.to = b; return this }
  limit(n: number) { this.to = this.from + n - 1; return this }
  single() { this.one = 'single'; return this }
  maybeSingle() { this.one = 'maybe'; return this }
  abortSignal() { return this }
  throwOnError() { return this }

  private matches() { return (db[this.table] ?? []).filter(r => this.filters.every(f => f(r))) }

  private run(): Result {
    const table = (db[this.table] ??= [])
    let rows: Row[]
    if (this.op === 'insert' || this.op === 'upsert') {
      rows = []
      for (const p of this.payload) {
        const key = this.conflict
        const existing = key ? table.find(r => key.every(k => same(r[k], p[k]))) : null
        if (existing && this.op === 'upsert') { Object.assign(existing, p); rows.push(existing); continue }
        if (this.op === 'insert' && keyOf(this.table).every(k => p[k] != null) && table.some(r => keyOf(this.table).every(k => same(r[k], p[k]))))
          return { data: null, error: { message: 'That is already there.' } }
        const row: Row = { ...defaults(this.table), ...p }
        if (row.id == null && keyOf(this.table)[0] === 'id') row.id = newId(this.table)
        table.push(row); rows.push(row)
      }
    } else if (this.op === 'update') {
      rows = this.matches()
      for (const r of rows) Object.assign(r, this.patch)
    } else if (this.op === 'delete') {
      rows = this.matches()
      db[this.table] = table.filter(r => !rows.includes(r))
    } else {
      rows = this.matches()
    }

    if (this.op !== 'select' && !this.returning) return { data: null, error: null }
    for (const o of [...this.orders].reverse()) {
      rows = [...rows].sort((a, b) => {
        const x = a[o.col], y = b[o.col]
        if (x == null && y == null) return 0
        if (x == null) return o.nullsFirst ? -1 : 1
        if (y == null) return o.nullsFirst ? 1 : -1
        return o.asc ? cmp(x, y) : -cmp(x, y)
      })
    }
    let shaped = rows.map(r => shape(this.table, r, this.fields)).filter((r): r is Row => r !== null)
    const total = shaped.length
    if (this.head) return { data: null, error: null, count: total }
    shaped = shaped.slice(this.from, this.to === Infinity ? undefined : this.to + 1)
    // Copies, so a screen holding a row never sees it change underneath it.
    const copy = JSON.parse(JSON.stringify(shaped)) as Row[]
    if (this.one === 'single') return copy.length === 1 ? { data: copy[0], error: null } : { data: null, error: { message: copy.length ? 'More than one row.' : 'Not found.' } }
    if (this.one === 'maybe') return { data: copy[0] ?? null, error: null }
    return { data: copy, error: null, count: this.count ? total : null }
  }

  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null): Promise<A | B> {
    let r: Result
    try { r = this.run() } catch (e) { r = { data: null, error: { message: (e as Error).message } } }
    return Promise.resolve(r).then(ok, bad)
  }
}

function defaults(table: string): Row {
  const now = new Date().toISOString()
  if (table === 'transactions') return { currency: 'INR', status: 'confirmed', scope: 'household', flags: [], created_at: now, note: null, split_of: null, split_total: null, covered_by: null, pays_back: null, settled_by: null, claim_settled_on: null, possible_duplicate_of: null }
  if (table === 'tags') return { archived: false, colour: null, created_at: now }
  if (table === 'planned_splits') return { status: 'open', created_at: now }
  return { created_at: now }
}

// The demo is always signed in, as the first made-up person.
const session = { access_token: 'demo', refresh_token: 'demo', expires_in: 3600, token_type: 'bearer', user: { id: 'demo-user', email: 'demo@example.com' } }

export const demoClient = {
  from: (t: string) => new Query(t),
  rpc: async (name: string, args: Record<string, unknown> = {}) => {
    try { return { data: rpc(name, args), error: null } } catch (e) { return { data: null, error: { message: (e as Error).message } } }
  },
  auth: {
    getSession: async () => ({ data: { session }, error: null }),
    getUser: async () => ({ data: { user: session.user }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signInWithPassword: async () => ({ data: { session, user: session.user }, error: null }),
    signOut: async () => ({ error: null }),
    updateUser: async () => ({ data: { user: session.user }, error: { message: 'There is no password in the demo.' } }),
    startAutoRefresh() {},
    stopAutoRefresh() {},
  },
}
