import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import { Stack, router, useLocalSearchParams } from 'expo-router'
import { inrExact } from '@lib/format.ts'
import { monthLabel } from '@lib/drill.ts'
import { useRepayment, type TraceClaim } from '@/lib/claims-data'
import { dayLabel } from '@/components/TxnRow'
import { Card, Label, inr } from '@/components/ui'
import { C, HUES } from '@/theme'

const num = { fontVariant: ['tabular-nums'] as ('tabular-nums')[] }

/**
 * One repayment, traced to the claims it paid back (app/claimable/r/[id]).
 * A payout in September often repays spending from July and August, so the
 * claims are grouped by the month they were spent, and the payout is checked
 * against their sum.
 */
export default function Repayment() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const q = useRepayment(String(id ?? ''))
  const pay = q.data?.pay
  const list = q.data?.claims ?? []
  const covered = list.reduce((s, c) => s + Number(c.amount), 0)
  const gap = pay ? Number(pay.amount) - covered : 0
  const exact = Math.abs(gap) < 1
  const byMonth = new Map<string, TraceClaim[]>()
  for (const c of list) byMonth.set(c.occurred_on.slice(0, 7), [...(byMonth.get(c.occurred_on.slice(0, 7)) ?? []), c])

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 80 }}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={C.text2} />}>
      <Stack.Screen options={{ title: pay?.merchant ?? 'Repayment' }} />
      {q.isLoading && <ActivityIndicator color={C.text2} style={{ marginTop: 30 }} />}
      {q.error && <Text style={{ color: C.negative }}>{q.error instanceof Error ? q.error.message : 'Could not load this repayment.'}</Text>}
      {!q.isLoading && !q.error && !pay && <Text style={{ color: C.text2, textAlign: 'center', marginTop: 30 }}>This repayment is not there any more.</Text>}

      {pay && (
        <>
          <View style={{ alignItems: 'center', gap: 4 }}>
            <Text style={{ color: C.text2 }}>{pay.merchant ?? 'Repayment'}, {dayLabel(pay.occurred_on)}</Text>
            <Text style={{ color: C.positive, fontSize: 40, fontWeight: '800', ...num }}>+{inr(Number(pay.amount))}</Text>
            <Text style={{ color: C.text2, textAlign: 'center' }}>
              {list.length
                ? `Pays back ${list.length} claim${list.length === 1 ? '' : 's'} from ${[...byMonth.keys()].map(k => monthLabel(k).split(' ')[0]).join(', ')}`
                : 'Not yet matched to any claims'}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Card style={{ flex: 1 }}><Label>Claims covered</Label><Text style={{ color: C.text, fontSize: 18, fontWeight: '700', marginTop: 4, ...num }}>{inr(covered)}</Text></Card>
            <Card style={{ flex: 1 }}>
              <Label>{exact ? 'Difference' : gap > 0 ? 'Paid but not matched' : 'Claimed but not paid'}</Label>
              <Text style={{ color: exact ? C.positive : HUES[6], fontSize: 18, fontWeight: '700', marginTop: 4, ...num }}>{exact ? 'Exact' : inrExact(Math.abs(gap))}</Text>
            </Card>
          </View>

          {[...byMonth.entries()].map(([k, rows]) => (
            <Card key={k} style={{ gap: 2 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                <Text style={{ color: C.text2, fontWeight: '600' }}>Spent in {monthLabel(k)}</Text>
                <Text style={{ color: C.text2, fontWeight: '600', ...num }}>{inr(rows.reduce((s, r) => s + Number(r.amount), 0))}</Text>
              </View>
              {rows.map(r => (
                <Pressable key={r.id} onPress={() => router.push(`/t/${r.id}`)}
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, opacity: pressed ? 0.6 : 1 })}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.text, fontSize: 16, fontWeight: '600' }} numberOfLines={1}>{r.merchant ?? r.merchant_key ?? 'Unknown'}</Text>
                    <Text style={{ color: C.text2, fontSize: 13 }}>{dayLabel(r.occurred_on)}</Text>
                  </View>
                  <Text style={{ color: C.text, fontSize: 16, fontWeight: '600', ...num }}>{inr(Number(r.amount))}</Text>
                  <Text style={{ color: C.text3, fontSize: 18 }}>›</Text>
                </Pressable>
              ))}
            </Card>
          ))}
        </>
      )}
    </ScrollView>
  )
}
