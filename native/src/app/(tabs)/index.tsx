import { useEffect, useMemo, useState } from 'react'
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { catTree } from '@lib/cats.ts'
import { countsAsSpend, countsAsIncome, invested } from '@lib/scope.ts'
import { PEOPLE, monthKeyOf, useCategories, useMonth, useReviewCount, type Txn, useAlarms } from '@/lib/data'
import { CatIcon } from '@/components/CatIcon'
import { Card, Label, Pills, inr, AmountShare } from '@/components/ui'
import { C, HUES } from '@/theme'
import { lookFor } from '@lib/caticons.ts'
import { widgetMonth } from '@/lib/widget'
import { openAll } from '@/lib/nav'
import { TxnRow } from '@/components/TxnRow'
import { collapseSplits } from '@lib/splits.ts'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const shift = (key: string, n: number) => { const [y, m] = key.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7) }
const dayLabel = (iso: string) => new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })

/** The Month screen: what went out, by group, and the latest payments. */
export default function Month() {
  const params = useLocalSearchParams<{ m?: string }>()
  const now = monthKeyOf()
  const key = params.m && /^\d{4}-\d{2}$/.test(params.m) ? params.m : now
  const [who, setWho] = useState<string | null>(null)
  const month = useMonth(key)
  const cats = useCategories()
  const review = useReviewCount()
  const alarms = useAlarms()
  const tree = useMemo(() => catTree(cats.data ?? []), [cats.data])

  const rows = useMemo(() => (month.data ?? []).filter(t => !who || t.paid_by === who), [month.data, who])
  const spend = rows.filter(countsAsSpend)
  const total = spend.reduce((s, t) => s + Number(t.amount), 0)
  const cameIn = rows.filter(countsAsIncome).reduce((s, t) => s + Number(t.amount), 0)
  // Money moved into investments this month, net. Never spending; shown only
  // when there is some, and it opens the Investments screen.
  const investedNet = invested(rows)
  const byTop = new Map<string, number>()
  for (const t of spend) { const n = tree.root(t.category_id)?.name ?? 'Uncategorised'; byTop.set(n, (byTop.get(n) ?? 0) + Number(t.amount)) }
  const groups = [...byTop.entries()].sort((a, b) => b[1] - a[1])
  // Who paid, seeded from the household so someone who logged nothing still
  // shows (the website's "Who paid" card). Each name opens their page.
  const byPerson: Record<string, { name: string; total: number }> = {}
  for (const [pid, name] of Object.entries(PEOPLE)) byPerson[pid] = { name, total: 0 }
  for (const t of spend) { const e = byPerson[t.paid_by] ?? { name: t.paid?.name ?? 'Unknown', total: 0 }; e.total += Number(t.amount); byPerson[t.paid_by] = e }
  const people = Object.entries(byPerson).sort((a, b) => b[1].total - a[1].total)
  // The home-screen widget shows today and this month, from the same rows.
  useEffect(() => { if (key === now && month.data) widgetMonth(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }), month.data) }, [key, now, month.data])
  const lastMonth = shift(key, -1)
  const [y, m] = key.split('-').map(Number)

  // A split payment shows once, at what the bank took; the totals above add up the parts.
  const recent = collapseSplits(rows).slice(0, 60)
  const header = (
    <View style={{ gap: 14, paddingBottom: 8 }}>
      <Text style={{ color: C.text, fontSize: 34, fontWeight: '800' }}>Household</Text>
      {/* Something failing silently (a phone gone quiet, a bank text nobody
          could read), raised by the website's alarm job. Shown until it clears. */}
      {(alarms.data ?? []).map(a => (
        <Pressable key={a.id} onPress={() => {
          if (a.kind === 'quiet' || a.kind === 'reader_off') router.push('/phone-readers' as never)
          // A gap: add what PhonePe shows for those days, then say Done.
          else if (a.kind === 'gap') router.push({ pathname: '/import-history', params: { gap: String(a.id), who: a.person_id ?? '' } } as never)
        }}
          style={{ backgroundColor: C.negative, borderRadius: 14, padding: 14, gap: 4 }}>
          <Text style={{ color: '#fff', fontWeight: '800' }}>Needs a look</Text>
          <Text style={{ color: '#fff', fontSize: 14, lineHeight: 20 }}>{a.message}</Text>
        </Pressable>
      ))}
      <Pills options={[[null, 'Household'], ...Object.entries(PEOPLE).sort((a, b) => a[1].localeCompare(b[1]))] as [string | null, string][]} value={who} onChange={setWho} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable onPress={() => router.setParams({ m: shift(key, -1) })} hitSlop={12} style={{ padding: 10, backgroundColor: C.card, borderRadius: 12 }}><Text style={{ color: C.text, fontSize: 18 }}>‹</Text></Pressable>
        <Pressable hitSlop={8} onPress={() => router.push({ pathname: '/month', params: { m: key } })}>
          <Text style={{ color: C.text, fontSize: 18, fontWeight: '700' }}>{MONTHS[m - 1]} {y} ▾</Text>
        </Pressable>
        <Pressable disabled={key >= now} onPress={() => router.setParams({ m: shift(key, 1) })} hitSlop={12} style={{ padding: 10, backgroundColor: C.card, borderRadius: 12, opacity: key >= now ? 0.3 : 1 }}><Text style={{ color: C.text, fontSize: 18 }}>›</Text></Pressable>
      </View>
      <Pressable onPress={() => openAll({ m: key, who, dir: 'debit' })} style={({ pressed }) => ({ alignItems: 'center', paddingVertical: 8, opacity: pressed ? 0.6 : 1 })}>
        <Text style={{ color: C.text, fontSize: 48, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{inr(total)}</Text>
        <Text style={{ color: C.text2 }}>spent{month.isFetching ? ' · updating' : ''} ›</Text>
      </Pressable>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Pressable onPress={() => openAll({ m: key, who, dir: 'credit' })} style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.6 : 1 })}>
          <Card><Label>Came in</Label><Text style={{ color: C.positive, fontSize: 20, fontWeight: '700', marginTop: 4 }}>{inr(cameIn)}</Text></Card>
        </Pressable>
        <Pressable onPress={() => router.navigate('/review')} style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.6 : 1 })}>
          <Card><Label>Review</Label><Text style={{ color: C.text, fontSize: 20, fontWeight: '700', marginTop: 4 }}>{review.data ?? 0} waiting</Text></Card>
        </Pressable>
      </View>
      {investedNet !== 0 && (
        <Pressable onPress={() => router.push('/investments' as never)} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <CatIcon name="Investments" size={30} />
            <View style={{ flex: 1 }}>
              <Label>Invested</Label>
              <Text style={{ color: C.text2, fontSize: 12, marginTop: 2 }}>Not counted as spending</Text>
            </View>
            <Text style={{ color: C.text, fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{investedNet < 0 ? '−' : ''}{inr(investedNet)}</Text>
            <Text style={{ color: C.text3, fontSize: 18 }}>›</Text>
          </Card>
        </Pressable>
      )}
      {groups.length > 0 && (
        <Card style={{ gap: 10 }}>
          <Label>Where it went</Label>
          {groups.slice(0, 8).map(([name, v]) => {
            const hue = lookFor(name).hue
            const cid = tree.roots().find(c => c.name === name)?.id
            return (
              <Pressable key={name}
                onPress={() => cid
                  ? router.push({ pathname: '/c/[id]', params: { id: String(cid), m: key, who: who ?? '' } })
                  : openAll({ m: key, who, dir: 'debit', cat: 'none' })}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, opacity: pressed ? 0.6 : 1 })}>
                <CatIcon name={name} size={30} />
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ color: C.text, fontWeight: '600' }}>{name}</Text>
                    <AmountShare v={v} of={total} />
                  </View>
                  <View style={{ height: 4, borderRadius: 2, backgroundColor: C.raised }}>
                    <View style={{ height: 4, borderRadius: 2, width: `${(v / (total || 1)) * 100}%`, backgroundColor: hue ? HUES[hue] : C.text2 }} />
                  </View>
                </View>
                <Text style={{ color: C.text3, fontSize: 18 }}>›</Text>
              </Pressable>
            )
          })}
        </Card>
      )}
      {!who && people.length > 1 && total > 0 && (
        <Card style={{ gap: 10 }}>
          <Label>Who paid</Label>
          <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: C.raised }}>
            {people.map(([pid, e], i) => <View key={pid} style={{ width: `${(e.total / total) * 100}%`, backgroundColor: i === 0 ? HUES[1] : HUES[7] }} />)}
          </View>
          {people.map(([pid, e], i) => (
            <Pressable key={pid} disabled={!PEOPLE[pid]} onPress={() => router.push({ pathname: '/p/[id]', params: { id: pid, m: key } })}
              style={({ pressed }) => ({ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', opacity: pressed ? 0.6 : 1 })}>
              <Text style={{ color: i === 0 ? HUES[1] : HUES[7], fontWeight: '600' }}>{e.name}{PEOPLE[pid] ? ' ›' : ''}</Text>
              <AmountShare v={e.total} of={total} bold />
            </Pressable>
          ))}
        </Card>
      )}
      <Pressable onPress={() => router.push({ pathname: '/summary/[month]', params: { month: lastMonth } })} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
        <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Label>{MONTHS[Number(lastMonth.slice(5, 7)) - 1]} {lastMonth.slice(0, 4)}</Label>
            <Text style={{ color: C.text, fontSize: 16, fontWeight: '700', marginTop: 4 }}>Read the month summary</Text>
          </View>
          <Text style={{ color: C.text2, fontSize: 20 }}>›</Text>
        </Card>
      </Pressable>
      <Label>Payments</Label>
    </View>
  )

  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: C.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
      data={recent}
      keyExtractor={t => t.id}
      ListHeaderComponent={header}
      refreshControl={<RefreshControl refreshing={month.isRefetching} onRefresh={() => { month.refetch(); alarms.refetch() }} tintColor={C.text2} />}
      ListEmptyComponent={month.isLoading ? <Text style={{ color: C.text2 }}>Loading</Text> : <Text style={{ color: C.text2 }}>Nothing logged in {MONTHS[m - 1]}.</Text>}
      renderItem={({ item: t, index }) => {
        const newDay = index === 0 || recent[index - 1].occurred_on !== t.occurred_on
        return (
          <View>
            {newDay && <Text style={{ color: C.text2, fontWeight: '600', marginTop: 14, marginBottom: 6 }}>{dayLabel(t.occurred_on)}</Text>}
            <TxnRow t={t} tree={tree} />
          </View>
        )
      }}
    />
  )
}
