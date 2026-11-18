import { useMemo } from 'react'
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import { router, useLocalSearchParams, Stack } from 'expo-router'
import { catTree } from '@lib/cats.ts'
import { countsAsSpend } from '@lib/scope.ts'
import { dayLabel, monthKey, monthRange } from '@lib/format.ts'
import { lookFor } from '@lib/caticons.ts'
import { useCategories } from '@/lib/data'
import { usePerson } from '@/lib/summary-data'
import { CatIcon } from '@/components/CatIcon'
import { Card, Label, inr, AmountShare } from '@/components/ui'
import { C, HUES } from '@/theme'
import { openAll } from '@/lib/nav'

/** One person's spending for a month. The phone's copy of app/p/[id]/page.tsx. */
export default function Person() {
  const params = useLocalSearchParams<{ id: string; m?: string }>()
  const id = params.id
  const month = monthRange(params.m)
  const atEnd = month.isCurrent || month.key >= monthKey()
  const q = usePerson(id, month.key)
  const cats = useCategories()
  const tree = useMemo(() => catTree(cats.data ?? []), [cats.data])
  const topOf = (cid: number | null) => tree.root(cid)?.name ?? 'Uncategorised'

  const person = q.data?.person
  const rows = q.data?.rows ?? []
  const spend = rows.filter(r => countsAsSpend(r))
  const total = spend.reduce((s, r) => s + Number(r.amount), 0)
  const claimable = rows.filter(r => r.scope === 'claimable').reduce((s, r) => s + Number(r.amount), 0)
  const cameIn = rows.filter(r => r.direction === 'credit').reduce((s, r) => s + Number(r.amount), 0)

  // Name back to id, so a row can link to its own category.
  const topIdByName: Record<string, number> = {}
  for (const c of tree.roots()) topIdByName[c.name] = c.id

  const byCat: Record<string, number> = {}
  for (const r of spend) byCat[topOf(r.category_id)] = (byCat[topOf(r.category_id)] ?? 0) + Number(r.amount)
  const cats2 = Object.entries(byCat).sort((a, b) => b[1] - a[1])
  const biggest = cats2[0]?.[1] || 1
  const catsTotal = cats2.reduce((s, [, x]) => s + x, 0)

  const go = (key: string) => router.setParams({ m: key })

  if (q.data && !person) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, padding: 16 }}>
        <Text style={{ color: C.text2 }}>No one with that id.</Text>
      </View>
    )
  }

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 80 }}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={C.text2} />}>
      <Stack.Screen options={{ title: person?.name ?? 'Person' }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable onPress={() => go(month.prev)} hitSlop={12} style={{ padding: 10, backgroundColor: C.card, borderRadius: 12 }}><Text style={{ color: C.text, fontSize: 18 }}>‹</Text></Pressable>
        <Text style={{ color: C.text, fontSize: 18, fontWeight: '700' }}>{person?.name ?? ''} · {month.label}</Text>
        <Pressable disabled={atEnd} onPress={() => go(month.next)} hitSlop={12} style={{ padding: 10, backgroundColor: C.card, borderRadius: 12, opacity: atEnd ? 0.3 : 1 }}><Text style={{ color: C.text, fontSize: 18 }}>›</Text></Pressable>
      </View>

      <Pressable onPress={() => openAll({ m: month.key, who: id, dir: 'debit' })} style={({ pressed }) => ({ alignItems: 'center', gap: 4, paddingVertical: 8, opacity: pressed ? 0.6 : 1 })}>
        <Text style={{ color: C.text, fontSize: 44, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{inr(total)}</Text>
        <Text style={{ color: C.text2, textAlign: 'center' }}>
          {q.isLoading ? 'Loading' : <>
            {spend.length} transaction{spend.length === 1 ? '' : 's'} paid
            {claimable > 0 && `, plus ${inr(claimable)} claimable`}
            {cameIn > 0 && `, and ${inr(cameIn)} in`}
          </>} ›
        </Text>
      </Pressable>

      <Card style={{ gap: 10 }}>
        <Label>What they paid for</Label>
        {cats2.map(([name, v]) => {
          const cid = topIdByName[name]
          const hue = lookFor(name).hue
          return (
            <Pressable key={name} onPress={() => cid ? router.push({ pathname: '/c/[id]', params: { id: String(cid), m: month.key, who: id } }) : openAll({ m: month.key, who: id, dir: 'debit', cat: 'none' })}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, opacity: pressed ? 0.6 : 1 })}>
              <CatIcon name={name} size={30} />
              <View style={{ flex: 1, gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <Text style={{ color: C.text, fontWeight: '600', flex: 1 }} numberOfLines={1}>{name}</Text>
                  <AmountShare v={v} of={catsTotal} />
                </View>
                <View style={{ height: 4, borderRadius: 2, backgroundColor: C.raised }}>
                  <View style={{ height: 4, borderRadius: 2, width: `${(v / biggest) * 100}%`, backgroundColor: hue ? HUES[hue] : C.text2 }} />
                </View>
              </View>
              <Text style={{ color: C.text3, fontSize: 18 }}>›</Text>
            </Pressable>
          )
        })}
        {cats2.length === 0 && !q.isLoading && <Text style={{ color: C.text2 }}>Nothing in {month.label}.</Text>}
      </Card>

      {rows.length > 0 && (
        <Card style={{ gap: 4 }}>
          <Label>Every one</Label>
          {rows.map(r => {
            const credit = r.direction === 'credit'
            // Transfers between the two of them are greyed, never spending.
            const transfer = r.scope === 'transfer'
            return (
              <Pressable key={r.id} onPress={() => router.push(`/t/${r.id}`)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, opacity: pressed ? 0.6 : 1 })}>
                <CatIcon name={transfer ? 'Transfer' : tree.name(r.category_id) ?? 'Uncategorised'} group={tree.root(r.category_id)?.name} size={30} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text, fontWeight: '600' }} numberOfLines={1}>{r.merchant ?? r.merchant_key ?? 'Unknown'}</Text>
                  <Text style={{ color: C.text2, fontSize: 12 }} numberOfLines={1}>
                    {dayLabel(r.occurred_on)} · {transfer ? 'Transfer, not spending' : topOf(r.category_id)}
                    {r.scope === 'claimable' && <Text style={{ color: C.positive }}>  claimable</Text>}
                  </Text>
                </View>
                <Text style={{ color: transfer ? C.text3 : credit ? C.positive : C.text, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
                  {transfer ? '⇄ ' : credit ? '+' : ''}{inr(Number(r.amount))}
                </Text>
              </Pressable>
            )
          })}
        </Card>
      )}
    </ScrollView>
  )
}
