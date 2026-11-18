import { useSyncExternalStore } from 'react'
import { Appearance } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { currentScheme, setScheme, type Scheme } from '@/theme'

// Light, dark, or follow the phone. The choice is kept on the phone and read
// once at launch, before the screens first draw (the splash waits for it).
export type AppearanceMode = 'system' | 'light' | 'dark'
export const APPEARANCE_OPTIONS: { value: AppearanceMode; label: string; hint: string }[] = [
  { value: 'system', label: 'System', hint: "Follows the phone's own light or dark setting." },
  { value: 'light', label: 'Light', hint: 'Always light.' },
  { value: 'dark', label: 'Dark', hint: 'Always dark.' },
]
export const appearanceLabel = (m: AppearanceMode) => APPEARANCE_OPTIONS.find(o => o.value === m)?.label ?? m

const KEY = 'appearance-mode'
const isMode = (v: unknown): v is AppearanceMode => v === 'system' || v === 'light' || v === 'dark'

let mode: AppearanceMode | undefined
let scheme: Scheme = currentScheme()
let returnTo: string | null = null
const listeners = new Set<() => void>()
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb) } }

/** Works out the scheme from the mode and the phone, and moves the palette
 *  before anything re-renders, so the remounted screens read the new one. */
function recompute() {
  const sys = Appearance.getColorScheme()
  const next: Scheme = mode === 'light' || mode === 'dark' ? mode : sys === 'light' ? 'light' : 'dark'
  if (next !== scheme) { scheme = next; setScheme(next) }
  listeners.forEach(l => l())
}

// Light or Dark also sets the window's own style, so the system parts (the
// keyboard, the tab bar, alerts, sheets, the date picker) match the app.
const applyNative = (m: AppearanceMode) => Appearance.setColorScheme(m === 'system' ? 'unspecified' : m)

Appearance.addChangeListener(() => { if (mode !== undefined) recompute() })

let loading: Promise<void> | null = null
/** Reads the saved choice. Called once by the root layout. */
export function loadAppearance() {
  loading ??= AsyncStorage.getItem(KEY).catch(() => null).then(v => {
    mode = isMode(v) ? v : 'system'
    applyNative(mode)
    recompute()
  })
  return loading
}

/** Saves and applies a choice. `from` is the route to put the user back on
 *  after the screens remount (they restart on the first tab otherwise). */
export function setAppearanceMode(m: AppearanceMode, from?: string) {
  const before = scheme
  mode = m
  AsyncStorage.setItem(KEY, m).catch(() => {})
  applyNative(m)
  returnTo = from ?? null
  recompute()
  if (scheme === before) returnTo = null
}

/** The saved choice, or undefined before it has been read. */
export const useAppearanceMode = () => useSyncExternalStore(subscribe, () => mode)
/** The scheme in use, or undefined before the saved choice has been read. */
export const useScheme = () => useSyncExternalStore(subscribe, () => (mode === undefined ? undefined : scheme))
/** The route to return to after a theme remount, taken once. */
export const takeReturnTo = () => { const r = returnTo; returnTo = null; return r }
