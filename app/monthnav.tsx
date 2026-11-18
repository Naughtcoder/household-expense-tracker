import { PeriodNav } from './periodnav'

/** Arrows either side of the month. Forward stops at the current month. */
export function MonthNav({ label, prev, next, isCurrent, who, current }: {
  label: string; prev: string; next: string; isCurrent: boolean; who?: string | null; current: string
}) {
  const w = who ? `&who=${who}` : ''
  return <PeriodNav label={label} prevHref={`/?m=${prev}${w}`} nextHref={isCurrent ? null : `/?m=${next}${w}`}
    jump={{ template: `/?m=__K__${w}`, mode: 'month', current, format: 'ym' }} />
}
