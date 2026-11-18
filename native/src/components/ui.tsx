import { SymbolView } from 'expo-symbols'
import { Platform, Pressable, Text, View, type ViewStyle } from 'react-native'
import { C } from '@/theme'

export const inr = (n: number) => `₹${Math.round(Math.abs(n)).toLocaleString('en-IN')}`

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[{ backgroundColor: C.card, borderRadius: 18, padding: 14 }, style]}>{children}</View>
}

/** Small round choices in one row: whose money, and similar. */
export function Pills<T extends string | null>({ options, value, onChange }: { options: [T, string][]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
      {options.map(([v, label]) => {
        const on = v === value
        return (
          <Pressable key={label} onPress={() => onChange(v)}
            style={{ paddingVertical: 7, paddingHorizontal: 14, borderRadius: 999, backgroundColor: on ? C.accent : C.raised }}>
            <Text style={{ color: on ? C.accentText : C.text2, fontWeight: '600', fontSize: 14 }}>{label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export const Label = ({ children }: { children: React.ReactNode }) =>
  <Text style={{ color: C.text2, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 }}>{children}</Text>

/** An amount with its share of the whole beside it, greyed ("₹18,000  21%").
 *  Every breakdown list shows the mix this way. Ruled by Alex, 4 Oct 2026. */
export const pct = (v: number, of: number) => {
  if (!of) return ''
  const p = (v / of) * 100
  return p > 0 && p < 1 ? '<1%' : `${Math.round(p)}%`
}
export function AmountShare({ v, of, bold }: { v: number; of: number; bold?: boolean }) {
  return (
    <Text style={{ color: C.text, fontWeight: bold ? '600' : '400', fontVariant: ['tabular-nums'] }}>
      {inr(v)} <Text style={{ color: C.text3, fontWeight: '400' }}>{pct(v, of)}</Text>
    </Text>
  )
}

/** A field that opens a sheet to choose its value: its name, what it is now, and a chevron. */
export function ChoiceRow({ label, value, onPress, muted }: { label: string; value: string; onPress: () => void; muted?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}, ${value}`}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: pressed ? C.line : C.raised })}>
      <Text style={{ color: C.text2, fontSize: 15 }}>{label}</Text>
      <Text style={{ flex: 1, color: muted ? C.text2 : C.text, fontSize: 16, fontWeight: '600', textAlign: 'right' }} numberOfLines={1}>{value}</Text>
      <Text style={{ color: C.text3, fontSize: 18 }}>›</Text>
    </Pressable>
  )
}

/** The round X that closes anything that pops up (Alex, 5 Oct 2026: every
 *  sheet and Add must be cancellable). */
export function CloseX({ onPress, label = 'Close' }: { onPress: () => void; label?: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={12} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => ({ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: C.raised, opacity: pressed ? 0.6 : 1 })}>
      {Platform.OS === 'ios'
        ? <SymbolView name="xmark" tintColor={C.text2} size={14} weight="bold" />
        : <Text style={{ color: C.text2, fontSize: 16, fontWeight: '700' }}>✕</Text>}
    </Pressable>
  )
}
