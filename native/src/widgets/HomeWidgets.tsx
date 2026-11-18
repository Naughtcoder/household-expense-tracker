// The home-screen Spend widget (iOS). The layout runs in WidgetKit's own
// JavaScript runtime, not the app's, so it can only use @expo/ui/swift-ui and
// must not reference anything outside its own function body: every colour and
// helper is declared inside. The app feeds it through src/lib/widget.ts.
import { Button, HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui'
import { aspectRatio, resizable, background, buttonStyle, containerBackground, font, foregroundStyle, frame, lineLimit, minimumScaleFactor, monospacedDigit, padding, clipShape, widgetURL } from '@expo/ui/swift-ui/modifiers'
import { createWidget, type WidgetEnvironment } from 'expo-widgets'

/** h is the household, a is Sam, t is Alex. */
export type WidgetWho = 'h' | 'a' | 't'
export type WidgetProps = {
  /** The India day the figures were worked out on, yyyy-mm-dd. */
  day?: string
  /** Who the toggle is on. Changed by tapping the widget itself. */
  who?: WidgetWho
  /** [today, this month], already short form, per person. */
  v?: Record<WidgetWho, [string, string]>
  /** When the app last wrote this, in ms. */
  updated?: number
  /** file:// of the app's coin in the shared App Group, drawn in the corner. */
  logo?: string
}

const SpendLayout = (p: WidgetProps, env: WidgetEnvironment) => {
  'widget'
  // The phone's own light or dark setting (WidgetKit tells the widget; the
  // app's Appearance choice cannot reach it). Same values as src/theme.ts.
  const light = env.colorScheme === 'light'
  const bg = light ? '#FFFFFF' : '#0B0B0C', raised = light ? '#EDEEF0' : '#262628'
  const text = light ? '#111113' : '#FFFFFF', text2 = light ? '#7C7C82' : '#9A9AA0', accentText = light ? '#FFFFFF' : '#111113'
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const NAMES: Record<string, string> = { h: 'Household', a: 'Sam', t: 'Alex' }
  const ORDER = ['h', 'a', 't']

  // The day this entry is shown on, in India time (UTC+5:30, no daylight saving).
  const at = new Date((env.date ? env.date.getTime() : Date.now()) + 19800000)
  const day = at.toISOString().slice(0, 10)
  const who = p.who && NAMES[p.who] ? p.who : 'h'
  const vals = p.v ? p.v[who] : undefined
  // A snapshot from an earlier day reads as nothing spent yet today; from an
  // earlier month, nothing spent this month either.
  const today = vals && p.day === day ? vals[0] : '₹0'
  const month = vals && p.day && p.day.slice(0, 7) === day.slice(0, 7) ? vals[1] : '₹0'
  const todayLabel = `Today, ${DAYS[at.getUTCDay()]} ${at.getUTCDate()} ${MON[at.getUTCMonth()]}`
  const monthLabel = MONTHS[at.getUTCMonth()]
  const next = ORDER[(ORDER.indexOf(who) + 1) % ORDER.length]
  const medium = env.widgetFamily === 'systemMedium'
  const mark = (size: number) => p.logo
    ? <Image uiImage={p.logo} modifiers={[resizable(), aspectRatio({ contentMode: 'fit' }), frame({ width: size, height: size }), clipShape('circle')]} />
    : null

  const pill = (k: string, on: boolean) => (
    <Button key={k} target={`who-${k}`} onPress={() => ({ who: k })} modifiers={[buttonStyle('plain')]}>
      <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(on ? accentText : text2), lineLimit(1),
        padding({ horizontal: 9, vertical: 4 }), background(on ? text : raised), clipShape('capsule')]}>{NAMES[k]}</Text>
    </Button>
  )
  const figure = (label: string, value: string, size: number) => (
    <VStack alignment="leading" spacing={1}>
      <Text modifiers={[font({ size: 12 }), foregroundStyle(text2), lineLimit(1)]}>{label}</Text>
      <Text modifiers={[font({ size, weight: 'heavy' }), monospacedDigit(), foregroundStyle(text), lineLimit(1), minimumScaleFactor(0.5)]}>{value}</Text>
    </VStack>
  )

  if (medium) {
    return (
      <VStack alignment="leading" spacing={8} modifiers={[frame({ maxWidth: 10000, maxHeight: 10000, alignment: 'topLeading' }), containerBackground(bg, 'widget'), widgetURL('household:///')]}>
        <HStack spacing={6}>
          {ORDER.map(k => pill(k, k === who))}
          <Spacer />
          {mark(26)}
        </HStack>
        <Spacer />
        <HStack alignment="bottom" spacing={12}>
          {figure(todayLabel, today, 30)}
          <Spacer />
          {figure(monthLabel, month, 30)}
        </HStack>
      </VStack>
    )
  }
  return (
    <VStack alignment="leading" spacing={4} modifiers={[frame({ maxWidth: 10000, maxHeight: 10000, alignment: 'topLeading' }), containerBackground(bg, 'widget'), widgetURL('household:///')]}>
      <HStack spacing={6}>
        <Button target="who-next" onPress={() => ({ who: next })} modifiers={[buttonStyle('plain')]}>
          <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(text), lineLimit(1),
            padding({ horizontal: 9, vertical: 4 }), background(raised), clipShape('capsule')]}>{`${NAMES[who]} ›`}</Text>
        </Button>
        <Spacer />
        {mark(22)}
      </HStack>
      <Spacer />
      {figure(todayLabel, today, 24)}
      {figure(monthLabel, month, 18)}
    </VStack>
  )
}

/** Null when the widget could not be set up (say, a bundler started before
 *  expo-widgets was installed, which skips the 'widget' transform). The app
 *  carries on without it. */
export const SpendWidget = (() => {
  try { return createWidget<WidgetProps>('SpendWidget', SpendLayout) } catch (e) { console.warn('Spend widget not set up', e); return null }
})()
