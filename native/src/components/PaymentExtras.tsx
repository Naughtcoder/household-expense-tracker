import { useState } from 'react'
import { EMPLOYER } from '@/lib/variant'
import { Alert, Pressable, Text, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { act } from '@/lib/api'
import { refreshAll, type Txn } from '@/lib/data'
import { useAround, type Line } from '@/lib/payment'
import { Card, Label, inr } from '@/components/ui'
import { C } from '@/theme'

const day = (iso: string) => new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
const isTrip = (n: string) => /, [A-Z][a-z]{2} \d{4}/.test(n)

function Row({ l, right, onPress }: { l: Line; right?: React.ReactNode; onPress?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
      <Pressable onPress={onPress ?? (() => router.push(`/t/${l.id}`))} style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.6 : 1 })}>
        <Text style={{ color: C.text, fontWeight: '600' }} numberOfLines={1}>{l.merchant ?? 'Payment'}</Text>
        <Text style={{ color: C.text2, fontSize: 12 }}>{day(l.occurred_on)} · {inr(l.amount)}</Text>
      </Pressable>
      {right}
    </View>
  )
}

function Chip({ label, onPress, strong }: { label: string; onPress: () => void; strong?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, backgroundColor: strong ? C.accent : C.raised, opacity: pressed ? 0.6 : 1 })}>
      <Text style={{ color: strong ? C.accentText : C.text, fontWeight: '700', fontSize: 13 }}>{label}</Text>
    </Pressable>
  )
}

/** Below a payment's own fields: tags, pay-backs both kinds, the employer's
 *  repayment, and delete. Writes go through the website's actions. */
export function PaymentExtras({ p }: { p: Txn }) {
  const around = useAround(p)
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [newTag, setNewTag] = useState('')
  const [openPartner, setOpenPartner] = useState(false)
  const [openBack, setOpenBack] = useState(false)
  const a = around.data
  const done = () => { refreshAll(qc); qc.invalidateQueries({ queryKey: ['around'] }) }
  const run = async (f: () => Promise<unknown>) => { try { await f(); done() } catch (e) { Alert.alert('Not done', (e as Error).message) } }

  const addTag = (id: number) => run(async () => { const { error } = await supabase.from('transaction_tags').insert({ transaction_id: p.id, tag_id: id }); if (error) throw error; setAdding(false) })
  const dropTag = (id: number) => run(async () => { const { error } = await supabase.from('transaction_tags').delete().eq('transaction_id', p.id).eq('tag_id', id); if (error) throw error })
  const makeTag = () => run(async () => {
    const r = await act<{ id?: number; error?: string }>('createTag', { name: newTag.trim() })
    if (!r.id) throw new Error(r.error ?? 'Could not make that tag.')
    setNewTag(''); await addTag(r.id)
  })
  // One part of a split is not a payment on its own: deleting removes the whole payment, every part.
  const whole = p.split_of ?? p.id
  const del = () => Alert.alert(p.split_of || p.split_total != null ? 'Delete the whole split payment?' : 'Delete this payment?', 'It is removed for good, from both phones and the website.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => run(async () => { const { error } = await supabase.from('transactions').delete().eq('id', whole); if (error) throw error; router.back() }) },
  ])

  const unused = (a?.allTags ?? []).filter(t => !a?.tags.some(x => x.id === t.id))
  const trips = unused.filter(t => isTrip(t.name)).reverse(), others = unused.filter(t => !isTrip(t.name))

  return (
    <>
      <Card style={{ gap: 10 }}>
        <Label>Tags</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {(a?.tags ?? []).map(t => <Chip key={t.id} label={`${t.name}  ✕`} onPress={() => dropTag(t.id)} />)}
          <Chip label={adding ? 'Close' : '+ Add a tag'} onPress={() => setAdding(x => !x)} />
        </View>
        {adding && (
          <View style={{ gap: 8 }}>
            {trips.length > 0 && <Text style={{ color: C.text3, fontSize: 12 }}>Trips</Text>}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{trips.slice(0, 12).map(t => <Chip key={t.id} label={t.name} onPress={() => addTag(t.id)} />)}</View>
            {others.length > 0 && <Text style={{ color: C.text3, fontSize: 12 }}>Other</Text>}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{others.map(t => <Chip key={t.id} label={t.name} onPress={() => addTag(t.id)} />)}</View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput value={newTag} onChangeText={setNewTag} placeholder='New tag. A trip: "Goa, Dec 2026"' placeholderTextColor={C.text3}
                style={{ flex: 1, backgroundColor: C.raised, color: C.text, borderRadius: 10, padding: 10 }} />
              <Chip strong label="Add" onPress={makeTag} />
            </View>
          </View>
        )}
      </Card>

      {a?.partner && (a.partner.linked.length > 0 ? (
        <Card style={{ gap: 4 }}>
          <Label>{a.partner.mode === 'payment' ? `Paid back by ${a.partner.other}` : 'Pays for'}</Label>
          {a.partner.linked.map(l => <Row key={l.id} l={l} right={<Chip label="Undo" onPress={() => run(() => act('uncover', { paymentId: a.partner!.mode === 'payment' ? p.id : l.id }))} />} />)}
          <Text style={{ color: C.text2, fontSize: 12 }}>{a.partner.mode === 'payment' ? `This counts as ${a.partner.other}'s spending now.` : 'Those count as spending of whoever sent this.'}</Text>
        </Card>
      ) : a.partner.mode === 'payment' && (
        <Card style={{ gap: 6 }}>
          <Chip label={openPartner ? 'Close' : `${a.partner.other} paid me back for this`} onPress={() => setOpenPartner(x => !x)} />
          {openPartner && (a.partner.choices.length
            ? a.partner.choices.map(l => <Row key={l.id} l={l} onPress={() => {}} right={<Chip strong label="This one" onPress={() => run(() => act('cover', { paymentId: p.id, transferId: l.id }))} />} />)
            : <Text style={{ color: C.text2 }}>No transfer from {a.partner.other} in the 30 days after this.</Text>)}
        </Card>
      ))}

      {a?.paysBack && (a.paysBack.linked ? (
        <Card style={{ gap: 4 }}>
          <Label>Pays back</Label>
          <Row l={a.paysBack.linked} right={<Chip label="Undo" onPress={() => run(() => act('unlinkPayback', { paybackId: p.id }))} />} />
        </Card>
      ) : (
        <Card style={{ gap: 6 }}>
          <Chip label={openBack ? 'Close' : 'Pays back a payment of mine'} onPress={() => setOpenBack(x => !x)} />
          {openBack && (a.paysBack.choices.length
            ? a.paysBack.choices.map(l => <Row key={l.id} l={l} onPress={() => {}} right={<Chip strong label="This one" onPress={() => run(() => act('linkPayback', { paybackId: p.id, paymentId: l.id }))} />} />)
            : <Text style={{ color: C.text2 }}>Nothing in the 30 days before this to match.</Text>)}
        </Card>
      ))}

      {(a?.friendBacks.length ?? 0) > 0 && (
        <Card style={{ gap: 4 }}>
          <Label>Paid back by friends</Label>
          {a!.friendBacks.map(l => <Row key={l.id} l={{ ...l, amount: Math.abs(l.amount) }} />)}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
            <Text style={{ color: C.text, fontWeight: '700' }}>Your share</Text>
            <Text style={{ color: C.text, fontWeight: '700' }}>{inr(Number(p.amount) - a!.friendBacks.reduce((s, l) => s + Math.abs(l.amount), 0))}</Text>
          </View>
        </Card>
      )}

      {a?.payout && (
        <Card style={{ gap: 4 }}><Label>Repaid by</Label><Row l={a.payout} /></Card>
      )}
      {(a?.paidCount ?? 0) > 0 && (
        <Pressable onPress={() => router.push({ pathname: '/claimable/r/[id]', params: { id: p.id } })} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <Card><Label>Pays back</Label><Text style={{ color: C.text, marginTop: 4 }}>{a!.paidCount} {EMPLOYER} claim{a!.paidCount === 1 ? '' : 's'} ›</Text></Card>
        </Pressable>
      )}

      <Pressable onPress={del} style={{ padding: 14, alignItems: 'center' }}><Text style={{ color: C.negative, fontWeight: '700' }}>Delete this payment</Text></Pressable>
    </>
  )
}
