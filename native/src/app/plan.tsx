import { useEffect, useState } from 'react'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { Stack, router, useLocalSearchParams } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { checkPlan, type PlanInput } from '@lib/splits.ts'
import { PEOPLE, refreshAll } from '@/lib/data'
import { supabase } from '@/lib/supabase'
import { act } from '@/lib/api'
import { usePlans } from '@/lib/split-data'
import { dayLabel, useDateChoice, useSheetChoice } from '@/lib/choice'
import { PartsEditor, blankRow, toPart, toRow, type PartRow } from '@/components/PartsEditor'
import { Card, ChoiceRow, CloseX, Label } from '@/components/ui'
import { C } from '@/theme'

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const plus = (iso: string, d: number) => new Date(Date.parse(iso) + d * 86400000).toISOString().slice(0, 10)
const rupees = (s: string) => Number(s.replace(/[,\s₹]/g, ''))

/** A new planned split, or a change to one not yet used (`id`). */
export default function PlanScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  const qc = useQueryClient()
  const plans = usePlans()
  const me = useQuery({
    queryKey: ['me-person'],
    queryFn: async () => {
      const { data: s } = await supabase.auth.getSession()
      const { data } = await supabase.from('people').select('id').eq('auth_uid', s.session?.user.id ?? '').maybeSingle()
      return (data?.id as string | undefined) ?? null
    },
    staleTime: Infinity,
  })
  const [paidBy, setPaidBy] = useState<string | null>(null)
  const [payee, setPayee] = useState('')
  const [expected, setExpected] = useState('')
  const [tolerance, setTolerance] = useState('0')
  const [from, setFrom] = useState(today())
  const [to, setTo] = useState(plus(today(), 14))
  const [note, setNote] = useState('')
  const [rows, setRows] = useState<PartRow[]>([blankRow(), blankRow()])
  const [filled, setFilled] = useState(!id)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const choosePayer = useSheetChoice('plan-payer', setPaidBy)
  const chooseFrom = useDateChoice('plan-from', setFrom, true)
  const chooseTo = useDateChoice('plan-to', setTo, true)

  useEffect(() => {
    if (filled || !plans.data) return
    const p = plans.data.open.find(x => x.id === id)
    if (!p) return
    setPaidBy(p.paid_by); setPayee(p.payee_hint ?? ''); setExpected(String(Number(p.expected_amount))); setTolerance(String(Number(p.tolerance)))
    setFrom(p.window_from.slice(0, 10)); setTo(p.window_to.slice(0, 10)); setNote(p.note ?? ''); setRows(p.parts.map(toRow)); setFilled(true)
  }, [filled, plans.data, id])

  const who = paidBy ?? me.data ?? ''
  const input: PlanInput = { paidBy: who, payeeHint: payee || null, expected: rupees(expected), tolerance: rupees(tolerance || '0'), from, to, parts: rows.map(toPart), note: note || null }
  const wrong = checkPlan(input)
  const save = async () => {
    if (wrong) return
    setBusy(true); setMsg(null)
    try {
      const r = id ? await act('updatePlan', { id, ...input }) : await act('createPlan', input)
      if (r.error) throw new Error(r.error)
      refreshAll(qc)
      router.back()
    } catch (e) { setMsg((e as Error).message) }
    setBusy(false)
  }

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: id ? 'Change the plan' : 'Plan a payment', headerRight: () => <CloseX label="Cancel" onPress={() => router.back()} /> }} />
      <Card style={{ gap: 10 }}>
        <Label>Amount you will pay</Label>
        <TextInput value={expected} onChangeText={setExpected} keyboardType="numbers-and-punctuation" placeholder="0" placeholderTextColor={C.text3}
          style={{ color: C.text, fontSize: 34, fontWeight: '800', fontVariant: ['tabular-nums'] }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ color: C.text2, flex: 1 }}>Leeway, rupees either way</Text>
          <TextInput value={tolerance} onChangeText={setTolerance} keyboardType="numbers-and-punctuation" placeholderTextColor={C.text3}
            style={{ color: C.text, fontSize: 16, minWidth: 80, textAlign: 'right', backgroundColor: C.raised, borderRadius: 10, padding: 8 }} />
        </View>
      </Card>
      <Card style={{ gap: 8 }}>
        <Label>Payee</Label>
        <TextInput value={payee} onChangeText={setPayee} placeholder="Words in the payee's name or account, split by |" placeholderTextColor={C.text3}
          style={{ color: C.text, fontSize: 16, backgroundColor: C.raised, borderRadius: 12, padding: 10 }} />
        <Text style={{ color: C.text3, fontSize: 12 }}>For example SHARMA | 1234. Any one is enough. A payment for exactly the amount matches even without them.</Text>
      </Card>
      <Card style={{ gap: 8 }}>
        <ChoiceRow label="Who pays" value={PEOPLE[who] ?? 'You'} onPress={() => choosePayer({
          title: 'Who will pay', value: who,
          options: Object.entries(PEOPLE).sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label })),
        })} />
        <ChoiceRow label="From" value={dayLabel(from)} onPress={() => chooseFrom(from, 'First day it may arrive')} />
        <ChoiceRow label="To" value={dayLabel(to)} onPress={() => chooseTo(to, 'Last day it may arrive')} />
      </Card>
      <Label>Parts</Label>
      <PartsEditor who={`plan-${id ?? 'new'}`} total={rupees(expected) || 0} rows={rows} onChange={setRows} />
      <Card style={{ gap: 6 }}>
        <Label>Note</Label>
        <TextInput value={note} onChangeText={setNote} placeholder="Anything to remember about it" placeholderTextColor={C.text3} style={{ color: C.text, fontSize: 16 }} />
      </Card>
      <Pressable onPress={save} disabled={busy || !!wrong} style={{ backgroundColor: C.accent, borderRadius: 14, padding: 15, alignItems: 'center', opacity: busy || wrong ? 0.5 : 1 }}>
        <Text style={{ color: C.accentText, fontWeight: '800', fontSize: 16 }}>{busy ? 'Saving' : 'Save the plan'}</Text>
      </Pressable>
      {wrong && <Text style={{ color: C.text2, textAlign: 'center' }}>{wrong}</Text>}
      {msg && <Text style={{ color: C.negative, textAlign: 'center' }}>{msg}</Text>}
    </ScrollView>
  )
}
