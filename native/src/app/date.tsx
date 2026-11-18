import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { router } from 'expo-router'
import { CloseX } from '@/components/ui'
import DateTimePicker from '@react-native-community/datetimepicker'
import { answerSheet, dayOf, isoDay, sheetAsk } from '@/lib/choice'
import { C, currentScheme } from '@/theme'

/** The date sheet (iOS): the system calendar and a Done button. Android
 *  never comes here; it opens its own date dialog straight from the screen. */
export default function DateSheet() {
  const [q] = useState(sheetAsk)
  const [day, setDay] = useState(() => dayOf(q?.value ?? isoDay(new Date())))
  useEffect(() => () => answerSheet(null), [])
  useEffect(() => { if (!q) router.back() }, [q])
  if (!q) return null
  const done = () => { answerSheet(isoDay(day)); router.back() }
  return (
    <View style={{ flex: 1, backgroundColor: C.card, padding: 20, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <CloseX label="Cancel" onPress={() => router.back()} />
        <Text style={{ color: C.text, fontSize: 20, fontWeight: '700', flex: 1, marginLeft: 12 }}>{q.title}</Text>
        <Pressable onPress={done} hitSlop={12} accessibilityRole="button">
          <Text style={{ color: C.accent, fontSize: 17, fontWeight: '700' }}>Done</Text>
        </Pressable>
      </View>
      <DateTimePicker value={day} mode="date" display="inline" maximumDate={q.future ? undefined : new Date()} themeVariant={currentScheme()} accentColor={C.positive}
        onChange={(_e, d) => { if (d) setDay(d) }} />
    </View>
  )
}
