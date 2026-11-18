import Link from 'next/link'
import { NavLink } from './navlink'
import { PEOPLE } from '../lib/drill'

/**
 * Household, Sam or Alex, on any screen where whose money it is changes
 * the answer. Swaps the page in place (no history), keeping everything else
 * in the address the same.
 */
export function WhoToggle({ path, params, who }: { path: string; params: Record<string, string | undefined>; who?: string | null }) {
  const href = (w: string | null) => {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v && k !== 'who') q.set(k, v)
    if (w) q.set('who', w)
    const s = q.toString()
    return s ? `${path}?${s}` : path
  }
  const opts: [string | null, string][] = [[null, 'Household'], ...Object.entries(PEOPLE).sort((a, b) => a[1].localeCompare(b[1])) as [string, string][]]
  return (
    <div className="filters" role="tablist" aria-label="Whose">
      {opts.map(([id, name]) => (
        <NavLink replace key={name} role="tab" aria-selected={(who ?? null) === id} className={`pill${(who ?? null) === id ? ' on' : ''}`} href={href(id)}>{name}</NavLink>
      ))}
    </div>
  )
}
