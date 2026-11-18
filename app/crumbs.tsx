import Link from 'next/link'
import { BackLink } from './backlink'

export type Crumb = { label: string; href?: string }

/**
 * Where you are and every level above it. Drilling down is tapping a row;
 * going up is tapping any word here, which jumps straight to that level
 * (2026 > Food > Delivery > Swiggy). The arrow is Back: the screen you came
 * from, which is not always the level above.
 */
export function Crumbs({ trail, fallback }: { trail: Crumb[]; fallback: string }) {
  return (
    <nav className="crumbs" aria-label="Where you are">
      <BackLink href={fallback} label="" />
      <ol>
        {trail.map((c, i) => (
          <li key={i}>
            {c.href && i < trail.length - 1 ? <Link href={c.href}>{c.label}</Link> : <span aria-current={i === trail.length - 1 ? 'page' : undefined}>{c.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  )
}
