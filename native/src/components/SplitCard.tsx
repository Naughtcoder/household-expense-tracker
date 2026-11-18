import { useMemo, useState } from 'react'
import { Alert, Pressable, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { catTree } from '@lib/cats.ts'
import { refreshAll, useCategories, type Txn } from '@/lib/data'
import { act } from '@/lib/api'
import { useSplit, inrSigned } from '@/lib/split-data'
import { scopeLabel } from '@/lib/choice'
import { Card, Label } from './ui'
import { C } from '@/theme'

function Chip({ label, onPress, strong }: { label: string; onPress: () => void; strong?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: strong ? C.accent : C.raised, opacity: pressed ? 0.6 : 1 })}>
      <Text style={{ color: strong ? C.accentText : C.text, fontWeight: '700', fontSize: 13 }}>{label}</Text>
    </Pressable>
  )
}

/** On a payment: its parts when split (each tappable to its category), the
 *  planned split it fits, or "Split this payment". On a part: the way to the
 *  whole payment. */
export function SplitCard({ p }: { p: Txn }) {
  const s = useSplit(p)
  const cats = useCategories()
  const tree = useMemo(() => catTree(cats.data ?? []), [cats.data])
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  if (p.direction !== 'debit' || !s.data) return null
  const month = p.occurred_on.slice(0, 7)
  const run = async (action: string, args: Record<string, unknown>) => {
    setBusy(true)
    try { const r = await act(action, args); if (r.error) throw new Error(r.error); refreshAll(qc) }
    catch (e) { Alert.alert('Not done', (e as Error).message) }
    setBusy(false)
  }

  if (p.split_of) {
    return (
      <Pressable onPress={() => router.push(`/t/${s.data!.rootId}`)}>
        <Card style={{ gap: 4 }}>
          <Label>Part of a split payment</Label>
          <Text style={{ color: C.text, fontSize: 15 }}>This part is {inrSigned(Number(p.amount))} of {inrSigned(s.data.total)}. See the whole payment ›</Text>
        </Card>
      </Pressable>
    )
  }

  if (s.data.parts.length > 1) {
    return (
      <Card style={{ gap: 6 }}>
        <Label>Split into {s.data.parts.length}</Label>
        {s.data.parts.map(x => (
          <Pressable key={x.id} onPress={() => x.category_id ? router.push({ pathname: '/c/[id]', params: { id: String(x.category_id), m: month } }) : router.push(`/t/${x.id}`)}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, opacity: pressed ? 0.6 : 1 })}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontWeight: '600' }}>{tree.label(x.category_id) || (x.scope === 'transfer' ? 'Transfer' : 'No category')}</Text>
              {(x.note || x.scope !== 'household') ? <Text style={{ color: C.text2, fontSize: 12 }}>{[x.note, x.scope !== 'household' ? scopeLabel(x.scope) : null].filter(Boolean).join(' · ')}</Text> : null}
            </View>
            <Text style={{ color: C.text, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{inrSigned(x.amount)}</Text>
          </Pressable>
        ))}
        <Text style={{ color: C.text2, fontSize: 12 }}>Each part counts in its own category. Together they are the {inrSigned(s.data.total)} the bank took.</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
          <Chip label="Edit the split" onPress={() => router.push({ pathname: '/split', params: { id: p.id } })} />
          <Chip label={busy ? 'Working' : 'Put back as one'} onPress={() => Alert.alert('Put back as one payment?', 'The parts go, and the payment is one again, as it was before the split.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Put back', onPress: () => run('unsplitPayment', { id: p.id }) },
          ])} />
        </View>
      </Card>
    )
  }

  const o = s.data.offer
  return (
    <>
      {o && (
        <Card style={{ gap: 6 }}>
          <Label>Planned split{o.payee ? ` for ${o.payee}` : ''}</Label>
          <Text style={{ color: o.diff === 0 ? C.text2 : C.caution }}>
            {o.diff === 0 ? `You planned this payment of ${inrSigned(o.expected)}.`
              : `Matches your planned split, but the amount differs: planned ${inrSigned(o.expected)}, paid ${inrSigned(Number(p.amount))}.`}
          </Text>
          {o.parts.map((x, i) => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
              <Text style={{ color: C.text, flex: 1 }} numberOfLines={1}>{tree.label(x.category_id) || 'No category'}{x.note ? ` · ${x.note}` : ''}</Text>
              <Text style={{ color: C.text, fontVariant: ['tabular-nums'] }}>{inrSigned(Number(x.amount))}</Text>
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            {o.diff === 0
              ? <Chip strong label={busy ? 'Applying' : 'Apply the plan'} onPress={() => run('applyPlan', { planId: o.id, paymentId: p.id })} />
              : <Chip strong label="Apply with changed parts" onPress={() => router.push({ pathname: '/split', params: { id: p.id, plan: o.id } })} />}
          </View>
        </Card>
      )}
      <Pressable onPress={() => router.push({ pathname: '/split', params: { id: p.id } })}>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.text, fontSize: 16, fontWeight: '600' }}>Split this payment</Text>
            <Text style={{ color: C.text2, fontSize: 12 }}>One payment for more than one thing, such as rent and maintenance together.</Text>
          </View>
          <Text style={{ color: C.text3, fontSize: 20 }}>›</Text>
        </Card>
      </Pressable>
    </>
  )
}
