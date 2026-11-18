import { useEffect, useMemo, useState } from 'react'
import { EMPLOYER } from '@/lib/variant'
import { Alert, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native'
import { Stack, router, useLocalSearchParams } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { catTree } from '@lib/cats.ts'
import { SAM, ALEX, checkRule, describeRule, matchLabel, type MatchType, type RuleFields } from '@lib/rules.ts'
import { PEOPLE, useCategories } from '@/lib/data'
import { act } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { refreshSetup, useRules } from '@/lib/setup-data'
import { SCOPE_OPTIONS, scopeLabel, useCategoryChoice, useSheetChoice } from '@/lib/choice'
import { Card, ChoiceRow, Label, Pills, inr } from '@/components/ui'
import { C } from '@/theme'

type Preview = {
  count: number; waiting: number; error?: string
  examples: { id: string; merchant: string | null; occurred_on: string; amount: number; direction: string; category_id: number | null; status: string }[]
}

const PAYERS = [
  { value: 'either', label: 'Either of us', hint: 'The rule works for both of you.' },
  { value: ALEX, label: PEOPLE[ALEX], hint: `Only payments ${PEOPLE[ALEX]} made.` },
  { value: SAM, label: PEOPLE[SAM], hint: `Only payments ${PEOPLE[SAM]} made.` },
]
const payerLabel = (v: string | null) => PAYERS.find(p => p.value === (v ?? 'either'))?.label ?? 'Either of us'
const MATCHES: [MatchType, string][] = [['exact', 'Is exactly'], ['starts', 'Starts with'], ['contains', 'Contains']]
const DIRECTIONS: ['debit' | 'credit' | null, string][] = [['debit', 'Money out'], ['credit', 'Money in'], [null, 'Either']]

/** Rupees typed by hand, or null when the box is empty. */
const rupees = (s: string) => (s.trim() === '' ? null : Number(s.replace(/[,\s₹]/g, '')))
const short = (iso: string) => new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })

/**
 * The rule builder. WHEN the payee matches (and any extra conditions hold),
 * THEN file it this way. Opened empty from +, filled from a rule in the
 * list (`id`), or filled from a payment (`from`, its id).
 */
export default function RuleBuilder() {
  const { id, from } = useLocalSearchParams<{ id?: string; from?: string }>()
  const qc = useQueryClient()
  const rules = useRules()
  const cats = useCategories()
  const tree = useMemo(() => catTree(cats.data ?? []), [cats.data])
  const editing = id ? rules.data?.find(r => String(r.id) === id) ?? null : null
  const payment = useQuery({
    queryKey: ['rule-from', from],
    enabled: !!from,
    queryFn: async () => {
      const { data, error } = await supabase.from('transactions')
        .select('id, merchant, merchant_key, merchant_raw, amount, paid_by, direction, category_id, scope').eq('id', from!).maybeSingle()
      if (error) throw error
      return data
    },
  })

  const [text, setText] = useState('')
  const [matchType, setMatchType] = useState<MatchType>('contains')
  const [min, setMin] = useState('')
  const [max, setMax] = useState('')
  const [paidBy, setPaidBy] = useState<string | null>(null)
  const [direction, setDirection] = useState<'debit' | 'credit' | null>('debit')
  const [cat, setCat] = useState<number | null>(null)
  const [scope, setScope] = useState('household')
  const [showAs, setShowAs] = useState('')
  const [auto, setAuto] = useState(true)
  const [more, setMore] = useState(false)
  const [applyPast, setApplyPast] = useState(false)
  const [includeFiled, setIncludeFiled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [filled, setFilled] = useState(false)

  // Fill the form once, from the rule or the payment it was opened with.
  useEffect(() => {
    if (filled) return
    if (editing) {
      setText(editing.match_key); setMatchType(editing.match_type ?? 'exact')
      setMin(editing.min_amount == null ? '' : String(editing.min_amount))
      setMax(editing.max_amount == null ? '' : String(editing.max_amount))
      setPaidBy(editing.paid_by); setDirection(editing.direction)
      setCat(editing.category_id); setScope(editing.default_scope)
      setShowAs(editing.merchant ?? ''); setAuto(!editing.ask)
      setMore(editing.min_amount != null || editing.max_amount != null || !!editing.paid_by || editing.direction !== null)
      setFilled(true)
    } else if (payment.data) {
      const p = payment.data
      // A payment with a cleaned payee key gets an "is exactly" rule on it,
      // the same thing filing it in Review writes. Without one, the bank's
      // own words with "contains".
      if (p.merchant_key) { setText(p.merchant_key); setMatchType('exact') }
      else { setText((p.merchant_raw ?? p.merchant ?? '').toUpperCase()); setMatchType('contains') }
      setDirection(p.direction === 'credit' ? 'credit' : 'debit')
      setCat(p.category_id); setScope(p.scope ?? 'household'); setShowAs(p.merchant ?? '')
      setFilled(true)
    } else if (!id && !from) setFilled(true)
  }, [editing, payment.data, filled, id, from])

  const chooseCat = useCategoryChoice('rule-builder', setCat)
  const chooseScope = useSheetChoice('rule-builder-scope', setScope)
  const choosePayer = useSheetChoice('rule-builder-payer', v => setPaidBy(v === 'either' ? null : v))

  const fields: RuleFields = {
    text, matchType, minAmount: rupees(min), maxAmount: rupees(max), paidBy, direction,
    categoryId: cat, scope, showAs: showAs.trim() || null, ask: !auto,
  }
  const noCategoryOk = scope === 'investment' || scope === 'transfer'

  // The preview follows the WHEN half, half a second after typing stops.
  const when = { text: text.trim(), matchType, minAmount: fields.minAmount, maxAmount: fields.maxAmount, paidBy, direction, scope }
  const whenKey = JSON.stringify(when)
  const [settled, setSettled] = useState(whenKey)
  useEffect(() => { const t = setTimeout(() => setSettled(whenKey), 500); return () => clearTimeout(t) }, [whenKey])
  const preview = useQuery({
    queryKey: ['rule-preview', settled],
    enabled: filled && JSON.parse(settled).text.length > 0,
    queryFn: async (): Promise<Preview> => {
      try { return await act<Preview>('previewRule', JSON.parse(settled)) }
      catch (e) { return { count: 0, waiting: 0, examples: [], error: (e as Error).message } }
    },
  })

  const summary = describeRule({
    id: 0, match_key: text.trim().toUpperCase() || '...', match_type: matchType, min_amount: fields.minAmount, max_amount: fields.maxAmount,
    paid_by: paidBy, direction, merchant: null, category_id: cat, default_scope: scope, ask: !auto,
  }, tree.label(cat) || 'pick a category')

  const save = async () => {
    setProblem(null)
    if ((min.trim() && !isFinite(Number(fields.minAmount))) || (max.trim() && !isFinite(Number(fields.maxAmount)))) {
      setProblem('Amounts must be numbers of rupees, like 500.'); return
    }
    const checked = checkRule(fields)
    if ('error' in checked) { setProblem(checked.error); return }
    setBusy(true)
    try {
      const r = editing
        ? await act<{ ok?: boolean; id?: number }>('saveRule', { ...fields, id: editing.id })
        : await act<{ ok?: boolean; id?: number }>('createRule', { ...fields })
      const ruleId = editing?.id ?? r.id
      let note = 'Saved.'
      if (applyPast && ruleId) {
        const a = await act<{ changed?: number }>('applyRuleToPast', { id: ruleId, includeFiled })
        const n = a.changed ?? 0
        note = n ? `Saved, and ${n} past payment${n === 1 ? '' : 's'} filed by it.` : 'Saved. No past payments needed changing.'
      }
      refreshSetup(qc, 'rules')
      qc.invalidateQueries({ queryKey: ['rule-preview'] })
      setBusy(false)
      Alert.alert(note, undefined, [{ text: 'OK', onPress: () => router.back() }])
    } catch (e) {
      setProblem((e as Error).message); setBusy(false)
    }
  }

  const remove = () => editing && Alert.alert('Delete this rule?', 'Everything already filed with it stays as it is.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => {
      try { await act('deleteRule', { id: editing.id }); refreshSetup(qc, 'rules'); router.back() }
      catch (e) { setProblem((e as Error).message) }
    } },
  ])

  if (id && !editing) {
    return <View style={{ flex: 1, backgroundColor: C.bg, padding: 20 }}><Text style={{ color: C.text2 }}>{rules.isLoading ? 'Loading' : 'That rule is gone. It may have been deleted.'}</Text></View>
  }

  const pv = preview.data
  const input = { color: C.text, fontSize: 17, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: C.raised, borderRadius: 12 } as const

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 80 }}
      contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <Stack.Screen options={{ title: editing ? 'Rule' : 'New rule' }} />

      <Card style={{ gap: 10 }}>
        <Label>When the payee</Label>
        <Pills options={MATCHES} value={matchType} onChange={setMatchType} />
        <TextInput value={text} onChangeText={setText} autoCapitalize="characters" autoCorrect={false}
          placeholder={matchType === 'exact' ? 'The payee exactly, e.g. ZEPTO MARKETPLACE' : 'Part of the payee, e.g. ZEPTO'}
          placeholderTextColor={C.text3} style={input} />
        <Text style={{ color: C.text2, fontSize: 13 }}>
          {matchType === 'exact'
            ? 'Matches the cleaned payee name exactly, the way rules from Review do.'
            : `${matchLabel(matchType)} these letters, in any case, in the payee name or the bank's own wording.`}
        </Text>
        {payment.data?.merchant_raw && payment.data.merchant_raw.toUpperCase() !== text.trim().toUpperCase() ? (
          <Text style={{ color: C.text3, fontSize: 12 }}>The bank wrote: {payment.data.merchant_raw}</Text>
        ) : null}

        <Pressable onPress={() => setMore(m => !m)} hitSlop={6} style={{ paddingVertical: 4 }}>
          <Text style={{ color: C.text, fontWeight: '600' }}>{more ? 'Fewer conditions ▴' : 'More conditions ▾'}</Text>
        </Pressable>
        {more && (
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ color: C.text2, fontSize: 13 }}>Amount at least</Text>
                <TextInput value={min} onChangeText={setMin} keyboardType="decimal-pad" placeholder="Any" placeholderTextColor={C.text3} style={input} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ color: C.text2, fontSize: 13 }}>Amount at most</Text>
                <TextInput value={max} onChangeText={setMax} keyboardType="decimal-pad" placeholder="Any" placeholderTextColor={C.text3} style={input} />
              </View>
            </View>
            <ChoiceRow label="Paid by" value={payerLabel(paidBy)} onPress={() => choosePayer({ title: 'Paid by', options: PAYERS, value: paidBy ?? 'either' })} />
            <Text style={{ color: C.text2, fontSize: 13 }}>Money</Text>
            <Pills options={DIRECTIONS} value={direction} onChange={setDirection} />
            {payment.data ? (
              <Text style={{ color: C.text3, fontSize: 12 }}>
                This payment: {inr(Number(payment.data.amount))}, {payment.data.direction === 'credit' ? 'money in' : 'money out'}, paid by {payerLabel(payment.data.paid_by)}
              </Text>
            ) : null}
          </View>
        )}
      </Card>

      <Card style={{ gap: 10 }}>
        <Label>Then</Label>
        <ChoiceRow label="Category" value={tree.label(cat) || (noCategoryOk ? 'None needed' : 'Pick one')} muted={!cat} onPress={chooseCat} />
        {cat !== null && noCategoryOk ? (
          <Pressable onPress={() => setCat(null)} hitSlop={6} style={{ alignSelf: 'flex-start' }}>
            <Text style={{ color: C.text2, fontSize: 13, fontWeight: '600' }}>Clear the category</Text>
          </Pressable>
        ) : null}
        <ChoiceRow label="For" value={scopeLabel(scope)} onPress={() => chooseScope({ title: 'Who it is for', note: 'Payments this rule matches are filed this way.', options: SCOPE_OPTIONS, value: scope })} />
        <View style={{ gap: 4 }}>
          <Text style={{ color: C.text2, fontSize: 13 }}>Show it as</Text>
          <TextInput value={showAs} onChangeText={setShowAs} placeholder="Leave blank to keep each payment's own name" placeholderTextColor={C.text3} style={input} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.text, fontSize: 16 }}>File it automatically</Text>
            <Text style={{ color: C.text2, fontSize: 13 }}>{auto ? 'Filed straight away, no Review.' : 'Category filled in, but it still waits in Review for you to confirm.'}</Text>
          </View>
          <Switch value={auto} onValueChange={setAuto} />
        </View>
      </Card>

      <Card style={{ gap: 8 }}>
        <Text style={{ color: C.text, fontWeight: '600' }}>{summary}</Text>
        {!filled || !text.trim() ? (
          <Text style={{ color: C.text2 }}>Type the payee text to see which past payments it matches.</Text>
        ) : preview.isFetching && !pv ? (
          <Text style={{ color: C.text2 }}>Looking through past payments</Text>
        ) : pv?.error ? (
          <Text style={{ color: C.text2 }}>{pv.error}</Text>
        ) : pv ? (
          <>
            <Text style={{ color: C.text2 }}>
              Matches {pv.count} past payment{pv.count === 1 ? '' : 's'}{pv.count ? `, ${pv.waiting} still waiting in Review or with no category` : ''}.
            </Text>
            {pv.examples.map(x => (
              <Pressable key={x.id} onPress={() => router.push(`/t/${x.id}`)} style={({ pressed }) => ({ flexDirection: 'row', gap: 10, paddingVertical: 6, borderTopWidth: 1, borderTopColor: C.line, opacity: pressed ? 0.6 : 1 })}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: C.text }} numberOfLines={1}>{x.merchant ?? 'No name'}</Text>
                  <Text style={{ color: C.text2, fontSize: 12 }} numberOfLines={1}>
                    {short(x.occurred_on)} · {tree.label(x.category_id) || 'No category'}{x.status === 'review' ? ' · in Review' : ''}
                  </Text>
                </View>
                <Text style={{ color: x.direction === 'credit' ? C.positive : C.text, fontVariant: ['tabular-nums'] }}>{x.direction === 'credit' ? '+' : ''}{inr(x.amount)}</Text>
                <Text style={{ color: C.text3, fontSize: 18 }}>›</Text>
              </Pressable>
            ))}
          </>
        ) : null}
      </Card>

      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.text, fontSize: 16 }}>Apply to past payments too</Text>
            <Text style={{ color: C.text2, fontSize: 13 }}>Files the ones still in Review or with no category. Transfers between you, {EMPLOYER} claims and investments are left alone unless this rule files as one.</Text>
          </View>
          <Switch value={applyPast} onValueChange={setApplyPast} />
        </View>
        {applyPast && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontSize: 16 }}>Including ones already filed</Text>
              <Text style={{ color: C.text2, fontSize: 13 }}>Also changes past payments you already gave a category.</Text>
            </View>
            <Switch value={includeFiled} onValueChange={setIncludeFiled} />
          </View>
        )}
      </Card>

      {problem && <Text style={{ color: C.negative }}>{problem}</Text>}
      <Pressable onPress={save} disabled={busy || !filled} style={{ backgroundColor: C.accent, borderRadius: 12, padding: 14, alignItems: 'center', opacity: busy || !filled ? 0.5 : 1 }}>
        <Text style={{ color: C.accentText, fontWeight: '700', fontSize: 16 }}>{busy ? 'Saving' : 'Save rule'}</Text>
      </Pressable>
      {editing && (
        <Pressable onPress={remove} style={{ alignSelf: 'center', paddingVertical: 6 }}>
          <Text style={{ color: C.text2, fontWeight: '600' }}>Delete this rule</Text>
        </Pressable>
      )}
    </ScrollView>
  )
}
