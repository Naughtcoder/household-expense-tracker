import { Platform } from 'react-native'
import { IS_DEMO } from './variant'
import { Asset } from 'expo-asset'
import { File, Paths } from 'expo-file-system'
import { inrShort } from '@lib/format.ts'
import { countsAsSpend } from '@lib/scope.ts'
import { SpendWidget, type WidgetProps, type WidgetWho } from '@/widgets/HomeWidgets'

// What the home-screen Spend widget shows: today's and this month's spend for
// the household, Sam and Alex. Worked out from the Month screen's rows for
// the current month; no server calls of its own.

const SAM = '00000000-0000-4000-8000-dead00000002'
const ALEX = '00000000-0000-4000-8000-dead00000001'
const IST = 19800000 // India is UTC+5:30, with no daylight saving.
let last = ''
let logoUri: string | null | undefined

/** The app's coin, copied once into the App Group the widget can read, so the
 *  widget shows our icon (Alex, 5 Oct 2026). Null if it cannot be placed. */
async function sharedLogo(): Promise<string | null> {
  if (logoUri !== undefined) return logoUri
  try {
    const group = Paths.appleSharedContainers?.['group.com.example.expensetracker']
    if (!group) return (logoUri = null)
    const dest = new File(group, 'widget-logo.png')
    if (!dest.exists) {
      const asset = Asset.fromModule(require('../../assets/images/widget-logo.png'))
      await asset.downloadAsync()
      if (!asset.localUri) return (logoUri = null)
      new File(asset.localUri).copy(dest)
    }
    return (logoUri = dest.uri)
  } catch { return (logoUri = null) }
}

/** The next `n` India midnights after `now`, in ms. */
function midnights(now: number, n: number) {
  const startOfToday = Math.floor((now + IST) / 86400000) * 86400000 - IST
  return Array.from({ length: n }, (_, i) => startOfToday + (i + 1) * 86400000)
}

/** Writes this month's rows (the current month only) to the widget. `day` is
 *  today in India time, yyyy-mm-dd. */
export async function widgetMonth(day: string, rows: { amount: number | string; direction: string; scope: string; category_id?: number | null; occurred_on: string; paid_by: string }[]) {
  if (IS_DEMO) return // The demo app leaves the home-screen widget alone.
  if (Platform.OS !== 'ios' || !SpendWidget) return
  const sum: Record<WidgetWho, [number, number]> = { h: [0, 0], a: [0, 0], t: [0, 0] }
  for (const r of rows) {
    if (!countsAsSpend(r)) continue
    const n = Number(r.amount), isToday = r.occurred_on.slice(0, 10) === day
    const keys: WidgetWho[] = ['h']
    if (r.paid_by === SAM) keys.push('a')
    if (r.paid_by === ALEX) keys.push('t')
    for (const k of keys) { sum[k][1] += n; if (isToday) sum[k][0] += n }
  }
  const v = Object.fromEntries(Object.entries(sum).map(([k, [d, m]]) => [k, [inrShort(d), inrShort(m)]])) as Record<WidgetWho, [string, string]>
  const sig = JSON.stringify({ day, v })
  if (sig === last) return
  last = sig
  try {
    // Keep whoever the widget's own toggle is on.
    const now = Date.now()
    const shown = (await SpendWidget.getTimeline()).filter(e => e.date.getTime() <= now).pop()
    const who = shown?.props.who ?? 'h'
    const logo = (await sharedLogo()) ?? undefined
    const props: WidgetProps = { day, who, v, updated: now, logo }
    // One entry now, and one at each of the next seven India midnights. The
    // layout sees the snapshot's day is behind and shows nothing spent yet for
    // the new day (and the new month on the 1st) until the app is opened.
    SpendWidget.updateTimeline([{ date: new Date(now), props }, ...midnights(now, 7).map(t => ({ date: new Date(t), props }))])
  } catch { /* a widget failing must never break the app */ }
}
