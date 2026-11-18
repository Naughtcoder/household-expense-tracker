'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export type Jump = {
  /** The address to go to, with __K__ where the chosen period goes. */
  template: string
  mode: 'month' | 'year'
  /** The period on screen: 2026-10 or 2026. */
  current: string
  /** How the period is written into the address: 2026-10, 2026-10-01 or 2026. */
  format: 'ym' | 'ymd' | 'y' | 'y01'
  minYear?: number
}

/** Tapping "October 2026" opens the years across the top and the twelve
 *  months under them, so a month two years back is two taps, not twenty-four. */
export function PeriodPick({ label, jump }: { label: string; jump: Jump }) {
  const router = useRouter()
  const now = new Date()
  const thisYear = now.getFullYear(), thisMonth = now.getMonth()
  const [open, setOpen] = useState(false)
  const [year, setYear] = useState(Number(jump.current.slice(0, 4)))
  const curMonth = jump.mode === 'month' ? Number(jump.current.slice(5, 7)) - 1 : -1
  const years: number[] = []
  for (let y = thisYear; y >= (jump.minYear ?? 2022); y--) years.push(y)

  const go = (y: number, m: number) => {
    const mm = String(m + 1).padStart(2, '0')
    const k = jump.format === 'ym' ? `${y}-${mm}` : jump.format === 'ymd' ? `${y}-${mm}-01` : jump.format === 'y01' ? `${y}-01-01` : String(y)
    setOpen(false)
    router.replace(jump.template.replace('__K__', k))
  }

  return (
    <>
      <button type="button" className="pnav-jump" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        {label} <span aria-hidden className="caret">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="pickpop" role="dialog" aria-label="Pick a period">
          <div className="pickyears">
            {years.map(y => (
              <button key={y} type="button" className={`pill${y === year ? ' on' : ''}`}
                onClick={() => (jump.mode === 'year' ? go(y, 0) : setYear(y))}>{y}</button>
            ))}
          </div>
          {jump.mode === 'month' && (
            <div className="pickmonths">
              {MONTHS.map((name, m) => {
                const future = year > thisYear || (year === thisYear && m > thisMonth)
                const on = year === Number(jump.current.slice(0, 4)) && m === curMonth
                return (
                  <button key={name} type="button" disabled={future} className={on ? 'on' : ''} onClick={() => go(year, m)}>{name}</button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </>
  )
}
