// The website's two themes, so both feel like one product (app/tokens.css and
// app/theme.css). Screens read C.x at render, and C answers from whichever
// palette is active. src/lib/appearance.ts picks it; the root layout remounts
// the screens when it changes, because the React Compiler memoizes them and a
// plain re-render would leave the old colours on screen.
import { Appearance } from 'react-native'

export type Scheme = 'light' | 'dark'
export type Palette = {
  bg: string; card: string; raised: string; line: string
  text: string; text2: string; text3: string
  accent: string; accentText: string
  positive: string; negative: string; caution: string
}

const DARK: Palette = {
  bg: '#0B0B0C',
  card: '#1A1A1C',
  raised: '#262628',
  line: '#2E2E31',
  text: '#FFFFFF',
  text2: '#9A9AA0',
  text3: '#6C6C72',
  accent: '#FFFFFF',
  accentText: '#111113',
  positive: '#45C7AE',
  negative: '#FF6B6F',
  caution: '#FBBF24',
}

// :root[data-theme="light"] in app/theme.css, resolved through app/tokens.css.
const LIGHT: Palette = {
  bg: '#FFFFFF',          // --grey-0
  card: '#F6F6F7',        // --grey-50
  raised: '#EDEEF0',      // --grey-100
  line: '#DCDDE0',        // a step darker than raised, so a pressed row still shows
  text: '#111113',        // --grey-900
  text2: '#7C7C82',       // --grey-500
  text3: '#A6A6AB',       // --grey-400
  accent: '#111113',      // --grey-900
  accentText: '#FFFFFF',  // --grey-0
  positive: '#2FA58F',    // --income-green
  negative: '#E5484D',    // --alert-red
  caution: '#B45309',     // --amber-light
}

export const PALETTES: Record<Scheme, Palette> = { light: LIGHT, dark: DARK }

let scheme: Scheme = Appearance.getColorScheme() === 'light' ? 'light' : 'dark'
let active: Palette = PALETTES[scheme]

/** Switches the palette C reads from. Only src/lib/appearance.ts calls this. */
export function setScheme(s: Scheme) { scheme = s; active = PALETTES[s] }
/** The scheme C is reading from now. */
export const currentScheme = () => scheme

/** The active palette. Same shape as before light mode, so screens read C.bg,
 *  C.text and the rest unchanged; each key is a getter on the active palette. */
export const C = {} as Readonly<Palette>
for (const k of Object.keys(DARK) as (keyof Palette)[]) {
  Object.defineProperty(C, k, { get: () => active[k], enumerable: true })
}

/** Category tile colours, the same eighteen as the website's --hue-n. The
 *  same in both themes: the tiles stay coloured with a white glyph. */
export const HUES: Record<number, string> = {
  1: '#279AF4', 2: '#FE724E', 3: '#B1638B', 4: '#D364FE', 5: '#6A7CF9', 6: '#FDBC3B',
  7: '#FF78A3', 8: '#3BB19F', 9: '#F73C60', 10: '#23CAFF', 11: '#7B01FE', 12: '#FE6663',
  13: '#158AB1', 14: '#CD8952', 15: '#6BB2AA', 16: '#859977', 17: '#244C7F', 18: '#E3667E',
}
