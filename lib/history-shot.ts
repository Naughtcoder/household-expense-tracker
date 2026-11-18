/**
 * Reads a screenshot of a payment app's history list, as text the phone has
 * already pulled off the image (no image ever reaches the server).
 *
 * Why: SBI sends Sam no text for UPI payments, so a payment made while her
 * phone's readers were off is only in PhonePe's History. 17 Oct 2026: five
 * payments from 14 to 16 Oct were lost that way, including medicine.
 *
 * Each history row in PhonePe reads, left to right and top to bottom:
 *   "Paid to"            "₹2,105"
 *   "RAM MEDICALS"       "Debited from"
 *   "1 day ago"
 * The phone sends every line with its box, so rows are rebuilt from where the
 * lines sit, not from the order the text reader returned them in.
 */

export type OcrLine = { text: string; left: number; top: number; right: number; bottom: number }
export type ShotRow = { label: string; payee: string; amount: number; date: string; direction: 'debit' | 'credit' }
export type ShotRead = { rows: ShotRow[]; unread: string[] }

const LABEL = /^(paid to|sent to|transfer(?:red)? to|money sent to|received from|refund from|paid by)\b\s*(.*)$/i
const NOISE = /^(debited from|credited to|paid using|split|view|repeat|pending|failed|successful)\b/i
const MONTHS = 'janfebmaraprmayjunjulaugsepoctnovdec'
const DATE_ABS = /^(\d{1,2}) (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*,?(?: (20\d\d))?\b/i
const DATE_REL = /^(?:(just now|today|yesterday)|(\d+|an?|one) (min|minute|hour|hr|day|week)s? ago)\b/i

const istDate = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

/** "15 Oct", "15 Oct 2025", "1 day ago", "Yesterday", read against when the screenshot was taken. */
export function shotDate(text: string, takenAt: Date): string | null {
  const t = text.trim()
  const abs = t.match(DATE_ABS)
  if (abs) {
    const mon = MONTHS.indexOf(abs[2].toLowerCase()) / 3 + 1
    const taken = istDate(takenAt)
    let year = abs[3] ? Number(abs[3]) : Number(taken.slice(0, 4))
    const iso = (y: number) => `${y}-${String(mon).padStart(2, '0')}-${abs[1].padStart(2, '0')}`
    // No year printed means this year, unless that would be after the screenshot.
    if (!abs[3] && iso(year) > taken) year -= 1
    return iso(year)
  }
  const rel = t.match(DATE_REL)
  if (!rel) return null
  if (rel[1]) {
    const w = rel[1].toLowerCase()
    return istDate(new Date(takenAt.getTime() - (w === 'yesterday' ? 864e5 : 0)))
  }
  const n = /^\d+$/.test(rel[2]) ? Number(rel[2]) : 1
  const unit = rel[3].toLowerCase()
  const ms = unit.startsWith('min') ? 6e4 : unit.startsWith('h') ? 36e5 : unit === 'day' ? 864e5 : 7 * 864e5
  return istDate(new Date(takenAt.getTime() - n * ms))
}

/**
 * The amount on the right of a row. Every amount in the list starts with the
 * rupee sign, which text readers often turn into "7", "%", "·" or "Z"
 * ("₹101" read as "7101" on 17 Oct 2026), so the first character is dropped
 * whatever it was read as.
 */
export function shotAmount(text: string): number | null {
  let t = text.replace(/\s+/g, '').replace(/^(?:₹|rs\.?|inr)/i, '')
  if (t === text.replace(/\s+/g, '')) t = t.slice(1)
  if (!/^\d[\d,]*(?:\.\d{1,2})?$/.test(t)) return null
  const n = Number(t.replace(/,/g, ''))
  return n > 0 ? n : null
}

export function readHistoryShot(lines: OcrLine[], takenAt: Date): ShotRead {
  const all = lines.filter(l => l.text.trim()).map(l => ({ ...l, text: l.text.replace(/\s+/g, ' ').trim() }))
    .sort((a, b) => a.top - b.top || a.left - b.left)
  const width = Math.max(...all.map(l => l.right), 1)
  const labels = all.filter(l => LABEL.test(l.text) && l.left < width * 0.6)
  const rows: ShotRow[] = []
  const unread: string[] = []
  labels.forEach((lab, i) => {
    const h = Math.max(lab.bottom - lab.top, 1)
    const end = labels[i + 1]?.top ?? lab.top + 8 * h
    const box = all.filter(l => l !== lab && l.top >= lab.top - h && l.top < end - h / 2)
    const m = lab.text.match(LABEL)!
    const left = box.filter(l => l.left < width * 0.6).sort((a, b) => a.top - b.top)
    const right = box.filter(l => l.left >= width * 0.6)
    const payee = m[2] || left.find(l => !DATE_ABS.test(l.text) && !DATE_REL.test(l.text) && !NOISE.test(l.text) && /[a-z]/i.test(l.text))?.text
    const amountLine = right.find(l => shotAmount(l.text) !== null)
    const dateLine = [...left, ...right].find(l => shotDate(l.text, takenAt))
    const amount = amountLine ? shotAmount(amountLine.text) : null
    const date = dateLine ? shotDate(dateLine.text, takenAt) : null
    if (!payee || !amount || !date) {
      unread.push([lab.text, ...box.map(l => l.text)].join(' | '))
      return
    }
    const label = m[1].toLowerCase()
    rows.push({ label, payee, amount, date, direction: /received|refund/.test(label) ? 'credit' : 'debit' })
  })
  return { rows, unread }
}

/**
 * One row as the text the books read, so it goes through the same payee
 * rules, categories and duplicate check as a payment read off the screen.
 */
export function historyText(app: string, r: ShotRow): string {
  const [y, mo, d] = r.date.split('-')
  const month = new Date(Date.UTC(Number(y), Number(mo) - 1, 1)).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })
  return `[history ${app}] Paid to | ${r.payee} | ₹${r.amount} | ${Number(d)} ${month} ${y}`
}
