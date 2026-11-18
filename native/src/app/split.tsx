import { useEffect, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { Stack, router, useLocalSearchParams } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { checkParts } from '@lib/splits.ts'
import { refreshAll, useTxn } from '@/lib/data'
import { act } from '@/lib/api'
import { useSplit, inrSigned } from '@/lib/split-data'
import { PartsEditor, blankRow, toPart, toRow, type PartRow } from '@/components/PartsEditor'
import { CloseX } from '@/components/ui'
import { C } from '@/theme'

/**
 * Split this payment: rows of amount, category, who it is for and a note,
 * with what is left to place shown, until they add up to what the bank took.
 * Opened from a payment (`id`), to change an existing split, or with a
 * planned split to apply (`plan`).
 */
export default function SplitScreen() {
  const { id, plan } = useLocalSearchParams<{ id: string; plan?: string }>()
  const qc = useQueryClient()
  const t = useTxn(id)
  const s = useSplit(t.data)
  const [rows, setRows] = useState<PartRow[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  // Filled once: the parts it has, the plan's parts, or the payment and an empty part.
  useEffect(() => {
    if (rows || !t.data || !s.data) return
    if (s.data.parts.length > 1) setRows(s.data.parts.map(toRow))
    else if (plan && s.data.offer?.id === plan) setRows(s.data.offer.parts.map(toRow))
    else setRows([toRow({ amount: Number(t.data.amount), category_id: t.data.category_id, scope: t.data.scope, note: t.data.note ?? null }), blankRow()])
  }, [t.data, s.data, rows, plan])

  const total = s.data?.total ?? Number(t.data?.amount ?? 0)
  const wrong = rows ? checkParts(total, rows.map(toPart)) : 'Loading'
  const save = async () => {
    if (!rows || wrong) return
    setBusy(true); setMsg(null)
    try {
      const r = plan
        ? await act('applyPlan', { planId: plan, paymentId: s.data!.rootId, parts: rows.map(toPart) })
        : await act('splitPayment', { id: s.data!.rootId, parts: rows.map(toPart) })
      if (r.error) throw new Error(r.error)
      refreshAll(qc)
      router.back()
    } catch (e) { setMsg((e as Error).message) }
    setBusy(false)
  }

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 80 }} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{
        title: plan ? 'Apply the plan' : (s.data?.parts.length ?? 0) > 1 ? 'Edit the split' : 'Split this payment',
        headerRight: () => <CloseX label="Cancel" onPress={() => router.back()} />,
      }} />
      <View style={{ alignItems: 'center', gap: 4 }}>
        <Text style={{ color: C.text, fontSize: 34, fontWeight: '800' }}>{inrSigned(total)}</Text>
        <Text style={{ color: C.text2, textAlign: 'center' }}>{t.data?.merchant ?? 'Payment'}. The parts must add up to this. A part can be below zero, for money the payee paid back.</Text>
      </View>
      {plan && s.data?.offer && s.data.offer.diff !== 0 && (
        <Text style={{ color: C.caution, textAlign: 'center' }}>
          Planned {inrSigned(s.data.offer.expected)}, paid {inrSigned(total)}: {s.data.offer.diff > 0 ? 'more' : 'less'} by {inrSigned(Math.abs(s.data.offer.diff))}. Change the parts to fit.
        </Text>
      )}
      {rows && <PartsEditor who={`split-${id}`} total={total} rows={rows} onChange={setRows} />}
      <Pressable onPress={save} disabled={busy || !!wrong} style={{ backgroundColor: C.accent, borderRadius: 14, padding: 15, alignItems: 'center', opacity: busy || wrong ? 0.5 : 1 }}>
        <Text style={{ color: C.accentText, fontWeight: '800', fontSize: 16 }}>{busy ? 'Saving' : 'Save'}</Text>
      </Pressable>
      {wrong && rows && <Text style={{ color: C.text2, textAlign: 'center' }}>{wrong}</Text>}
      {msg && <Text style={{ color: C.negative, textAlign: 'center' }}>{msg}</Text>}
    </ScrollView>
  )
}
