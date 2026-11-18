import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native'
import { Stack, router } from 'expo-router'
import { dayLabel } from '@lib/format.ts'
import { useMerchants } from '@/lib/setup-data'
import { inr } from '@/components/ui'
import { C } from '@/theme'

/** Where the money actually goes, by payee. Claimable spend is left out,
 *  since it comes back. Each row opens the payee. */
export default function Merchants() {
  const q = useMerchants()
  const list = q.data ?? []
  const biggest = list[0]?.total || 1

  return (
    <FlatList
      style={{ backgroundColor: C.bg }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
      data={list} keyExtractor={(m, i) => `${m.key}|${i}`}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={C.text2} />}
      ListHeaderComponent={
        <View style={{ marginBottom: 8 }}>
          <Stack.Screen options={{ title: 'Merchants' }} />
          <Text style={{ color: C.text2 }}>Where the money actually goes. Claimable spend is left out, since it comes back.</Text>
        </View>
      }
      renderItem={({ item: m, index }) => (
        <Pressable onPress={() => router.push({ pathname: '/m/[key]', params: { key: m.key } })}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderTopWidth: index ? 1 : 0, borderTopColor: C.line, opacity: pressed ? 0.6 : 1 })}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: C.text, fontWeight: '600' }} numberOfLines={1}>{m.name}</Text>
            <Text style={{ color: C.text2, fontSize: 12 }}>{m.count} time{m.count === 1 ? '' : 's'} · last {dayLabel(m.last)}</Text>
            <View style={{ height: 4, borderRadius: 2, backgroundColor: C.raised, marginTop: 4 }}>
              <View style={{ width: `${(m.total / biggest) * 100}%`, height: 4, borderRadius: 2, backgroundColor: C.text2 }} />
            </View>
          </View>
          <Text style={{ color: C.text, fontVariant: ['tabular-nums'], fontWeight: '600' }}>{inr(m.total)}</Text>
        </Pressable>
      )}
      ListEmptyComponent={q.isLoading ? null : <Text style={{ color: C.text2, paddingVertical: 12 }}>{q.error ? (q.error as Error).message : 'Nothing yet.'}</Text>}
    />
  )
}
