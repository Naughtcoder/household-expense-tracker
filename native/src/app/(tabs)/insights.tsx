import { useEffect, useMemo, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, Switch, Text, View } from 'react-native'
import { router } from 'expo-router'
import { catTree } from '@lib/cats.ts'
import { countsAsIncome, countsAsSpend } from '@lib/scope.ts'
import { lookFor } from '@lib/caticons.ts'
import { PEOPLE, periodOf, useCategories, useInsights, useMonthTotals, useTax, useYearOnYear, type Period } from '@/lib/data'
import { fyOf, fyLabel } from '@lib/tax.ts'
import { Bars, type Bar } from '@/components/Bars'
import { CatIcon } from '@/components/CatIcon'
import { Card, Label, Pills, inr } from '@/components/ui'
import { C, HUES } from '@/theme'
import { setPicked, usePicked } from '@/lib/choice'
import { openAll } from '@/lib/nav'

const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const ymd = (d: Date) => `${ym(d)}-${String(d.getDate()).padStart(2, '0')}`

/** Week, month or year: what came in, what went out, where, and who paid. */
export default function Insights() {
  const [p, setP] = useState<Period>('month')
  const [at, setAt] = useState(new Date())
  const [who, setWho] = useState<string | null>(null)
  const [show, setShow] = useState<'out' | 'in'>('out')
  const [tripsAsTravel, setTrips] = useState(true)
  const per = periodOf(p, at)
  const picked = usePicked()
  useEffect(() => { if (picked) { setAt(new Date((picked.length === 4 ? picked + '-01' : picked) + '-01T00:00:00')); setPicked(null) } }, [picked])
  const q = useInsights(p, at)
  const tax = useTax()
  const yoy = useYearOnYear()
  const cats = useCategories()
  const tree = useMemo(() => catTree(cats.data ?? []), [cats.data])
  const year = per.from.getFullYear()
  const totals = useMonthTotals(year - 2, year, who, show === 'in')
  const today = new Date()
  const isCurrent = per.to >= today

  const rows = (q.data?.rows ?? []).filter(r => !who || r.paid_by === who)
  const out = rows.filter(countsAsSpend), inn = rows.filter(countsAsIncome)
  const outTotal = out.reduce((s, r) => s + Number(r.amount), 0)
  const inTotal = inn.reduce((s, r) => s + Number(r.amount), 0)
  const side = show === 'in' ? inn : out
  const sideTotal = show === 'in' ? inTotal : outTotal
  const trips = q.data?.trips ?? {}
  const tripTotal = show === 'out' ? side.filter(r => trips[r.id]).reduce((s, r) => s + Number(r.amount), 0) : 0

  const byCat = new Map<string, number>()
  for (const r of side) {
    const n = show === 'out' && tripsAsTravel && trips[r.id] ? 'Travel' : tree.root(r.category_id)?.name ?? 'Uncategorised'
    byCat.set(n, (byCat.get(n) ?? 0) + Number(r.amount))
  }
  const catList = [...byCat.entries()].sort((a, b) => b[1] - a[1])
  // By person id, so each row can open that person's payments.
  const people = new Map<string, number>()
  for (const r of out) people.set(r.paid_by, (people.get(r.paid_by) ?? 0) + Number(r.amount))

  // Bars: three years of months in the year view (scrolls), else the days.
  let bars: Bar[] = []
  if (p === 'year') {
    const t = new Map((totals.data ?? []).map(r => [r.month, Number(r.total)]))
    for (let m = 0; m < 36; m++) {
      const d = new Date(year - 2, m, 1)
      bars.push({ key: ym(d), label: d.getMonth() === 0 ? `’${String(d.getFullYear()).slice(2)}` : 'JFMAMJJASOND'[d.getMonth()], value: t.get(ym(d)) ?? 0, dim: d.getFullYear() !== year, future: d > today })
    }
  } else {
    const byDay = new Map<string, number>()
    for (const r of side) byDay.set(r.occurred_on.slice(0, 10), (byDay.get(r.occurred_on.slice(0, 10)) ?? 0) + Number(r.amount))
    for (let d = new Date(per.from); d <= per.to; d.setDate(d.getDate() + 1)) {
      bars.push({ key: ymd(d), label: p === 'week' ? 'MTWTFSS'[(d.getDay() + 6) % 7] : d.getDate() === 1 || d.getDate() % 5 === 0 ? String(d.getDate()) : '', value: byDay.get(ymd(d)) ?? 0, future: d > today })
    }
  }
  const net = inTotal - outTotal
  const catId = (name: string) => tree.roots().find(c => c.name === name)?.id
  // The period as /all reads it: a month, or a span of days for a week or year.
  const span = p === 'month' ? { m: ym(per.from) } : { from: ymd(per.from), to: ymd(per.to) }
  const dirOf = show === 'in' ? 'credit' as const : 'debit' as const
  const openCat = (name: string) => {
    const id = catId(name)
    // Spending in a month or year opens the category page; a week, money in,
    // or a group with no category opens the list narrowed to it.
    if (id && show === 'out' && p !== 'week')
      router.push({ pathname: '/c/[id]', params: { id: String(id), m: p === 'year' ? '' : ym(per.from), y: p === 'year' ? String(year) : '', who: who ?? '' } })
    else openAll({ ...span, who, dir: dirOf, cat: id ?? 'none' })
  }
  const lastWhole = (() => { const d = new Date(); return ym(new Date(d.getFullYear(), d.getMonth() - 1, 1)) })()

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 120 }}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); totals.refetch() }} tintColor={C.text2} />}>
      <Text style={{ color: C.text, fontSize: 34, fontWeight: '800' }}>Insights</Text>
      <Pills options={[['week', 'Week'], ['month', 'Month'], ['year', 'Year']]} value={p} onChange={v => { setP(v); setAt(new Date()) }} />
      <Pills options={[[null, 'Household'], ...Object.entries(PEOPLE).sort((a, b) => a[1].localeCompare(b[1]))] as [string | null, string][]} value={who} onChange={setWho} />

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable onPress={() => setAt(per.prev)} hitSlop={12} style={{ padding: 10, backgroundColor: C.card, borderRadius: 12 }}><Text style={{ color: C.text, fontSize: 18 }}>‹</Text></Pressable>
        <Pressable disabled={p === 'week'} onPress={() => router.push({ pathname: '/month', params: { m: ym(per.from), mode: p === 'year' ? 'year' : 'pick' } })}>
          <Text style={{ color: C.text, fontSize: 18, fontWeight: '700' }}>{per.label}{p === 'week' ? '' : ' ▾'}</Text>
        </Pressable>
        <Pressable disabled={isCurrent} onPress={() => setAt(per.next)} hitSlop={12} style={{ padding: 10, backgroundColor: C.card, borderRadius: 12, opacity: isCurrent ? 0.3 : 1 }}><Text style={{ color: C.text, fontSize: 18 }}>›</Text></Pressable>
      </View>

      <Pressable onPress={() => openAll({ ...span, who })} style={({ pressed }) => ({ alignItems: 'center', opacity: pressed ? 0.6 : 1 })}>
        <Text style={{ color: net >= 0 ? C.positive : C.text, fontSize: 44, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{net >= 0 ? '+' : '−'}{inr(net)}</Text>
        <Text style={{ color: C.text2 }}>{net >= 0 ? 'saved' : 'more out than in'}{q.isFetching ? ' · updating' : ''} ›</Text>
      </Pressable>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        {([['in', 'Money in', inTotal, C.positive], ['out', 'Money out', outTotal, C.text]] as const).map(([k, label, v, col]) => (
          // The first tap shows that side below; a tap on the side already
          // shown opens its payments.
          <Pressable key={k} onPress={() => show === k ? openAll({ ...span, who, dir: k === 'in' ? 'credit' : 'debit' }) : setShow(k)}
            style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.6 : 1 })}>
            <Card style={{ borderWidth: 2, borderColor: show === k ? C.accent : 'transparent' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Label>{label}</Label>
                {show === k && <Text style={{ color: C.text3, fontSize: 16, lineHeight: 16 }}>›</Text>}
              </View>
              <Text style={{ color: col, fontSize: 20, fontWeight: '700', marginTop: 4 }}>{inr(v)}</Text>
            </Card>
          </Pressable>
        ))}
      </View>

      {(() => {
        // Tax runs April to March, so this shows the financial year the
        // period falls in, whatever the week, month or year picked.
        const fy = fyOf(ymd(per.from))
        const v = (tax.data?.rows ?? []).filter(r => fyOf(r.occurred_on) === fy && (!who || r.paid_by === who)).reduce((a, r) => a + Number(r.amount), 0)
        return (
          <Pressable onPress={() => router.push('/tax' as never)} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
              <CatIcon name="Tax" size={30} />
              <View style={{ flex: 1 }}>
                <Label>Tax paid</Label>
                <Text style={{ color: C.text2, fontSize: 12, marginTop: 2 }}>{fyLabel(fy)}</Text>
              </View>
              <Text style={{ color: C.text, fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{inr(v)}</Text>
              <Text style={{ color: C.text3, fontSize: 18 }}>›</Text>
            </Card>
          </Pressable>
        )
      })()}

      {show === 'out' && tripTotal > 0 && (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.text, fontWeight: '700' }}>Count trips as Travel</Text>
            <Text style={{ color: C.text2, fontSize: 12, marginTop: 2 }}>
              {tripsAsTravel ? `On: the ${inr(tripTotal)} spent on trips (meals, cabs, medicines) shows under Travel.` : `Off: the ${inr(tripTotal)} spent on trips stays in Food, Transportation, Health and so on.`}
            </Text>
          </View>
          <Switch value={tripsAsTravel} onValueChange={setTrips} />
        </Card>
      )}

      <Card>
        <Bars bars={bars} color={show === 'in' ? C.positive : C.accent} barWidth={p === 'year' ? 24 : undefined}
          onPress={p === 'year' ? b => { setP('month'); setAt(new Date(b.key + '-01T00:00:00')) } : b => openAll({ d: b.key, who, dir: dirOf })} />
      </Card>

      {catList.length > 0 && (
        <Card style={{ gap: 10 }}>
          <Label>{show === 'in' ? 'Where it came from' : 'Where it went'}</Label>
          {catList.slice(0, 12).map(([name, v]) => {
            const hue = lookFor(name).hue
            return (
              <Pressable key={name} onPress={() => openCat(name)}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, opacity: pressed ? 0.6 : 1 })}>
                <CatIcon name={name} size={30} />
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ color: C.text, fontWeight: '600' }}>{name}</Text>
                    <Text style={{ color: C.text, fontVariant: ['tabular-nums'] }}>{inr(v)} <Text style={{ color: C.text3 }}>{Math.round((v / (sideTotal || 1)) * 100)}%</Text></Text>
                  </View>
                  <View style={{ height: 4, borderRadius: 2, backgroundColor: C.raised }}>
                    <View style={{ height: 4, borderRadius: 2, width: `${(v / (sideTotal || 1)) * 100}%`, backgroundColor: hue ? HUES[hue] : C.text2 }} />
                  </View>
                </View>
                <Text style={{ color: C.text3, fontSize: 18 }}>›</Text>
              </Pressable>
            )
          })}
        </Card>
      )}

      {!who && yoy.data && (
        <Card style={{ gap: 8 }}>
          <Label>Year on year, money out</Label>
          <Text style={{ color: C.text2, fontSize: 12 }}>The last twelve whole months against the twelve before.</Text>
          {Object.entries(yoy.data.now12).map(([k, v]) => [Number(k), v] as const).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, v]) => {
            const before = yoy.data!.prev12[id] ?? 0
            const pct = before > 0 ? Math.round(((v - before) / before) * 100) : null
            return (
              // The category page shows two years of months, the same span compared here.
              <Pressable key={id} onPress={() => router.push({ pathname: '/c/[id]', params: { id: String(id), m: lastWhole, who: '' } })}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, opacity: pressed ? 0.6 : 1 })}>
                <CatIcon name={tree.name(id)} size={26} />
                <Text style={{ color: C.text, flex: 1, fontWeight: '600' }}>{tree.name(id)}</Text>
                <Text style={{ color: C.text, fontVariant: ['tabular-nums'] }}>{inr(v)}</Text>
                <Text style={{ color: pct == null ? C.text3 : pct > 0 ? C.negative : C.positive, width: 52, textAlign: 'right', fontSize: 12 }}>{pct == null ? 'new' : `${pct > 0 ? '+' : ''}${pct}%`}</Text>
                <Text style={{ color: C.text3, fontSize: 18 }}>›</Text>
              </Pressable>
            )
          })}
        </Card>
      )}

      {!who && people.size > 1 && (
        <Card style={{ gap: 8 }}>
          <Label>Who paid</Label>
          {[...people.entries()].sort((a, b) => b[1] - a[1]).map(([pid, v]) => (
            <Pressable key={pid}
              onPress={() => p === 'month' && PEOPLE[pid] ? router.push({ pathname: '/p/[id]', params: { id: pid, m: ym(per.from) } }) : openAll({ ...span, who: pid, dir: 'debit' })}
              style={({ pressed }) => ({ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', opacity: pressed ? 0.6 : 1 })}>
              <Text style={{ color: C.text }}>{PEOPLE[pid] ?? '?'} ›</Text><Text style={{ color: C.text, fontVariant: ['tabular-nums'] }}>{inr(v)}</Text>
            </Pressable>
          ))}
        </Card>
      )}
    </ScrollView>
  )
}
