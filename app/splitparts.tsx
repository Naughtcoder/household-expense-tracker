import Link from 'next/link'

type P = { id: string; amount: number | string; category_id: number | null; note?: string | null }

const inr = (n: number) => `${n < 0 ? '−' : ''}₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

/** Under a split payment in a list: "Split into 3", opening to each part,
 *  each one a link to its category for the month. */
export function SplitParts({ parts, label, month }: { parts: P[]; label: (id: number | null) => string; month: string }) {
  return (
    <details className="splitparts">
      <summary>Split into {parts.length}</summary>
      {parts.map(p => (
        <Link key={p.id} href={p.category_id ? `/c/${p.category_id}?m=${month}` : `/t/${p.id}`} className="splitpart">
          <span>{label(p.category_id)}{p.note ? ` · ${p.note}` : ''}</span>
          <span className="num">{inr(Number(p.amount))}</span>
        </Link>
      ))}
    </details>
  )
}
