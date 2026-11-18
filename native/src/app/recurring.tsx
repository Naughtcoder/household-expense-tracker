import { useMemo, useState } from 'react'
import { Alert, Pressable, RefreshControl, ScrollView, Switch, Text, TextInput, View } from 'react-native'
import { Stack } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { catTree } from '@lib/cats.ts'
import { useCategories } from '@/lib/data'
import { act } from '@/lib/api'
import { refreshSetup, useCategoryChoice, usePeople, useRecurring, type Recurring } from '@/lib/setup-data'
import { Card, ChoiceRow, Label, inr } from '@/components/ui'
import { scopeLabel, scopesOf, useSheetChoice } from '@/lib/choice'
import { C } from '@/theme'

type Draft = { id?: number; label: string; amount: string; day: string; categoryId: number | null; scope: string; paidBy: string; active: boolean }
const SCOPES = scopesOf('household', 'claimable')
const DAYS = Array.from({ length: 28 }, (_, i) => String(i + 1))
// A function, so it reads the palette in use at render, not at import.
const input = () => ({ backgroundColor: C.raised, color: C.text, borderRadius: 12, padding: 12, fontSize: 16 }) as const

/** What you expect to pay every month. Nothing here is booked as spending
 *  until the bank reports the payment. */
export default function RecurringScreen() {
  const qc = useQueryClient()
  const q = useRecurring()
  const people = usePeople()
  const cats = useCategories()
  const tree = useMemo(() => catTree(cats.data ?? []), [cats.data])
  const label = (id: number | null) => tree.label(id) || 'Uncategorised'
  const entries = q.data ?? []
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const choose = useCategoryChoice('recurring', id => setDraft(d => (d ? { ...d, categoryId: id } : d)))
  const chooseDay = useSheetChoice('recurring-day', day => setDraft(d => (d ? { ...d, day } : d)))
  const choosePayer = useSheetChoice('recurring-payer', paidBy => setDraft(d => (d ? { ...d, paidBy } : d)))
  const chooseScope = useSheetChoice('recurring-scope', scope => setDraft(d => (d ? { ...d, scope } : d)))

  const open = (e?: Recurring) => {
    const target = e ? e.id : 'new'
    if (editing === target) { setEditing(null); return }
    setNote(null)
    setEditing(target)
    setDraft({
      id: e?.id, label: e?.label ?? '', amount: e?.amount == null ? '' : String(e.amount), day: String(e?.day_of_month ?? 1),
      categoryId: e?.category_id ?? null, scope: e?.scope ?? 'household', paidBy: e?.paid_by ?? people.data?.[0]?.id ?? '', active: e?.active ?? true,
    })
  }

  const save = async () => {
    if (!draft) return
    const raw = draft.amount.trim()
    setBusy(true); setNote(null)
    try {
      await act('saveRecurring', {
        id: draft.id, label: draft.label, amount: raw === '' ? null : Number(raw), dayOfMonth: Number(draft.day),
        categoryId: draft.categoryId, scope: draft.scope, paidBy: draft.paidBy, active: draft.active,
      })
      setEditing(null); refreshSetup(qc, 'recurring')
    } catch (e) { setNote((e as Error).message) }
    setBusy(false)
  }
  const remove = (e: Recurring) => Alert.alert(`Delete ${e.label}?`, undefined, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => {
      setBusy(true)
      try { await act('removeRecurring', { id: e.id }); setEditing(null); refreshSetup(qc, 'recurring') }
      catch (err) { setNote((err as Error).message) }
      setBusy(false)
    } },
  ])
  const runNow = async () => {
    setBusy(true); setNote(null)
    try { const r = await act<{ note?: string }>('runRecurring'); setNote(r.note ?? null); refreshSetup(qc, 'recurring') }
    catch (e) { setNote((e as Error).message) }
    setBusy(false)
  }

  const form = draft && (
    <View style={{ gap: 10, marginTop: 12 }}>
      <TextInput value={draft.label} onChangeText={v => setDraft({ ...draft, label: v })} placeholder="What is it" placeholderTextColor={C.text3} style={input()} />
      <TextInput value={draft.amount} onChangeText={v => setDraft({ ...draft, amount: v })} placeholder="Amount, blank if it varies" placeholderTextColor={C.text3}
        keyboardType="decimal-pad" style={[input(), { fontVariant: ['tabular-nums'] }]} />
      <ChoiceRow label="Day of the month" value={draft.day} onPress={() => chooseDay({
        title: 'Day of the month', note: '1 to 28, so it falls in every month.', value: draft.day,
        options: DAYS.map(d => ({ value: d, label: d })),
      })} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable onPress={choose} style={[input(), { flex: 1 }]}>
          <Text style={{ color: draft.categoryId ? C.text : C.text2, fontSize: 16 }}>{label(draft.categoryId)} ▾</Text>
        </Pressable>
        {draft.categoryId !== null && (
          <Pressable onPress={() => setDraft({ ...draft, categoryId: null })} style={input()}><Text style={{ color: C.text2 }}>Clear</Text></Pressable>
        )}
      </View>
      <ChoiceRow label="Paid by" value={people.data?.find(p => p.id === draft.paidBy)?.name ?? 'Pick one'} muted={!draft.paidBy} onPress={() => choosePayer({
        title: 'Who pays', value: draft.paidBy, options: (people.data ?? []).map(p => ({ value: p.id, label: p.name })),
      })} />
      <ChoiceRow label="For" value={scopeLabel(draft.scope)} onPress={() => chooseScope({ title: 'Who it is for', options: SCOPES, value: draft.scope })} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: C.text, fontWeight: '600' }}>Active</Text>
        <Switch value={draft.active} onValueChange={v => setDraft({ ...draft, active: v })} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable onPress={save} disabled={busy} style={{ flex: 1, backgroundColor: C.accent, borderRadius: 12, padding: 12, alignItems: 'center', opacity: busy ? 0.5 : 1 }}>
          <Text style={{ color: C.accentText, fontWeight: '700' }}>{busy ? 'Saving' : 'Save'}</Text>
        </Pressable>
        <Pressable onPress={() => setEditing(null)} style={{ backgroundColor: C.raised, borderRadius: 12, padding: 12, paddingHorizontal: 18, alignItems: 'center' }}>
          <Text style={{ color: C.text, fontWeight: '600' }}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  )

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 80 }}
      keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={C.text2} />}>
      <Stack.Screen options={{ title: 'Recurring' }} />
      <Text style={{ color: C.text2 }}>What you expect to pay every month. Nothing here is booked as spending until the bank reports the payment.</Text>

      <Card>
        {entries.map((e, i) => (
          <View key={e.id} style={{ paddingVertical: 11, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontWeight: '600', opacity: e.active ? 1 : 0.5 }}>{e.label}</Text>
                <Text style={{ color: C.text2, fontSize: 12 }}>
                  day {e.day_of_month} · {label(e.category_id)}
                  {e.amount === null ? ` · varies${e.last_amount ? `, last ${inr(e.last_amount)}` : ', no amount yet'}` : ''}
                  {!e.active ? ' · paused' : ''}
                </Text>
              </View>
              <Text style={{ color: C.text, fontVariant: ['tabular-nums'], fontWeight: '600' }}>{e.amount === null ? 'varies' : inr(e.amount)}</Text>
              <Pressable onPress={() => open(e)} style={{ backgroundColor: C.raised, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 }}>
                <Text style={{ color: C.text, fontWeight: '600', fontSize: 13 }}>{editing === e.id ? 'Close' : 'Change'}</Text>
              </Pressable>
            </View>
            {editing === e.id && form}
            {editing === e.id && (
              <Pressable onPress={() => remove(e)} disabled={busy} style={{ alignSelf: 'flex-start', paddingVertical: 8 }}>
                <Text style={{ color: C.text2, fontWeight: '600' }}>Delete</Text>
              </Pressable>
            )}
          </View>
        ))}
        {entries.length === 0 && !q.isLoading && <Text style={{ color: C.text2 }}>{q.error ? (q.error as Error).message : 'Nothing set up yet.'}</Text>}
      </Card>

      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Pressable onPress={() => open()} style={{ backgroundColor: C.raised, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14 }}>
          <Text style={{ color: C.text, fontWeight: '600' }}>{editing === 'new' ? 'Cancel' : 'Add one'}</Text>
        </Pressable>
        <Pressable onPress={runNow} disabled={busy} style={{ backgroundColor: C.raised, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, opacity: busy ? 0.5 : 1 }}>
          <Text style={{ color: C.text, fontWeight: '600' }}>{busy ? 'Running' : 'Post anything due now'}</Text>
        </Pressable>
      </View>

      {editing === 'new' && <Card>{form}</Card>}
      {note && <Card><Label>Note</Label><Text style={{ color: C.text, marginTop: 6 }}>{note}</Text></Card>}
    </ScrollView>
  )
}
