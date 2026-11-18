import Link from 'next/link'
import { NavLink } from './navlink'
import { PeriodPick, type Jump } from './periodpick'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'

/**
 * The month (or week, or year) with arrows either side, centred, the way
 * Dime heads every screen. Forward stops at the current period.
 */
export function PeriodNav({ label, prevHref, nextHref, sub, jump }: {
  label: string; prevHref: string; nextHref: string | null; sub?: React.ReactNode
  /** Tapping the label opens a year and month picker. */
  jump?: Jump
}) {
  return (
    <div className="pnav">
      <NavLink replace href={prevHref} aria-label="Earlier" className="pnav-arrow"><IconChevronLeft size={22} stroke={2} /></NavLink>
      <div className="pnav-label">
        {jump ? <PeriodPick label={label} jump={jump} /> : <div>{label}</div>}
        {sub && <div className="pnav-sub">{sub}</div>}
      </div>
      {nextHref
        ? <NavLink replace href={nextHref} aria-label="Later" className="pnav-arrow"><IconChevronRight size={22} stroke={2} /></NavLink>
        : <span className="pnav-arrow off" aria-hidden="true"><IconChevronRight size={22} stroke={2} /></span>}
    </div>
  )
}
