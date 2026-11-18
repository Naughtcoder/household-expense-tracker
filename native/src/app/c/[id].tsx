import { useEffect, useMemo, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, Text, View, type TextStyle } from 'react-native'
import { router, useLocalSearchParams, Stack } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { catTree } from '@lib/cats.ts'
import { countsAsSpend } from '@lib/scope.ts'
import { lookFor } from '@lib/caticons.ts'
import { PEOPLE, useCategories, type Txn } from '@/lib/data'
import { supabase } from '@/lib/supabase'
import { Bars, type Bar } from '@/components/Bars'
import { CatIcon } from '@/components/CatIcon'
import { Card, Label, Pills, inr, AmountShare } from '@/components/ui'
import { C, HUES } from '@/theme'
import { setPicked, usePicked } from '@/lib/choice'
import { openAll } from '@/lib/nav'

const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const day = (iso: string) => new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })

/** One category: two years of months (scrolls), what is inside it, who was
 *  paid, and the payments, for a month or a whole year. */
export default function Category() {
  const params = useLocalSearchParams<{ id: string; m?: string; y?: string; who?: string }>()
  const id = Number(params.id)
  const now = ym(new Date())
  const [m, setM] = useState(params.m || (params.y ? '' : now))
  const [y, setY] = useState(params.y || '')
  const [who, setWho] = useState<string | null>(params.who || null)
  const cats = useCategories()
  const tree = useMemo(() => catTree(cats.data ?? []), [cats.data])
  const me = tree.get(id)
  const picked = usePicked()
  useEffect(() => { if (picked) { if (picked.length === 4) { setY(picked) } else { setY(''); setM(picked) } setPicked(null) } }, [picked])
  const family = useMemo(() => (me ? tree.family(id) : [id]), [tree, id, me])
  const rootName = tree.root(id)?.name ?? me?.name ?? ''

  const start = new Date(); start.setMonth(start.getMonth() - 23); start.setDate(1)
  const q = useQuery({
    queryKey: ['cat', id, family.length],
    enabled: !!cats.data,
    queryFn: async () => {
      const all: Txn[] = []
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from('transactions')
          .select('id, amount, direction, occurred_on, occurred_at, merchant, merchant_key, scope, status, category_id, paid_by, note')
          .in('category_id', family).gte('occurred_on', ym(start) + '-01').neq('status', 'duplicate').neq('status', 'ignored')
          .order('occurred_on', { ascending: false }).range(from, from + 999)
        if (error) throw error
        all.push(...((data ?? []) as unknown as Txn[]))
        if ((data ?? []).length < 1000) break
      }
      return all
    },
  })
  const rows = (q.data ?? []).filter(r => countsAsSpend(r) && (!who || r.paid_by === who))
  const inPeriod = rows.filter(r => (y ? r.occurred_on.startsWith(y) : r.occurred_on.startsWith(m)))
  const total = inPeriod.reduce((s, r) => s + Number(r.amount), 0)

  const byMonth = new Map<string, number>()
  for (const r of rows) byMonth.set(r.occurred_on.slice(0, 7), (byMonth.get(r.occurred_on.slice(0, 7)) ?? 0) + Number(r.amount))
  const bars: Bar[] = []
  for (let i = 0; i < 24; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1)
    const k = ym(d)
    bars.push({ key: k, label: d.getMonth() === 0 ? `’${String(d.getFullYear()).slice(2)}` : 'JFMAMJJASOND'[d.getMonth()], value: byMonth.get(k) ?? 0, dim: y ? !k.startsWith(y) : k !== m })
  }

  const byChild = new Map<number, number>()
  for (const r of inPeriod) { const k = tree.branchOf(id, r.category_id)?.id ?? id; byChild.set(k, (byChild.get(k) ?? 0) + Number(r.amount)) }
  const children = [...byChild.entries()].filter(([k]) => k !== id || byChild.size > 1).sort((a, b) => b[1] - a[1])
  // Grouped by payee key, so each row opens that payee's page. The name shown
  // is the first one written on its payments. Plain objects, not Maps.
  const byPayee: Record<string, { name: string; key: string | null; v: number }> = {}
  for (const r of inPeriod) {
    const name = (r.merchant ?? r.merchant_key ?? 'Unknown').trim()
    const k = r.merchant_key ?? `name:${name}`
    const e = byPayee[k] ?? { name, key: r.merchant_key, v: 0 }
    e.v += Number(r.amount)
    byPayee[k] = e
  }
  const payees = Object.values(byPayee).sort((a, b) => b.v - a.v).slice(0, 8)
  // Shares are of everything in the period, not of the rows shown.
  const childTotal = children.reduce((s, [, v]) => s + v, 0)
  const payeeTotal = Object.values(byPayee).reduce((s, e) => s + e.v, 0)
  const span = y ? { from: `${y}-01-01`, to: `${y}-12-31` } : { m }
  const hue = lookFor(rootName).hue ? HUES[lookFor(rootName).hue] : C.accent
  const label = y ? y : MONTHS[Number(m.slice(5, 7)) - 1] + ' ' + m.slice(0, 4)
  const shift = (n: number) => {
    if (y) { setY(String(Number(y) + n)); return }
    const d = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1); setM(ym(d))
  }
  const atEnd = y ? Number(y) >= new Date().getFullYear() : m >= now

  // The overview: the last twelve months split by who paid, whatever person
  // the page is set to. Each figure opens that month for that person.
  const people = Object.entries(PEOPLE).sort((a, b) => a[1].localeCompare(b[1]))
  const cell: Record<string, number> = {}
  for (const r of q.data ?? []) {
    if (!countsAsSpend(r)) continue
    const k = r.occurred_on.slice(0, 7)
    cell[`${k}|${r.paid_by}`] = (cell[`${k}|${r.paid_by}`] ?? 0) + Number(r.amount)
    cell[`${k}|all`] = (cell[`${k}|all`] ?? 0) + Number(r.amount)
  }
  const endKey = y ? (Number(y) >= new Date().getFullYear() ? now : `${y}-12`) : m
  const last12: string[] = []
  for (let i = 0; i < 12; i++) { const d = new Date(Number(endKey.slice(0, 4)), Number(endKey.slice(5, 7)) - 1 - i, 1); last12.push(ym(d)) }
  const sumOf = (w: string) => last12.reduce((s, k) => s + (cell[`${k}|${w}`] ?? 0), 0)
  const openMonth = (k: string, w: string | null) => { setY(''); setM(k); setWho(w) }

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 80 }}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={C.text2} />}>
      <Stack.Screen options={{ title: me?.name ?? 'Category' }} />
      <Text style={{ color: C.text2 }}>{tree.path(id).map(c => c.name).join(' › ')}</Text>
      <Pills options={[[null, 'Household'], ...Object.entries(PEOPLE).sort((a, b) => a[1].localeCompare(b[1]))] as [string | null, string][]} value={who} onChange={setWho} />
      <Pills options={[['month', 'Month'], ['year', 'Year']]} value={y ? 'year' : 'month'} onChange={v => { if (v === 'year') { setY((m || now).slice(0, 4)) } else { setY(''); setM(m || now) } }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable onPress={() => shift(-1)} hitSlop={12} style={{ padding: 10, backgroundColor: C.card, borderRadius: 12 }}><Text style={{ color: C.text, fontSize: 18 }}>‹</Text></Pressable>
        <Pressable onPress={() => router.push({ pathname: '/month', params: { m: m || now, mode: y ? 'year' : 'pick' } })}>
          <Text style={{ color: C.text, fontSize: 18, fontWeight: '700' }}>{label} ▾</Text>
        </Pressable>
        <Pressable disabled={atEnd} onPress={() => shift(1)} hitSlop={12} style={{ padding: 10, backgroundColor: C.card, borderRadius: 12, opacity: atEnd ? 0.3 : 1 }}><Text style={{ color: C.text, fontSize: 18 }}>›</Text></Pressable>
      </View>
      <View style={{ alignItems: 'center', gap: 6 }}>
        <CatIcon name={me?.name} group={rootName} size={44} />
        <Text style={{ color: C.text, fontSize: 40, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{inr(total)}</Text>
        <Text style={{ color: C.text2 }}>{inPeriod.length} payment{inPeriod.length === 1 ? '' : 's'}</Text>
      </View>
      <Card><Bars bars={bars} color={hue} barWidth={24} height={110} onPress={b => { setY(''); setM(b.key) }} /></Card>

      <Card style={{ gap: 2 }}>
        <Label>Month by month, by who paid</Label>
        <View style={{ flexDirection: 'row', paddingVertical: 6 }}>
          <Text style={{ color: C.text3, fontSize: 11, flex: 1.1 }}>MONTH</Text>
          {people.map(([, n]) => <Text key={n} style={{ color: C.text3, fontSize: 11, flex: 1, textAlign: 'right' }}>{n.toUpperCase()}</Text>)}
          <Text style={{ color: C.text3, fontSize: 11, flex: 1.1, textAlign: 'right' }}>HOUSEHOLD</Text>
        </View>
        {last12.map(k => {
          const on = !y && k === m
          const txt: TextStyle = { color: C.text, fontVariant: ['tabular-nums'], fontWeight: on ? '700' : '400' }
          return (
            <View key={k} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.line }}>
              <Pressable onPress={() => openMonth(k, null)} style={{ flex: 1.1 }}><Text style={txt}>{MONTHS[Number(k.slice(5, 7)) - 1].slice(0, 3)} ’{k.slice(2, 4)}</Text></Pressable>
              {people.map(([pid]) => (
                <Pressable key={pid} onPress={() => openMonth(k, pid)} hitSlop={6} style={{ flex: 1 }}>
                  <Text numberOfLines={1} adjustsFontSizeToFit style={[txt, { textAlign: 'right', color: cell[`${k}|${pid}`] ? C.text : C.text3 }]}>{inr(cell[`${k}|${pid}`] ?? 0)}</Text>
                </Pressable>
              ))}
              <Pressable onPress={() => openMonth(k, null)} hitSlop={6} style={{ flex: 1.1 }}>
                <Text numberOfLines={1} adjustsFontSizeToFit style={[txt, { textAlign: 'right' }]}>{inr(cell[`${k}|all`] ?? 0)}</Text>
              </Pressable>
            </View>
          )
        })}
        <View style={{ flexDirection: 'row', paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.line }}>
          <Text style={{ color: C.text, fontWeight: '700', flex: 1.1 }}>12 months</Text>
          {people.map(([pid]) => <Text key={pid} style={{ color: C.text, fontWeight: '700', flex: 1, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{inr(sumOf(pid))}</Text>)}
          <Text style={{ color: C.text, fontWeight: '700', flex: 1.1, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{inr(sumOf('all'))}</Text>
        </View>
      </Card>

      {children.length > 0 && tree.hasChildren(id) && (
        <Card style={{ gap: 10 }}>
          <Label>Inside {me?.name}</Label>
          {children.map(([k, v]) => {
            const c = tree.get(k)
            return (
              <Pressable key={k}
                onPress={() => k !== id
                  ? router.push({ pathname: '/c/[id]', params: { id: String(k), m, y, who: who ?? '' } })
                  : openAll({ ...span, who, dir: 'debit', cat: id, exact: true })}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, opacity: pressed ? 0.6 : 1 })}>
                <CatIcon name={c?.name} group={rootName} size={30} />
                <Text style={{ color: C.text, flex: 1, fontWeight: '600' }}>{k === id ? `${me?.name}, not split further` : c?.name}</Text>
                <AmountShare v={v} of={childTotal} />
                <Text style={{ color: C.text3, fontSize: 18 }}>›</Text>
              </Pressable>
            )
          })}
        </Card>
      )}

      {payees.length > 0 && (
        <Card style={{ gap: 8 }}>
          <Label>Who you paid</Label>
          {payees.map(e => (
            // A payee with no key (typed in by hand) opens a search for its name instead.
            <Pressable key={e.key ?? `name:${e.name}`}
              onPress={() => e.key ? router.push({ pathname: '/m/[key]', params: { key: e.key } }) : openAll({ ...span, who, dir: 'debit', cat: id, q: e.name })}
              style={({ pressed }) => ({ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, opacity: pressed ? 0.6 : 1 })}>
              <Text style={{ color: C.text, flex: 1 }} numberOfLines={1}>{e.name}</Text>
              <AmountShare v={e.v} of={payeeTotal} />
              <Text style={{ color: C.text3, fontSize: 18 }}>›</Text>
            </Pressable>
          ))}
        </Card>
      )}

      {inPeriod.length > 0 && (
        <Card style={{ gap: 4 }}>
          <Label>Payments</Label>
          {inPeriod.slice(0, 80).map((r, i) => (
            <View key={r.id}>
              {(i === 0 || inPeriod[i - 1].occurred_on !== r.occurred_on) && <Text style={{ color: C.text2, fontWeight: '600', marginTop: 10 }}>{day(r.occurred_on)}</Text>}
              <Pressable onPress={() => router.push(`/t/${r.id}`)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, opacity: pressed ? 0.6 : 1 })}>
                <CatIcon name={tree.name(r.category_id)} group={rootName} size={30} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text, fontWeight: '600' }} numberOfLines={1}>{r.merchant ?? r.merchant_key}</Text>
                  <Text style={{ color: C.text2, fontSize: 12 }}>{tree.name(r.category_id)} · {PEOPLE[r.paid_by]}{r.note ? ` · ${r.note}` : ''}</Text>
                </View>
                <Text style={{ color: C.text, fontVariant: ['tabular-nums'] }}>{Number(r.amount) < 0 ? '−' : ''}{inr(Number(r.amount))}</Text>
              </Pressable>
            </View>
          ))}
        </Card>
      )}
    </ScrollView>
  )
}
