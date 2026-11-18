import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { CloseX } from '@/components/ui'
import { monthKeyOf } from '@/lib/data'
import { setPicked } from '@/lib/choice'
import { C } from '@/theme'

const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** A sheet: years across the top, the twelve months under them. */
export default function MonthSheet() {
  const { m, mode } = useLocalSearchParams<{ m?: string; mode?: string }>()
  // 'pick' hands the choice back to the screen that opened the sheet; 'year'
  // is the same with years only. Without a mode it is the Month tab's.
  const yearsOnly = mode === 'year'
  const now = monthKeyOf()
  const [ny, nm] = now.split('-').map(Number)
  const [year, setYear] = useState(Number((m ?? now).slice(0, 4)))
  const years: number[] = []
  for (let y = ny; y >= 2022; y--) years.push(y)
  const pick = (i: number) => {
    const key = `${year}-${String(i + 1).padStart(2, '0')}`
    if (mode === 'pick') { setPicked(key); router.back(); return }
    router.dismissTo({ pathname: '/', params: { m: key } })
  }
  return (
    <View style={{ flex: 1, backgroundColor: C.card, padding: 20, gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: C.text, fontSize: 20, fontWeight: '700' }}>{yearsOnly ? 'Go to a year' : 'Go to a month'}</Text>
        <CloseX onPress={() => router.back()} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ flexGrow: 0 }}>
        {years.map(y => (
          <Pressable key={y} onPress={() => { if (yearsOnly) { setPicked(String(y)); router.back() } else setYear(y) }} style={{ paddingVertical: 8, paddingHorizontal: 16, borderRadius: 999, backgroundColor: y === year ? C.accent : C.raised }}>
            <Text style={{ color: y === year ? C.accentText : C.text, fontWeight: '600' }}>{y}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {!yearsOnly && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {SHORT.map((name, i) => {
          const future = year > ny || (year === ny && i + 1 > nm)
          const on = m === `${year}-${String(i + 1).padStart(2, '0')}`
          return (
            <Pressable key={name} disabled={future} onPress={() => pick(i)}
              style={{ width: '23%', paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: on ? C.accent : C.raised, opacity: future ? 0.3 : 1 }}>
              <Text style={{ color: on ? C.accentText : C.text, fontWeight: '600', fontSize: 16 }}>{name}</Text>
            </Pressable>
          )
        })}
      </View>}
    </View>
  )
}
