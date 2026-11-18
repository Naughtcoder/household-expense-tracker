import { useEffect, useRef, useSyncExternalStore } from 'react'
import { EMPLOYER } from './variant'
import { Platform } from 'react-native'
import { router } from 'expo-router'
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker'

// A category picked in the sheet for a payment that does not exist yet (the
// Add screen). The sheet sets it; the Add screen reads it when it shows again.
let chosen: number | null = null
const listeners = new Set<() => void>()
export const setChosen = (id: number | null) => { chosen = id; listeners.forEach(l => l()) }
export const useChosen = () => useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb) }, () => chosen)

// A month (2026-10) or year (2026) picked in the period sheet for a screen
// other than Month, which keeps its own period (Insights, a category page).
let period: string | null = null
const pListeners = new Set<() => void>()
export const setPicked = (k: string | null) => { period = k; pListeners.forEach(l => l()) }
export const usePicked = () => useSyncExternalStore(cb => { pListeners.add(cb); return () => pListeners.delete(cb) }, () => period)

// The category sheet hands its choice back through one shared slot. Only the
// screen that opened it takes the answer, so two open screens cannot both
// act on one tap.
let asking: string | null = null

/** Opens the category sheet for something that is not a payment, and calls
 *  `onPick` with the category chosen there. `who` names the asker. */
export function useCategoryChoice(who: string, onPick: (id: number) => void) {
  const chosen = useChosen()
  const cb = useRef(onPick)
  cb.current = onPick
  useEffect(() => {
    if (chosen == null || asking !== who) return
    asking = null
    setChosen(null)
    cb.current(chosen)
  }, [chosen, who])
  return () => { asking = who; router.push({ pathname: '/pick', params: { mode: 'choose', txn: '' } }) }
}

// Any other one-of-a-few choice (who it is for, who paid, a day of the
// month) opens the generic sheet at /choose. The asking screen leaves the
// question here, the sheet leaves the answer, and only the asker takes it.
export type SheetOption = { value: string; label: string; hint?: string }
export type SheetAsk = { title: string; options: SheetOption[]; value: string | null; note?: string; future?: boolean }
let ask: (SheetAsk & { who: string }) | null = null
let answer: { who: string; value: string } | null = null
const aListeners = new Set<() => void>()
const tell = () => aListeners.forEach(l => l())
const useAnswer = () => useSyncExternalStore(cb => { aListeners.add(cb); return () => aListeners.delete(cb) }, () => answer)

/** The question the sheet is showing. Read by the sheet routes only. */
export const sheetAsk = () => ask
/** The sheet's reply. `null` closes it without a choice. */
export const answerSheet = (value: string | null) => {
  if (ask && value != null) { answer = { who: ask.who, value }; tell() }
  ask = null
}

function useAnswerFor(who: string, onPick: (value: string) => void) {
  const a = useAnswer()
  const cb = useRef(onPick)
  cb.current = onPick
  useEffect(() => {
    if (!a || a.who !== who) return
    answer = null
    cb.current(a.value)
  }, [a, who])
}

/** Opens the choice sheet and calls `onPick` with the value tapped there.
 *  `who` names the asker, so two open screens never both take one answer. */
export function useSheetChoice(who: string, onPick: (value: string) => void) {
  useAnswerFor(who, onPick)
  return (q: SheetAsk) => { ask = { ...q, who }; router.push('/choose') }
}

/** A date as yyyy-mm-dd in the phone's own time, and back. Dates cross
 *  screens as these strings, never as Date objects. */
export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const dayOf = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return y && m && d ? new Date(y, m - 1, d) : new Date()
}

/** Opens the date sheet (the iOS calendar with a Done button; Android's own
 *  date dialog) and calls `onPick` with the day chosen, as yyyy-mm-dd. */
export function useDateChoice(who: string, onPick: (iso: string) => void, future = false) {
  useAnswerFor(who, onPick)
  return (current: string, title = 'Date') => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        // A payment has happened, so no later than today; a plan is for days ahead.
        value: dayOf(current), mode: 'date', maximumDate: future ? undefined : new Date(),
        onChange: (e, d) => { if (e.type === 'set' && d) onPick(isoDay(d)) },
      })
      return
    }
    ask = { title, options: [], value: current, who, future }
    router.push('/date')
  }
}

/** Who a payment is for, each with the one line that says what it does. */
export const SCOPE_OPTIONS: SheetOption[] = [
  { value: 'household', label: 'Household', hint: 'Our own spending. Counts in the month and the budgets.' },
  { value: 'claimable', label: `${EMPLOYER === 'work' ? 'Work' : EMPLOYER} claim`, hint: `${EMPLOYER === 'work' ? 'Work' : EMPLOYER} pays this back. Kept out of household spending.` },
  { value: 'investment', label: 'Investment', hint: 'Money put away, not spent.' },
  { value: 'transfer', label: 'Transfer', hint: 'Money moved between our own accounts. Not spending.' },
]
export const scopeLabel = (v: string) => SCOPE_OPTIONS.find(o => o.value === v)?.label ?? v
/** The scope options limited to the given values, in the usual order. */
export const scopesOf = (...values: string[]) => SCOPE_OPTIONS.filter(o => values.includes(o.value))

/** "Mon 4 Oct 2026" from yyyy-mm-dd. */
export const dayLabel = (iso: string) => dayOf(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
