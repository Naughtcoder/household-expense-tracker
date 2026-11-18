import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native'
import { Stack, router } from 'expo-router'
import { dayLabel } from '@lib/format.ts'
import { useSubscriptions } from '@/lib/setup-data'
import { Card, Label, inr } from '@/components/ui'
import { C } from '@/theme'

/** Anything that charges about once a month for about the same amount, found
 *  from the payments themselves. The yearly figure is the point. */
export default function Subscriptions() {
  const q = useSubscriptions()
  const subs = q.data ?? []
  const monthly = subs.reduce((s, x) => s + x.monthly, 0)
  const rose = subs.filter(s => s.rose)

  return (
    <FlatList
      style={{ backgroundColor: C.bg }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
      data={subs} keyExtractor={(s, i) => `${s.key}|${i}`}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={C.text2} />}
      ListHeaderComponent={
        <View style={{ marginBottom: 10 }}>
          <Stack.Screen options={{ title: 'Repeat charges' }} />
          <Card style={{ gap: 4 }}>
            <Label>Repeat charges</Label>
            <Text style={{ color: C.text, fontSize: 36, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{inr(monthly * 12)}</Text>
            <Text style={{ color: C.text2 }}>
              a year, {inr(monthly)} a month across {subs.length} payee{subs.length === 1 ? '' : 's'}
              {rose.length > 0 ? `, ${rose.length} went up last time` : ''}
            </Text>
          </Card>
        </View>
      }
      renderItem={({ item: s, index }) => (
        <Pressable onPress={() => router.push({ pathname: '/m/[key]', params: { key: s.key } })}
          style={({ pressed }) => ({ flexDirection: 'row', gap: 12, paddingVertical: 12, borderTopWidth: index ? 1 : 0, borderTopColor: C.line, opacity: pressed ? 0.6 : 1 })}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.text, fontWeight: '600' }} numberOfLines={1}>{s.name}</Text>
            <Text style={{ color: C.text2, fontSize: 12 }}>
              {inr(s.monthly)} a month · charged in {s.months} of the last 6 months · last {dayLabel(s.last)}
              {s.rose && s.previousAmount !== null ? <Text style={{ color: C.caution }}> · up from {inr(s.previousAmount)} to {inr(s.lastAmount)}</Text> : null}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ color: C.text, fontVariant: ['tabular-nums'], fontWeight: '600' }}>{inr(s.yearly)}</Text>
            <Text style={{ color: C.text2, fontSize: 12 }}>a year</Text>
          </View>
        </Pressable>
      )}
      ListEmptyComponent={q.isLoading ? null : <Text style={{ color: C.text2, paddingVertical: 12 }}>{q.error ? (q.error as Error).message : 'Nothing charges you every month yet.'}</Text>}
      ListFooterComponent={
        <Text style={{ color: C.text2, fontSize: 13, marginTop: 14 }}>
          Found from the payments: a payee that charged in at least 3 of the last 6 months, about once a month, for about the same amount. Rent and staff count too, because they repeat the same way.
        </Text>
      }
    />
  )
}
