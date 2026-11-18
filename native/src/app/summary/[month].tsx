import { useMemo } from 'react'
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { catTree } from '@lib/cats.ts'
import { countsAsSpend } from '@lib/scope.ts'
import { dayLabel, inrShort, monthKey, monthRange } from '@lib/format.ts'
import { lookFor } from '@lib/caticons.ts'
import { useCategories } from '@/lib/data'
import { useSummary } from '@/lib/summary-data'
import { CatIcon } from '@/components/CatIcon'
import { Card, Label, inr, AmountShare } from '@/components/ui'
import { C, HUES } from '@/theme'
import { openAll } from '@/lib/nav'

/** A month in summary: the total, what moved, the five largest, and how
 *  complete it is. The phone's copy of app/summary/[month]/page.tsx. */
export default function Summary() {
  const params = useLocalSearchParams<{ month: string }>()
  const m = monthRange(params.month)
  const prev = monthRange(m.prev)
  const atEnd = m.isCurrent || m.key >= monthKey()
  const q = useSummary(m.key)
  const cats = useCategories()
  const tree = useMemo(() => catTree(cats.data ?? []), [cats.data])
  const topOf = (id: number | null) => tree.root(id)?.name ?? 'Uncategorised'
  const topIdByName: Record<string, number> = {}
  for (const c of tree.roots()) topIdByName[c.name] = c.id

  const rows = q.data?.rows ?? []
  const takeHome = q.data?.takeHome ?? 0

  const spend = rows.filter(r => countsAsSpend(r))
  const total = spend.reduce((s, r) => s + Number(r.amount), 0)
  const claimable = rows.filter(r => r.scope === 'claimable').reduce((s, r) => s + Number(r.amount), 0)
  const credits = rows.filter(r => r.direction === 'credit').reduce((s, r) => s + Number(r.amount), 0)
  const stillWaiting = rows.filter(r => r.status === 'review').length

  const lastSpend = (q.data?.before ?? []).filter(r => countsAsSpend(r))
  const lastTotal = lastSpend.reduce((s, r) => s + Number(r.amount), 0)
  const diff = total - lastTotal

  const bucket = (list: { category_id: number | null; amount: number }[]) => {
    const out: Record<string, number> = {}
    for (const r of list) out[topOf(r.category_id)] = (out[topOf(r.category_id)] ?? 0) + Number(r.amount)
    return out
  }
  const nowBy = bucket(spend), thenBy = bucket(lastSpend)
  const categories = Object.entries(nowBy).sort((a, b) => b[1] - a[1])

  const biggest = [...spend].sort((a, b) => Number(b.amount) - Number(a.amount)).slice(0, 5)
  const saved = takeHome ? takeHome - total : 0
  const rate = takeHome ? (saved / takeHome) * 100 : 0

  const movers = categories
    .map(([name, v]) => ({ name, v, was: thenBy[name] ?? 0 }))
    .filter(c => c.was > 0 && Math.abs(c.v - c.was) > 500)
    .sort((a, b) => Math.abs(b.v - b.was) - Math.abs(a.v - a.was))
    .slice(0, 3)

  const hueOf = (name: string) => { const h = lookFor(name).hue; return h ? HUES[h] : C.text2 }
  const go = (key: string) => router.setParams({ month: key })

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 80 }}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={C.text2} />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable onPress={() => go(m.prev)} hitSlop={12} style={{ padding: 10, backgroundColor: C.card, borderRadius: 12 }}><Text style={{ color: C.text, fontSize: 18 }}>‹</Text></Pressable>
        <Text style={{ color: C.text, fontSize: 18, fontWeight: '700' }}>{m.label}</Text>
        <Pressable disabled={atEnd} onPress={() => go(m.next)} hitSlop={12} style={{ padding: 10, backgroundColor: C.card, borderRadius: 12, opacity: atEnd ? 0.3 : 1 }}><Text style={{ color: C.text, fontSize: 18 }}>›</Text></Pressable>
      </View>

      <Card style={{ gap: 6 }}>
        <Pressable onPress={() => openAll({ m: m.key, dir: 'debit' })} style={({ pressed }) => ({ gap: 6, opacity: pressed ? 0.6 : 1 })}>
          <Label>Household spend</Label>
          <Text style={{ color: C.text, fontSize: 40, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{inr(total)}</Text>
          <Text style={{ color: C.text2 }}>
            {q.isLoading ? 'Loading' : <>
              {spend.length} transaction{spend.length === 1 ? '' : 's'}
              {lastTotal > 0 && `, ${diff >= 0 ? 'up' : 'down'} ${inr(Math.abs(diff))} on ${prev.label.split(' ')[0]}`}
            </>} ›
          </Text>
        </Pressable>
        {total > 0 && (
          <>
            <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: C.raised, marginTop: 6 }}>
              {categories.map(([name, v]) => <View key={name} style={{ width: `${(v / total) * 100}%`, backgroundColor: hueOf(name) }} />)}
            </View>
            <View style={{ gap: 10, marginTop: 8 }}>
              {categories.slice(0, 5).map(([name, v]) => {
                const cid = topIdByName[name]
                return (
                  <Pressable key={name} onPress={() => cid ? router.push({ pathname: '/c/[id]', params: { id: String(cid), m: m.key, who: '' } }) : openAll({ m: m.key, dir: 'debit', cat: 'none' })}
                    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, opacity: pressed ? 0.6 : 1 })}>
                    <CatIcon name={name} size={30} />
                    <Text style={{ color: C.text, flex: 1, fontWeight: '600' }} numberOfLines={1}>{name}</Text>
                    <AmountShare v={v} of={total} />
                    <Text style={{ color: C.text3, fontSize: 18 }}>›</Text>
                  </Pressable>
                )
              })}
            </View>
          </>
        )}
      </Card>

      {takeHome > 0 && (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {/* Take-home is a setting, so its tile opens what actually came in. */}
          <Pressable onPress={() => openAll({ m: m.key, dir: 'credit' })} style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.6 : 1 })}>
            <Card style={{ flex: 1 }}>
              <Label>Take-home</Label>
              <Text style={{ color: C.text, fontSize: 18, fontWeight: '700', marginTop: 4, fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>{inrShort(takeHome)}</Text>
            </Card>
          </Pressable>
          <Pressable onPress={() => openAll({ m: m.key })} style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.6 : 1 })}>
            <Card style={{ flex: 1 }}>
              <Label>Kept</Label>
              <Text style={{ color: saved > 0 ? C.positive : C.caution, fontSize: 18, fontWeight: '700', marginTop: 4, fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>{saved < 0 ? '−' : ''}{inrShort(saved)}</Text>
              <Text style={{ color: C.text2, fontSize: 12 }}>{rate.toFixed(0)}% of what came in</Text>
            </Card>
          </Pressable>
          <Pressable onPress={() => router.push({ pathname: '/claimable', params: { m: m.key } })} style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.6 : 1 })}>
            <Card style={{ flex: 1 }}>
              <Label>Claimable</Label>
              <Text style={{ color: claimable ? C.positive : C.text, fontSize: 18, fontWeight: '700', marginTop: 4, fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>{inrShort(claimable)}</Text>
              <Text style={{ color: C.text2, fontSize: 12 }}>{claimable ? 'still to come back' : 'nothing outstanding'}</Text>
            </Card>
          </Pressable>
        </View>
      )}

      {movers.length > 0 && (
        <Card style={{ gap: 10 }}>
          <Label>What moved</Label>
          {movers.map(c => (
            <Pressable key={c.name}
              onPress={() => topIdByName[c.name] ? router.push({ pathname: '/c/[id]', params: { id: String(topIdByName[c.name]), m: m.key, who: '' } }) : openAll({ m: m.key, dir: 'debit', cat: 'none' })}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, opacity: pressed ? 0.6 : 1 })}>
              <CatIcon name={c.name} size={30} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontWeight: '600' }}>{c.name}</Text>
                <Text style={{ color: C.text2, fontSize: 12 }}>was {inr(c.was)} in {prev.label.split(' ')[0]}</Text>
              </View>
              <Text style={{ color: c.v > c.was ? C.caution : C.positive, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
                {c.v > c.was ? '+' : '−'}{inr(c.v - c.was)}
              </Text>
              <Text style={{ color: C.text3, fontSize: 18 }}>›</Text>
            </Pressable>
          ))}
        </Card>
      )}

      {biggest.length > 0 && (
        <Card style={{ gap: 4 }}>
          <Label>Largest five</Label>
          {biggest.map(r => (
            <Pressable key={r.id} onPress={() => router.push(`/t/${r.id}`)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, opacity: pressed ? 0.6 : 1 })}>
              <CatIcon name={tree.name(r.category_id) ?? 'Uncategorised'} group={tree.root(r.category_id)?.name} size={30} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontWeight: '600' }} numberOfLines={1}>{r.merchant ?? r.merchant_key ?? 'Unknown'}</Text>
                <Text style={{ color: C.text2, fontSize: 12 }}>{dayLabel(r.occurred_on)} · {topOf(r.category_id)}</Text>
              </View>
              <AmountShare v={Number(r.amount)} of={total} />
            </Pressable>
          ))}
        </Card>
      )}

      <Pressable disabled={!stillWaiting} onPress={() => router.navigate('/review')} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      <Card style={{ gap: 8 }}>
        <Label>How complete this is{stillWaiting > 0 ? ' ›' : ''}</Label>
        <Text style={{ color: C.text2, lineHeight: 20 }}>
          {stillWaiting > 0
            ? `${stillWaiting} transaction${stillWaiting === 1 ? '' : 's'} from this month still sitting in Review, so the total will move.`
            : 'Nothing from this month is waiting in Review.'}
          {credits > 0 && ` ${inr(credits)} came in and is counted separately from spending.`}
          {' '}This only covers what reached the app. Anything paid without a message, and never added by hand, is missing.
        </Text>
      </Card>
      </Pressable>
    </ScrollView>
  )
}
