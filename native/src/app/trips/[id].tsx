import { useMemo, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import { router, useLocalSearchParams, Stack } from 'expo-router'
import { catTree } from '@lib/cats.ts'
import { dayLabel, inrExact } from '@lib/format.ts'
import { useCategories } from '@/lib/data'
import { partOf, useTrip } from '@/lib/trips-data'
import { CatIcon } from '@/components/CatIcon'
import { Card, Label, inr, AmountShare } from '@/components/ui'
import { C } from '@/theme'

/** One trip or tag: the total, where it went by top category, and every payment in it. */
export default function Trip() {
  const params = useLocalSearchParams<{ id: string; part?: string; top?: string }>()
  const tagId = Number(params.id)
  // A narrowing of the payment list: one top category (from "Where it went")
  // or one part of the trip (from the chips on the Trips list).
  const [only, setOnly] = useState<{ kind: 'top' | 'part'; name: string } | null>(
    params.part ? { kind: 'part', name: params.part } : params.top ? { kind: 'top', name: params.top } : null)
  const q = useTrip(tagId)
  const cats = useCategories()
  const tree = useMemo(() => catTree(cats.data ?? []), [cats.data])
  const d = q.data
  const shown = (d?.rows ?? []).filter(r => !only
    || (only.kind === 'top' ? (tree.root(r.category_id)?.name ?? 'Uncategorised') === only.name : partOf(tree, r.category_id) === only.name))
  const shownTotal = shown.reduce((s, r) => s + Number(r.amount), 0)

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 80 }}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={C.text2} />}>
      <Stack.Screen options={{ title: d?.tag.name ?? 'Trip' }} />

      {q.isLoading && <Text style={{ color: C.text2, textAlign: 'center' }}>Loading…</Text>}
      {q.error && <Text style={{ color: C.negative, textAlign: 'center' }}>{(q.error as Error).message}</Text>}
      {d === null && <Text style={{ color: C.text2, textAlign: 'center' }}>This tag does not exist.</Text>}

      {d && (
        <>
          <View style={{ alignItems: 'center', gap: 6 }}>
            <Text style={{ color: C.text2, textAlign: 'center' }}>{d.tag.name}</Text>
            <Text style={{ color: C.text, fontSize: 40, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{inr(d.total)}</Text>
            <Text style={{ color: C.text2 }}>
              {d.rows.length} payment{d.rows.length === 1 ? '' : 's'}{d.first && d.last ? ` · ${dayLabel(d.first)} to ${dayLabel(d.last)}` : ''}
            </Text>
          </View>

          {d.byTop.length > 0 && (
            <Card style={{ gap: 10 }}>
              <Label>Where it went</Label>
              {d.byTop.map(([name, v]) => {
                const on = only?.kind === 'top' && only.name === name
                return (
                  <Pressable key={name} onPress={() => setOnly(on ? null : { kind: 'top', name })}
                    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 2, paddingHorizontal: 6, marginHorizontal: -6, borderRadius: 12, backgroundColor: on ? C.raised : 'transparent', opacity: pressed ? 0.6 : 1 })}>
                    <CatIcon name={name} group={name} size={30} />
                    <Text style={{ color: C.text, flex: 1, fontWeight: '600' }} numberOfLines={1}>{name}</Text>
                    <AmountShare v={v} of={d.total} />
                    <Text style={{ color: C.text3, fontSize: 18 }}>{on ? '⌄' : '›'}</Text>
                  </Pressable>
                )
              })}
            </Card>
          )}

          <Card style={{ gap: 4 }}>
            <Label>{only ? `${only.name}, ${inr(shownTotal)}` : 'Every payment'}</Label>
            {only && (
              <Pressable onPress={() => setOnly(null)} accessibilityRole="button" accessibilityLabel={`Remove filter ${only.name}`}
                style={({ pressed }) => ({ flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 6, marginTop: 6, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: C.raised, opacity: pressed ? 0.6 : 1 })}>
                <Text style={{ color: C.text, fontWeight: '600', fontSize: 13 }}>Only {only.name}</Text>
                <Text style={{ color: C.text3, fontSize: 13, fontWeight: '700' }}>✕</Text>
              </Pressable>
            )}
            {d.rows.length === 0 && <Text style={{ color: C.text2, marginTop: 6 }}>Nothing tagged yet.</Text>}
            {shown.map(r => (
              <Pressable key={r.id} onPress={() => router.push(`/t/${r.id}`)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, opacity: pressed ? 0.6 : 1 })}>
                <CatIcon name={tree.name(r.category_id) ?? 'Uncategorised'} group={tree.root(r.category_id)?.name} size={30} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text, fontWeight: '600' }} numberOfLines={1}>{r.merchant ?? r.merchant_key ?? 'Unknown'}</Text>
                  <Text style={{ color: C.text2, fontSize: 12 }} numberOfLines={1}>{dayLabel(r.occurred_on)} · {r.bank ?? ''}{r.note ? ` · ${r.note}` : ''}</Text>
                </View>
                <Text style={{ color: C.text, fontVariant: ['tabular-nums'] }}>{inrExact(Number(r.amount))}</Text>
              </Pressable>
            ))}
          </Card>
        </>
      )}
    </ScrollView>
  )
}
