import { useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import { Stack } from 'expo-router'
import { catTree } from '@lib/cats.ts'
import { PEOPLE, monthKeyOf, useCategories } from '@/lib/data'
import { investMonths, investPayees, netOf, payeeOf, useInvestments } from '@/lib/invest-data'
import { Bars, type Bar } from '@/components/Bars'
import { CatIcon } from '@/components/CatIcon'
import { TxnRow, dayLabel } from '@/components/TxnRow'
import { AmountShare, Card, Label, Pills, inr } from '@/components/ui'
import { openAll } from '@/lib/nav'
import { C } from '@/theme'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const monthName = (k: string) => `${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}`
const num = { fontVariant: ['tabular-nums'] as ('tabular-nums')[] }
const signedInr = (n: number) => `${n < 0 ? '−' : ''}${inr(n)}`

/**
 * Money moved into investments (Zerodha, fixed deposits), month by month.
 * Never spending: it is still the household's money. Net is money out less
 * anything that came back, the same rule as lib/scope.ts `invested`.
 * Every figure opens the payments behind it.
 */
export default function Investments() {
  const q = useInvestments()
  const cats = useCategories()
  const tree = useMemo(() => catTree(cats.data ?? []), [cats.data])
  const [who, setWho] = useState<string | null>(null)
  // The month the list below shows; null shows every payment.
  const [sel, setSel] = useState<string | null>(null)
  const [payee, setPayee] = useState<string | null>(null)
  const now = monthKeyOf()
  const year = now.slice(0, 4)

  const rows = (q.data ?? []).filter(t => !who || t.paid_by === who)
  const total = netOf(rows)
  const yearRows = rows.filter(t => t.occurred_on.slice(0, 4) === year)
  const yearNet = netOf(yearRows)
  const months = investMonths(rows, now)
  const bars: Bar[] = months.map(m => ({
    key: m.key,
    label: m.key.endsWith('-01') ? `’${m.key.slice(2, 4)}` : 'JFMAMJJASOND'[Number(m.key.slice(5, 7)) - 1],
    value: Math.max(0, m.net),
    dim: sel ? m.key !== sel : false,
  }))

  const inSel = rows.filter(t => !sel || t.occurred_on.slice(0, 7) === sel)
  const payees = investPayees(inSel)
  const payeeTotal = payees.reduce((s, p) => s + Math.max(0, p.net), 0)
  const shown = inSel.filter(t => !payee || payeeOf(t) === payee)
  const selNet = netOf(inSel)

  const pick = (k: string | null) => { setSel(k === sel ? null : k); setPayee(null) }

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 80 }}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={C.text2} />}>
      <Stack.Screen options={{ title: 'Investments' }} />
      <Pills options={[[null, 'Household'], ...Object.entries(PEOPLE).sort((a, b) => a[1].localeCompare(b[1]))] as [string | null, string][]}
        value={who} onChange={v => { setWho(v); setSel(null); setPayee(null) }} />

      <Pressable onPress={() => pick(null)} style={({ pressed }) => ({ alignItems: 'center', gap: 4, opacity: pressed ? 0.6 : 1 })}>
        <Text style={{ color: C.text2 }}>Invested to date, net</Text>
        <Text style={{ color: C.text, fontSize: 40, fontWeight: '800', ...num }}>{signedInr(total)}</Text>
        <Text style={{ color: C.text2, textAlign: 'center' }}>Not spending: the money is still yours, in a fund or a deposit ›</Text>
      </Pressable>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Pressable onPress={() => openAll({ from: `${year}-01-01`, to: `${year}-12-31`, scope: 'investment', who })} style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.6 : 1 })}>
          <Card><Label>This year, net</Label><Text style={{ color: C.text, fontSize: 20, fontWeight: '700', marginTop: 4, ...num }}>{signedInr(yearNet)} ›</Text></Card>
        </Pressable>
        <Pressable onPress={() => openAll({ m: now, scope: 'investment', who })} style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.6 : 1 })}>
          <Card><Label>This month, net</Label><Text style={{ color: C.text, fontSize: 20, fontWeight: '700', marginTop: 4, ...num }}>{signedInr(netOf(rows.filter(t => t.occurred_on.slice(0, 7) === now)))} ›</Text></Card>
        </Pressable>
      </View>

      {q.isLoading && <ActivityIndicator color={C.text2} style={{ marginTop: 20 }} />}
      {q.error && <Text style={{ color: C.negative }}>{q.error instanceof Error ? q.error.message : 'Could not load investments.'}</Text>}
      {!q.isLoading && !rows.length && <Text style={{ color: C.text2 }}>Nothing invested yet{who ? ` by ${PEOPLE[who]}` : ''}.</Text>}

      {bars.length > 0 && (
        <Card style={{ gap: 6 }}>
          <Label>Net invested each month</Label>
          <Bars bars={bars} color={C.positive} barWidth={24} onPress={b => pick(b.key)} />
          <Text style={{ color: C.text3, fontSize: 12 }}>Tap a month to see its payments. A month where more came back than went in shows as a stub.</Text>
        </Card>
      )}

      {months.length > 0 && (
        <Card style={{ paddingVertical: 4 }}>
          {[...months].reverse().filter(m => m.count).map((m, i) => (
            <Pressable key={m.key} onPress={() => pick(m.key)}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: C.line, opacity: pressed ? 0.6 : 1 })}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontSize: 16, fontWeight: sel === m.key ? '800' : '600' }}>{monthName(m.key)}</Text>
                <Text style={{ color: C.text2, fontSize: 13, ...num }}>
                  {[m.out ? `${inr(m.out)} out` : '', m.in ? `${inr(m.in)} back` : ''].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Text style={{ color: m.net < 0 ? C.positive : C.text, fontSize: 16, fontWeight: '700', ...num }}>{signedInr(m.net)}</Text>
              <Text style={{ color: C.text3, fontSize: 18 }}>›</Text>
            </Pressable>
          ))}
        </Card>
      )}

      {inSel.length > 0 && (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <Label>{sel ? monthName(sel) : 'Every payment'}</Label>
            <Pressable hitSlop={8} disabled={!sel} onPress={() => sel && openAll({ m: sel, scope: 'investment', who })}>
              <Text style={{ color: C.text2, ...num }}>{signedInr(selNet)} net{sel ? ' ›' : ''}</Text>
            </Pressable>
          </View>

          <Card style={{ gap: 10 }}>
            <Label>By payee</Label>
            {payees.map(p => (
              <Pressable key={p.name} onPress={() => setPayee(payee === p.name ? null : p.name)}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, opacity: pressed ? 0.6 : 1 })}>
                <CatIcon name="Investments" size={30} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text, fontWeight: payee === p.name ? '800' : '600' }} numberOfLines={1}>{p.name}</Text>
                  <Text style={{ color: C.text2, fontSize: 12, ...num }}>
                    {[p.out ? `${inr(p.out)} out` : '', p.in ? `${inr(p.in)} back` : ''].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                {p.net > 0 ? <AmountShare v={p.net} of={payeeTotal} /> : <Text style={{ color: C.positive, ...num }}>{signedInr(p.net)}</Text>}
                <Text style={{ color: C.text3, fontSize: 18 }}>›</Text>
              </Pressable>
            ))}
          </Card>

          <Card style={{ paddingVertical: 4 }}>
            {payee && <Text style={{ color: C.text2, fontSize: 13, paddingTop: 8 }}>Only {payee}. Tap it again to show all.</Text>}
            {shown.map((t, i) => (
              <View key={t.id}>
                {(i === 0 || shown[i - 1].occurred_on !== t.occurred_on) && <Text style={{ color: C.text2, fontWeight: '600', marginTop: 10 }}>{dayLabel(t.occurred_on)}</Text>}
                <TxnRow t={t} tree={tree} />
              </View>
            ))}
          </Card>
        </>
      )}
    </ScrollView>
  )
}
