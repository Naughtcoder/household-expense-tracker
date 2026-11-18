import { useMemo } from 'react'
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native'
import { Stack, router } from 'expo-router'
import { catTree } from '@lib/cats.ts'
import { describeRule } from '@lib/rules.ts'
import { useCategories } from '@/lib/data'
import { useRules } from '@/lib/setup-data'
import { C } from '@/theme'

/** The payee rules: the ones Review writes and the ones made by hand. Tap
 *  one to change it; + makes a new one. */
export default function Rules() {
  const q = useRules()
  const cats = useCategories()
  const tree = useMemo(() => catTree(cats.data ?? []), [cats.data])
  const label = (id: number | null) => tree.label(id) || 'No category'
  const rules = q.data ?? []

  return (
    <FlatList
      style={{ backgroundColor: C.bg }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
      data={rules} keyExtractor={r => String(r.id)}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={C.text2} />}
      ListHeaderComponent={
        <View style={{ marginBottom: 8 }}>
          <Stack.Screen options={{
            title: 'Rules',
            headerRight: () => (
              <Pressable onPress={() => router.push('/rule')} hitSlop={12} accessibilityRole="button" accessibilityLabel="New rule">
                <Text style={{ color: C.text, fontSize: 26, fontWeight: '400', lineHeight: 28 }}>+</Text>
              </Pressable>
            ),
          }} />
          <Text style={{ color: C.text2 }}>Written every time you file something in Review, or made here with +. A wrong one repeats forever until you change it.</Text>
        </View>
      }
      renderItem={({ item: r, index }) => (
        <Pressable onPress={() => router.push({ pathname: '/rule', params: { id: String(r.id) } })}
          style={({ pressed }) => ({ paddingVertical: 11, borderTopWidth: index ? 1 : 0, borderTopColor: C.line, opacity: pressed ? 0.6 : 1 })}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: C.text, fontWeight: '600' }} numberOfLines={1}>{r.merchant || r.match_key}</Text>
              <Text style={{ color: C.text2, fontSize: 12 }} numberOfLines={2}>{describeRule(r, label(r.category_id))}</Text>
            </View>
            <Text style={{ color: C.text3, fontSize: 18 }}>›</Text>
          </View>
        </Pressable>
      )}
      ListEmptyComponent={q.isLoading ? null : <Text style={{ color: C.text2, paddingVertical: 12 }}>{q.error ? (q.error as Error).message : 'No rules yet. Tap + to make one, or file something in Review.'}</Text>}
    />
  )
}
