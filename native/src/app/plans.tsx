import { useMemo, useState } from 'react'
import { Alert, Pressable, ScrollView, Text, View } from 'react-native'
import { Stack, router } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { catTree } from '@lib/cats.ts'
import { PEOPLE, refreshAll, useCategories } from '@/lib/data'
import { act } from '@/lib/api'
import { usePlans, inrSigned, type PlanRow } from '@/lib/split-data'
import { Card, Label } from '@/components/ui'
import { C } from '@/theme'

const day = (iso: string) => new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

/** Planned splits: the ones waiting for their payment, each with Edit and
 *  Cancel, and a way to plan a new one. Each used plan opens its payment. */
export default function Plans() {
  const q = usePlans()
  const cats = useCategories()
  const tree = useMemo(() => catTree(cats.data ?? []), [cats.data])
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const cancel = (p: PlanRow) => Alert.alert('Cancel this plan?', 'It will not split anything when the payment arrives.', [
    { text: 'Keep it', style: 'cancel' },
    { text: 'Cancel the plan', style: 'destructive', onPress: async () => {
      setBusy(true)
      try { const r = await act('cancelPlan', { id: p.id }); if (r.error) throw new Error(r.error); refreshAll(qc) }
      catch (e) { Alert.alert('Not cancelled', (e as Error).message) }
      setBusy(false)
    } },
  ])
  const open = q.data?.open ?? []
  const done = q.data?.done ?? []

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 80 }}>
      <Stack.Screen options={{ title: 'Plan a payment' }} />
      <Text style={{ color: C.text2 }}>
        Say how a payment you are about to make splits up. When it arrives inside the dates, to that payee or for exactly that amount, it splits by itself. If the payee matches at a different amount, it waits in Review.
      </Text>
      <Pressable onPress={() => router.push('/plan')} style={{ backgroundColor: C.accent, borderRadius: 14, padding: 15, alignItems: 'center' }}>
        <Text style={{ color: C.accentText, fontWeight: '800', fontSize: 16 }}>Plan a payment</Text>
      </Pressable>
      <Label>Waiting for the payment</Label>
      {q.isLoading && <Text style={{ color: C.text2 }}>Loading</Text>}
      {!q.isLoading && open.length === 0 && <Text style={{ color: C.text2 }}>No plans open.</Text>}
      {open.map(p => (
        <Card key={p.id} style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
            <Text style={{ color: C.text, fontWeight: '700', flex: 1 }} numberOfLines={2}>{p.payee_hint ?? 'Any payee'}</Text>
            <Text style={{ color: C.text, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{inrSigned(Number(p.expected_amount))}{Number(p.tolerance) ? ` ± ${inrSigned(Number(p.tolerance))}` : ''}</Text>
          </View>
          <Text style={{ color: C.text2, fontSize: 13 }}>{PEOPLE[p.paid_by] ?? ''} · {day(p.window_from)} to {day(p.window_to)}</Text>
          {p.parts.map((x, i) => (
            <Pressable key={i} onPress={() => x.category_id && router.push({ pathname: '/c/[id]', params: { id: String(x.category_id) } })}
              style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
              <Text style={{ color: C.text2, fontSize: 13, flex: 1 }} numberOfLines={1}>{tree.label(x.category_id) || 'No category'}{x.note ? ` · ${x.note}` : ''}</Text>
              <Text style={{ color: C.text2, fontSize: 13, fontVariant: ['tabular-nums'] }}>{inrSigned(Number(x.amount))}</Text>
            </Pressable>
          ))}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            <Pressable onPress={() => router.push({ pathname: '/plan', params: { id: p.id } })} style={{ backgroundColor: C.raised, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12 }}>
              <Text style={{ color: C.text, fontWeight: '700', fontSize: 13 }}>Edit</Text>
            </Pressable>
            <Pressable disabled={busy} onPress={() => cancel(p)} style={{ backgroundColor: C.raised, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12 }}>
              <Text style={{ color: C.negative, fontWeight: '700', fontSize: 13 }}>Cancel the plan</Text>
            </Pressable>
          </View>
        </Card>
      ))}
      {done.length > 0 && <Label>Used and cancelled</Label>}
      {done.map(p => (
        <Pressable key={p.id} disabled={!p.applied_to} onPress={() => p.applied_to && router.push(`/t/${p.applied_to}`)}>
          <Card style={{ gap: 2 }}>
            <Text style={{ color: C.text, fontWeight: '600' }}>{p.payee_hint ?? 'Any payee'} · {inrSigned(Number(p.expected_amount))}</Text>
            <Text style={{ color: C.text2, fontSize: 13 }}>{p.status === 'applied' ? `Applied${p.applied_at ? ` ${day(p.applied_at)}` : ''}, see the payment ›` : 'Cancelled'}</Text>
          </Card>
        </Pressable>
      ))}
    </ScrollView>
  )
}
