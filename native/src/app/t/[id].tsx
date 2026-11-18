import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { catTree } from '@lib/cats.ts'
import { useQueryClient } from '@tanstack/react-query'
import { PEOPLE, refreshAll, useCategories, useSaveTxn, useTxn } from '@/lib/data'
import { SCOPE_OPTIONS, dayLabel, scopeLabel, useDateChoice, useSheetChoice } from '@/lib/choice'
import { CatIcon } from '@/components/CatIcon'
import { Card, ChoiceRow, Label, inr } from '@/components/ui'
import { C } from '@/theme'
import { PaymentExtras } from '@/components/PaymentExtras'
import { SplitCard } from '@/components/SplitCard'

/** One payment: what it was, its category (opens the sheet), who it is
 *  for, a note, and what the bank sent. */
export default function Payment() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const t = useTxn(id)
  const cats = useCategories()
  const save = useSaveTxn()
  const qc = useQueryClient()
  const tree = useMemo(() => catTree(cats.data ?? []), [cats.data])
  const [note, setNote] = useState('')
  const [merchant, setMerchant] = useState('')
  useEffect(() => { if (t.data) { setNote(t.data.note ?? ''); setMerchant(t.data.merchant ?? '') } }, [t.data?.id])
  // Who it is for and who paid open the choice sheet; the date opens the
  // calendar. Each saves as soon as it is chosen.
  const p0 = t.data
  const commit = (patch: Partial<{ scope: string; note: string | null; merchant: string | null; paid_by: string; occurred_on: string }>, everywhere = false) => {
    if (!p0) return
    save.mutate({ id: p0.id, category_id: p0.category_id, scope: p0.scope, note: p0.note ?? null, merchant: p0.merchant, ...patch },
      { onSuccess: () => { if (everywhere) refreshAll(qc) } })
  }
  const chooseScope = useSheetChoice(`txn-scope-${id}`, scope => { if (scope !== p0?.scope) commit({ scope }) })
  const choosePayer = useSheetChoice(`txn-payer-${id}`, paid_by => { if (paid_by !== p0?.paid_by) commit({ paid_by }, true) })
  const chooseDate = useDateChoice(`txn-date-${id}`, day => { if (day !== p0?.occurred_on.slice(0, 10)) commit({ occurred_on: day }, true) })

  if (!t.data) return <View style={{ flex: 1, backgroundColor: C.bg, padding: 20 }}><Text style={{ color: C.text2 }}>{t.isLoading ? 'Loading' : 'Not found'}</Text></View>
  const p = t.data

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, gap: 14 }} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled">
      <View style={{ alignItems: 'center', gap: 4, paddingVertical: 10 }}>
        <Text style={{ color: p.scope === 'transfer' ? C.text3 : p.direction === 'credit' ? C.positive : C.text, fontSize: 44, fontWeight: '800' }}>
          {p.direction === 'credit' ? '+' : ''}{inr(Number(p.split_total ?? p.amount))}
        </Text>
        <Text style={{ color: C.text2, textAlign: 'center' }}>
          {new Date(p.occurred_on.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
          {p.bank ? ` · ${p.bank}` : ''}{p.account_tail ? ` ···${p.account_tail}` : ''} · {PEOPLE[p.paid_by] ?? ''}
        </Text>
      </View>

      <SplitCard p={p} />

      <Card style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Label>Merchant</Label>
          {p.merchant_key ? <Pressable onPress={() => router.push({ pathname: '/m/[key]', params: { key: p.merchant_key! } })}><Text style={{ color: C.text2, fontSize: 13 }}>Every payment ›</Text></Pressable> : null}
        </View>
        <TextInput value={merchant} onChangeText={setMerchant} onEndEditing={() => { if (merchant !== (p.merchant ?? '')) commit({ merchant }) }}
          style={{ color: C.text, fontSize: 17, paddingVertical: 4 }} placeholderTextColor={C.text3} placeholder="Who was paid" />
        <Pressable onPress={() => router.push({ pathname: '/rule', params: { from: p.id } })} hitSlop={6} style={{ alignSelf: 'flex-start', paddingTop: 2 }}>
          <Text style={{ color: C.text2, fontSize: 13 }}>Make a rule from this ›</Text>
        </Pressable>
      </Card>

      <Pressable onPress={() => router.push({ pathname: '/pick', params: { txn: p.id } })}>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <CatIcon name={tree.name(p.category_id) ?? 'Uncategorised'} group={tree.root(p.category_id)?.name} size={40} />
            <View style={{ flex: 1 }}>
              <Label>{p.split_of || p.split_total != null ? 'Category of this part' : 'Category'}</Label>
              <Text style={{ color: C.text, fontSize: 17, marginTop: 2 }}>{tree.label(p.category_id) || 'Pick one'}</Text>
            </View>
            <Text style={{ color: C.text3, fontSize: 20 }}>›</Text>
          </Card>
      </Pressable>

      <Card style={{ gap: 8 }}>
        <ChoiceRow label="For" value={scopeLabel(p.scope)} onPress={() => chooseScope({ title: 'Who it is for', options: SCOPE_OPTIONS, value: p.scope })} />
        <ChoiceRow label="Paid by" value={PEOPLE[p.paid_by] ?? 'Someone else'} onPress={() => choosePayer({
          title: 'Who paid', value: p.paid_by,
          options: Object.entries(PEOPLE).sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label })),
        })} />
        <ChoiceRow label="Date" value={dayLabel(p.occurred_on)} onPress={() => chooseDate(p.occurred_on.slice(0, 10), 'Date of the payment')} />
      </Card>

      <Card style={{ gap: 6 }}>
        <Label>Note</Label>
        <TextInput value={note} onChangeText={setNote} multiline onEndEditing={() => { if (note !== (p.note ?? '')) commit({ note: note.trim() || null }) }}
          placeholder="What it was for, who it was with" placeholderTextColor={C.text3} style={{ color: C.text, fontSize: 16, minHeight: 44 }} />
      </Card>

      {save.isError && <Text style={{ color: C.negative }}>{(save.error as Error).message}</Text>}

      <PaymentExtras p={p} />

      {p.raw_text ? (
        <Card style={{ gap: 6 }}>
          <Label>What the bank sent</Label>
          <Text style={{ color: C.text2, fontFamily: 'Menlo', fontSize: 12 }}>{p.raw_text}</Text>
        </Card>
      ) : null}
    </ScrollView>
  )
}
