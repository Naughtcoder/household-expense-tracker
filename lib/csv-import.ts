import { normalize, type Cleaned } from './normalize.ts'

export interface StatementRow {
  date: string            // ISO
  description: string
  amount: number
  direction: 'debit' | 'credit'
  accountTail: string | null
  bank: string
  clean: Cleaned
  /** Category name the source already assigned, matched by name on import. */
  categoryName?: string | null
  parentName?: string | null
  note?: string | null
}

export interface ParseResult {
  rows: StatementRow[]
  format: string
  skipped: string[]
}

const isoFrom = (d: string): string | null => {
  // 20/07/2026 19:40:44, or just 20/07/2026
  const m = d.trim().match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/)
  if (!m) return null
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

const num = (s: string): number | null => {
  const n = Number(String(s).replace(/[,₹\s]/g, ''))
  return Number.isFinite(n) ? n : null
}

/**
 * BankA credit card statements, exported as CSV from the card portal.
 *
 * The delimiter is `~|~`, not a comma, and the file is mostly not a table:
 * an address block, a summary, a rewards block and a GST block surround the
 * transactions. So rows are recognised by shape rather than by position.
 */
export function parseHdfcCardCsv(text: string): ParseResult {
  const rows: StatementRow[] = []
  const skipped: string[] = []

  // The card number appears once, near the transactions.
  const cardMatch = text.match(/Card No:\s*[\dX\s]*?(\d{4})\s*$/m)
  const accountTail = cardMatch ? cardMatch[1] : null

  for (const line of text.split(/\r?\n/)) {
    if (!line.includes('~|~')) continue
    const parts = line.split('~|~').map(p => p.trim())
    // Transaction type, name, date, description, amount, debit/credit, rewards
    if (!/^(Domestic|International)$/i.test(parts[0] ?? '')) continue

    const date = isoFrom(parts[2] ?? '')
    const description = parts[3] ?? ''
    const amount = num(parts[4] ?? '')
    if (!date || !description || amount === null) {
      skipped.push(line.slice(0, 90))
      continue
    }

    const direction = /^cr$/i.test(parts[5] ?? '') ? 'credit' : 'debit'
    rows.push({
      date, description, amount, direction, accountTail,
      bank: 'BankA',
      clean: normalize(description),
    })
  }

  return { rows, format: 'BankA card CSV', skipped }
}

/**
 * Money Manager, exported from the phone app as a spreadsheet and saved as CSV.
 *
 * Worth supporting alongside bank statements because it carries the two things
 * a statement cannot: cash, and a category you already chose. Rent paid by
 * transfer appears here and in no bank message.
 *
 * Columns: Period, Accounts, Category, Subcategory, Note, INR, Income/Expense,
 * Description, Amount, Currency, Accounts.
 */
export function parseMoneyManagerCsv(text: string): ParseResult {
  const rows: StatementRow[] = []
  const skipped: string[] = []
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (!lines.length) return { rows, format: 'unrecognised', skipped: ['Empty file.'] }

  const split = (line: string): string[] => {
    const out: string[] = []
    let cur = '', quoted = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') { cur += '"'; i++ } else quoted = !quoted
      } else if (ch === ',' && !quoted) { out.push(cur); cur = '' } else cur += ch
    }
    out.push(cur)
    return out.map(c => c.trim())
  }

  const header = split(lines[0]).map(h => h.toLowerCase())
  const at = (name: string) => header.indexOf(name)
  const iDate = at('period'), iCat = at('category'), iSub = at('subcategory')
  const iNote = at('note'), iAmt = header.findIndex(h => h === 'inr' || h === 'amount')
  const iKind = at('income/expense'), iAcct = at('accounts')
  if (iDate < 0 || iAmt < 0 || iKind < 0) {
    return { rows, format: 'unrecognised', skipped: ['Not a Money Manager export.'] }
  }

  for (const line of lines.slice(1)) {
    const c = split(line)
    // Money Manager writes the date either as a spreadsheet serial number or
    // as text, depending on how it was saved.
    let date: string | null = null
    const raw = c[iDate] ?? ''
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) date = raw.slice(0, 10)
    else if (/^\d+(\.\d+)?$/.test(raw)) {
      const ms = (Number(raw) - 25569) * 86400000
      date = new Date(ms).toISOString().slice(0, 10)
    } else date = isoFrom(raw)

    const amount = num(c[iAmt] ?? '')
    if (!date || amount === null || amount === 0) { skipped.push(line.slice(0, 80)); continue }

    const sub = iSub >= 0 ? c[iSub] : ''
    const cat = iCat >= 0 ? c[iCat] : ''
    const note = iNote >= 0 ? c[iNote] : ''
    // A note is the most human label available; fall back to the category.
    const description = note || sub || cat || 'Money Manager entry'

    rows.push({
      date, description, amount,
      direction: /^exp/i.test(c[iKind] ?? '') ? 'debit' : 'credit',
      accountTail: null,
      bank: iAcct >= 0 && c[iAcct] ? `Money Manager, ${c[iAcct]}` : 'Money Manager',
      clean: normalize(description),
      categoryName: sub || null,
      parentName: cat || null,
      note: note || null,
    })
  }

  return { rows, format: 'Money Manager CSV', skipped }
}

/**
 * The canonical shape this app writes when several sources are combined.
 * Columns: date, description, amount, direction, account, category,
 * subcategory, note, source.
 */
export function parseCanonicalCsv(text: string): ParseResult {
  const rows: StatementRow[] = []
  const skipped: string[] = []
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (!lines.length) return { rows, format: 'unrecognised', skipped: ['Empty file.'] }

  const split = (line: string): string[] => {
    const out: string[] = []
    let cur = '', quoted = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') { cur += '"'; i++ } else quoted = !quoted
      } else if (ch === ',' && !quoted) { out.push(cur); cur = '' } else cur += ch
    }
    out.push(cur)
    return out.map(c => c.trim())
  }

  const header = split(lines[0]).map(h => h.toLowerCase())
  const at = (n: string) => header.indexOf(n)
  const i = {
    date: at('date'), desc: at('description'), amount: at('amount'),
    dir: at('direction'), acct: at('account'), cat: at('category'),
    sub: at('subcategory'), note: at('note'), src: at('source'),
  }
  if (i.date < 0 || i.amount < 0 || i.desc < 0) {
    return { rows, format: 'unrecognised', skipped: ['Not a combined history file.'] }
  }

  for (const line of lines.slice(1)) {
    const c = split(line)
    const date = /^\d{4}-\d{2}-\d{2}$/.test(c[i.date] ?? '') ? c[i.date] : isoFrom(c[i.date] ?? '')
    const amount = num(c[i.amount] ?? '')
    if (!date || amount === null || amount === 0) { skipped.push(line.slice(0, 80)); continue }
    const description = c[i.desc] || 'Entry'
    rows.push({
      date, description, amount,
      direction: (c[i.dir] ?? 'debit') === 'credit' ? 'credit' : 'debit',
      accountTail: null,
      bank: i.src >= 0 && c[i.src] ? c[i.src] : (i.acct >= 0 ? c[i.acct] : 'import'),
      clean: normalize(description),
      categoryName: i.sub >= 0 ? (c[i.sub] || null) : null,
      parentName: i.cat >= 0 ? (c[i.cat] || null) : null,
      note: i.note >= 0 ? (c[i.note] || null) : null,
    })
  }
  return { rows, format: 'Combined history', skipped }
}

/** Picks a parser by looking at the file rather than trusting its name. */
export function parseStatement(text: string): ParseResult {
  if (text.includes('~|~') && /Card No:/i.test(text)) return parseHdfcCardCsv(text)
  if (/income\/expense/i.test(text.split(/\r?\n/)[0] ?? '')) return parseMoneyManagerCsv(text)
  const head = (text.split(/\r?\n/)[0] ?? '').toLowerCase()
  if (head.includes('date') && head.includes('direction') && head.includes('amount')) {
    return parseCanonicalCsv(text)
  }
  return { rows: [], format: 'unrecognised', skipped: ['No known statement format matched this file.'] }
}
