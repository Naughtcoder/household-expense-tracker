import { useRef } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { C } from '@/theme'

export type Bar = { key: string; label: string; value: number; dim?: boolean; future?: boolean }

/** Bars that scroll sideways when there are many (three years of months),
 *  opening at the latest. Tapping a bar can open its period. */
export function Bars({ bars, color = C.accent, height = 140, barWidth, onPress }: { bars: Bar[]; color?: string; height?: number; barWidth?: number; onPress?: (b: Bar) => void }) {
  const ref = useRef<ScrollView>(null)
  const peak = Math.max(1, ...bars.map(b => b.value))
  const inner = (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: height + 18, gap: 3 }}>
      {bars.map(b => (
        <Pressable key={b.key} disabled={!onPress || b.future} onPress={() => onPress?.(b)} style={{ width: barWidth, flex: barWidth ? undefined : 1, alignItems: 'center', height: height + 18, justifyContent: 'flex-end' }}>
          <View style={{ width: '78%', height: Math.max(3, (b.value / peak) * height), borderRadius: 5, backgroundColor: color, opacity: b.future ? 0.15 : b.dim ? 0.35 : 1 }} />
          {/* Wider than a thin bar, so it is centred over it rather than squeezed into it. */}
          <View style={{ height: 14, marginTop: 4, width: '100%', alignItems: 'center', overflow: 'visible' }}>
            <Text numberOfLines={1} style={{ position: 'absolute', width: 28, textAlign: 'center', color: C.text3, fontSize: 10 }}>{b.label}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  )
  if (!barWidth) return inner
  return (
    <ScrollView ref={ref} horizontal showsHorizontalScrollIndicator={false} onContentSizeChange={() => ref.current?.scrollToEnd({ animated: false })}>
      {inner}
    </ScrollView>
  )
}
