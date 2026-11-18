import { useEffect, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { router } from 'expo-router'
import { CloseX } from '@/components/ui'
import { answerSheet, sheetAsk } from '@/lib/choice'
import { C } from '@/theme'

/** The generic choice sheet: one large row per option, a line saying what
 *  it means, and a tick on the current one. Tapping a row answers and closes. */
export default function Choose() {
  const [q] = useState(sheetAsk)
  // Closed by a swipe or a reload: no answer goes back.
  useEffect(() => () => answerSheet(null), [])
  useEffect(() => { if (!q) router.back() }, [q])
  if (!q) return null
  const pick = (v: string) => { answerSheet(v); router.back() }
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.card }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: q.note ? 4 : 12 }}>
        <Text style={{ color: C.text, fontSize: 20, fontWeight: '700', flex: 1 }}>{q.title}</Text>
        <CloseX onPress={() => router.back()} />
      </View>
      {q.note ? <Text style={{ color: C.text2, fontSize: 14, marginBottom: 12 }}>{q.note}</Text> : null}
      <View style={{ backgroundColor: C.raised, borderRadius: 14, overflow: 'hidden' }}>
        {q.options.map((o, i) => {
          const on = o.value === q.value
          return (
            <Pressable key={o.value} onPress={() => pick(o.value)} accessibilityRole="button" accessibilityState={{ selected: on }}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 12, paddingHorizontal: 16,
                borderTopWidth: i ? 1 : 0, borderTopColor: C.line, backgroundColor: pressed ? C.line : 'transparent' })}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontSize: 17, fontWeight: on ? '600' : '400' }}>{o.label}</Text>
                {o.hint ? <Text style={{ color: C.text2, fontSize: 13, marginTop: 2 }}>{o.hint}</Text> : null}
              </View>
              <Text style={{ color: C.accent, fontSize: 18, fontWeight: '700', width: 20, textAlign: 'right' }}>{on ? '✓' : ''}</Text>
            </Pressable>
          )
        })}
      </View>
    </ScrollView>
  )
}
