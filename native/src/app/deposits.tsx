import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import { Stack, router } from 'expo-router'
import { useDeposits, type DepositRow } from '@/lib/claims-data'
import { dayLabel } from '@/components/TxnRow'
import { Card, inr } from '@/components/ui'
import { C } from '@/theme'

const num = { fontVariant: ['tabular-nums'] as ('tabular-nums')[] }

/** "Maple Court deposit (A. Landlord)" belongs to "Maple Court". */
const propertyOf = (m: string | null) => (m ?? 'Other').split(/ deposit/i)[0].trim() || 'Other'

/**
 * Money parked as deposits (app/deposits/page.tsx): what is still with a
 * landlord, what came back, and what was kept. Deposits are never spending or
 * income, so they only show here. A deposit marked settled came back (or was
 * written off) even where the refund itself is not in the bank records.
 */
export default function Deposits() {
  const q = useDeposits()
  const rows = q.data ?? []
  const byProp = new Map<string, DepositRow[]>()
  for (const r of rows) byProp.set(propertyOf(r.merchant), [...(byProp.get(propertyOf(r.merchant)) ?? []), r])

  const props = [...byProp.entries()].map(([name, list]) => {
    const paid = list.filter(r => r.direction === 'debit').reduce((s, r) => s + Number(r.amount), 0)
    const back = list.filter(r => r.direction === 'credit').reduce((s, r) => s + Number(r.amount), 0)
    const closed = list.filter(r => r.direction === 'debit').every(r => r.claim_settled_on) || back >= paid
    const held = closed ? 0 : paid - back
    const last = list[list.length - 1].occurred_on
    return { name, list, paid, back, held, closed, last }
  }).sort((a, b) => (b.held - a.held) || b.last.localeCompare(a.last))
  const heldTotal = props.reduce((s, p) => s + p.held, 0)

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 80 }}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={C.text2} />}>
      <Stack.Screen options={{ title: 'Deposits' }} />
      <View style={{ alignItems: 'center', gap: 4 }}>
        <Text style={{ color: C.text2 }}>Held as deposits</Text>
        <Text style={{ color: C.text, fontSize: 40, fontWeight: '800', ...num }}>{inr(heldTotal)}</Text>
        <Text style={{ color: C.text2, textAlign: 'center' }}>Not spending: this money comes back when you move out</Text>
      </View>
      {q.isLoading && <ActivityIndicator color={C.text2} style={{ marginTop: 20 }} />}
      {q.error && <Text style={{ color: C.negative }}>{q.error instanceof Error ? q.error.message : 'Could not load deposits.'}</Text>}

      {props.map(p => (
        <Card key={p.name} style={{ gap: 2 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
            <Text style={{ color: C.text, fontSize: 18, fontWeight: '700', flex: 1 }} numberOfLines={1}>{p.name}</Text>
            <Text style={{ color: p.held ? C.text : C.text2, fontWeight: '700', ...num }}>{p.held ? `${inr(p.held)} held` : 'Closed'}</Text>
          </View>
          <Text style={{ color: C.text2, fontSize: 13, marginTop: 2 }}>
            Paid {inr(p.paid)} · back {inr(p.back)}{p.closed && p.paid > p.back ? ` · ${inr(p.paid - p.back)} kept or not traced` : ''}
          </Text>
          {p.list.map(r => {
            const credit = r.direction === 'credit'
            const who = r.merchant && r.merchant.includes('(') ? ` · ${r.merchant.slice(r.merchant.indexOf('(') + 1, r.merchant.lastIndexOf(')'))}` : ''
            return (
              <Pressable key={r.id} onPress={() => router.push(`/t/${r.id}`)}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, opacity: pressed ? 0.6 : 1 })}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text, fontSize: 16, fontWeight: '600' }} numberOfLines={1}>{credit ? 'Returned' : 'Paid'}{who}</Text>
                  <Text style={{ color: C.text2, fontSize: 13 }}>{dayLabel(r.occurred_on)}</Text>
                </View>
                <Text style={{ color: credit ? C.positive : C.text, fontSize: 16, fontWeight: '600', ...num }}>{credit ? '+' : ''}{inr(Number(r.amount))}</Text>
                <Text style={{ color: C.text3, fontSize: 18 }}>›</Text>
              </Pressable>
            )
          })}
        </Card>
      ))}
    </ScrollView>
  )
}
