import { useEffect, useMemo, useState } from 'react'
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { catTree } from '@lib/cats.ts'
import { PEOPLE, refreshAll, useCategories } from '@/lib/data'
import { supabase } from '@/lib/supabase'
import { act } from '@/lib/api'
import { dayLabel, scopeLabel, scopesOf, useCategoryChoice, useDateChoice, useSheetChoice } from '@/lib/choice'
import { CatIcon } from '@/components/CatIcon'
import { Card, ChoiceRow, CloseX, Label } from '@/components/ui'
import { C } from '@/theme'
import { useScreenReaderOff } from '@/lib/reader-off'
import { Platform } from 'react-native'
import { IS_DEMO } from '@/lib/variant'

// The cash payments that come up most, one tap each. Anything else is in the sheet.
const QUICK = ['Eating Out', 'Groceries', 'Taxi', 'Fuel', 'Gifts', 'Haircut', 'Parking', 'Beverages']
// Money in: Paid back, Refunds, Other income, Salary, Interest (category ids from db/023-income.sql).
const INCOME_QUICK = [70, 71, 72, 68, 69]
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫']
const SCOPES = scopesOf('household', 'claimable', 'investment')
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

/** Cash, which no bank will tell us about, and pasting a bank message. */
export default function Add() {
  const cats = useCategories()
  const qc = useQueryClient()
  const readerOff = useScreenReaderOff()
  const tree = useMemo(() => catTree(cats.data ?? []), [cats.data])
  const [amount, setAmount] = useState('')
  const [what, setWhat] = useState('')
  const [cat, setCat] = useState<number | null>(null)
  const [scope, setScope] = useState('household')
  // Spent, or cash received (files as income, for both of us).
  const [moneyIn, setMoneyIn] = useState(false)
  const [date, setDate] = useState(today())
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [pasted, setPasted] = useState('')
  const chooseCat = useCategoryChoice('add', setCat)
  const chooseScope = useSheetChoice('add-scope', setScope)
  const chooseDate = useDateChoice('add-date', setDate)
  // Who paid: the person signed in, unless changed in the sheet.
  const me = useQuery({
    queryKey: ['me-person'],
    queryFn: async () => {
      const { data: s } = await supabase.auth.getSession()
      const { data } = await supabase.from('people').select('id').eq('auth_uid', s.session?.user.id ?? '').maybeSingle()
      return (data?.id as string | undefined) ?? null
    },
    staleTime: Infinity,
  })
  const [payer, setPayer] = useState<string | null>(null)
  const paidBy = payer ?? me.data ?? null
  const choosePayer = useSheetChoice('add-payer', setPayer)

  const incomeQuick = INCOME_QUICK.map(id => (cats.data ?? []).find(c => c.id === id)).filter(Boolean) as { id: number; name: string }[]
  const quick = QUICK.map(n => (cats.data ?? []).find(c => c.name === n)).filter(Boolean) as { id: number; name: string }[]
  const press = (k: string) => { setMsg(null); setAmount(a => {
    if (k === '⌫') return a.slice(0, -1)
    if (k === '.' && a.includes('.')) return a
    if (a.includes('.') && a.split('.')[1].length >= 2) return a
    if (a.replace('.', '').length >= 9) return a
    return a === '0' && k !== '.' ? k : a + k
  }) }
  const shown = amount ? Number(amount).toLocaleString('en-IN', { maximumFractionDigits: 2 }) + (amount.endsWith('.') ? '.' : '') : '0'

  const add = async () => {
    if (!Number(amount) || !what.trim()) { setMsg('An amount and what it was.'); return }
    setBusy(true); setMsg(null)
    try {
      const merchant = what.trim()
      const r = await act<{ message?: string }>('addCash', { amount, merchant, category_id: cat ?? '', scope, occurred_on: date, paid_by: paidBy ?? '', direction: moneyIn ? 'credit' : 'debit' })
      const added = /added\.$/.test(r.message ?? '')
      setMsg(r.message ?? 'Added.')
      if (added) { setAmount(''); setWhat(''); setCat(null) }
      refreshAll(qc)
    } catch (e) { setMsg((e as Error).message) }
    setBusy(false)
  }
  const read = async () => {
    if (!pasted.trim()) return
    setBusy(true)
    try { const r = await act<{ message?: string }>('paste', { text: pasted }); Alert.alert('Read', r.message ?? 'Done'); setPasted(''); refreshAll(qc) }
    catch (e) { Alert.alert('Not read', (e as Error).message) }
    setBusy(false)
  }

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: C.text, fontSize: 34, fontWeight: '800' }}>Add</Text>
        {/* Cancel: drop what was typed and go back to Month. */}
        <CloseX label="Cancel" onPress={() => { setAmount(''); setWhat(''); setCat(null); setMsg(null); router.navigate('/') }} />
      </View>
      {/* Android: payments the readers missed are still in PhonePe's History. Loud while the reader is off. */}
      {Platform.OS === 'android' && !IS_DEMO && (
        <Pressable onPress={() => router.push('/import-history' as never)} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <Card style={{ gap: 4, borderWidth: readerOff ? 2 : 0, borderColor: C.caution }}>
            <Text style={{ color: C.text, fontSize: 16, fontWeight: '700' }}>
              {readerOff ? 'Payment reader is off. Add what you missed ›' : 'Missed a payment? Add it from a screenshot ›'}
            </Text>
            <Text style={{ color: C.text2, fontSize: 13 }}>
              {readerOff
                ? 'Open PhonePe, History, take a screenshot and share it to Household Expense Tracker. Payments made while it was off are added from it.'
                : 'Screenshot your PhonePe History and share it here. Payments already in the books are skipped.'}
            </Text>
          </Card>
        </Pressable>
      )}
      <Card style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', backgroundColor: C.raised, borderRadius: 12, padding: 3 }}>
          {([[false, 'Spent'], [true, 'Money in']] as const).map(([v, label]) => (
            <Pressable key={label} onPress={() => { setMoneyIn(v); setCat(null); setMsg(null) }}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10, backgroundColor: moneyIn === v ? C.bg : 'transparent' }}>
              <Text style={{ color: moneyIn === v ? C.text : C.text2, fontWeight: '700' }}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={{ color: C.text, fontSize: 48, fontWeight: '800', textAlign: 'center', fontVariant: ['tabular-nums'] }}>₹{shown}</Text>
        <TextInput value={what} onChangeText={t => { setWhat(t); setMsg(null) }} onChange={e => { setWhat(e.nativeEvent.text); setMsg(null) }} placeholder={moneyIn ? "Who gave it, for example Cash from Amma" : "What was it, for example Auto to office"} placeholderTextColor={C.text3}
          style={{ backgroundColor: C.raised, color: C.text, borderRadius: 12, padding: 12, fontSize: 16 }} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {(moneyIn ? incomeQuick : quick).map(c => (
            <Pressable key={c.id} onPress={() => setCat(cat === c.id ? null : c.id)} style={{ width: '25%', alignItems: 'center', gap: 4, paddingVertical: 6, borderRadius: 12, backgroundColor: cat === c.id ? C.raised : 'transparent' }}>
              <CatIcon name={c.name} size={40} />
              <Text style={{ color: cat === c.id ? C.text : C.text2, fontSize: 11, fontWeight: '600' }}>{c.name}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={chooseCat} style={{ backgroundColor: C.raised, borderRadius: 12, padding: 12 }}>
          <Text style={{ color: cat ? C.text : C.text2, fontSize: 16 }}>{cat ? tree.label(cat) : moneyIn ? 'Another income type (Other income if you pick none)' : 'Other category, or leave it for Review'}</Text>
        </Pressable>
        <View style={{ gap: 8 }}>
          <ChoiceRow label="Date" value={date === today() ? 'Today' : dayLabel(date)} onPress={() => chooseDate(date, 'Date of the payment')} />
          <ChoiceRow label="For" value={scopeLabel(scope)} onPress={() => chooseScope({ title: 'Who it is for', options: SCOPES, value: scope })} />
          <ChoiceRow label={moneyIn ? "Received by" : "Paid by"} value={paidBy ? PEOPLE[paidBy] ?? 'You' : 'You'} onPress={() => choosePayer({
            title: 'Who paid', value: paidBy,
            options: Object.entries(PEOPLE).sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label })),
          })} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {KEYS.map(k => (
            <Pressable key={k} onPress={() => press(k)} style={({ pressed }) => ({ width: '31.5%', paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: pressed ? C.line : C.raised })}>
              <Text style={{ color: C.text, fontSize: 22, fontWeight: '600' }}>{k}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={add} disabled={busy || !Number(amount)} style={{ backgroundColor: C.accent, borderRadius: 14, padding: 15, alignItems: 'center', opacity: busy || !Number(amount) ? 0.5 : 1 }}>
          <Text style={{ color: C.accentText, fontWeight: '800', fontSize: 16 }}>{busy ? 'Adding' : Number(amount) ? (moneyIn ? `Add ₹${shown} received` : `Add ₹${shown}`) : 'Type an amount'}</Text>
        </Pressable>
        {msg && <Text style={{ color: C.text2, textAlign: 'center' }}>{msg}</Text>}
      </Card>

      <Pressable onPress={() => router.push('/plans')}>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.text, fontSize: 16, fontWeight: '600' }}>Plan a payment</Text>
            <Text style={{ color: C.text2, fontSize: 12 }}>About to pay something that covers more than one thing? It splits itself when it arrives.</Text>
          </View>
          <Text style={{ color: C.text3, fontSize: 20 }}>›</Text>
        </Card>
      </Pressable>

      <Card style={{ gap: 10 }}>
        <Label>Paste a bank message</Label>
        <TextInput value={pasted} onChangeText={setPasted} multiline placeholder="Paste one or more bank texts or emails" placeholderTextColor={C.text3}
          style={{ backgroundColor: C.raised, color: C.text, borderRadius: 12, padding: 12, minHeight: 90, fontSize: 15 }} />
        <Pressable onPress={read} disabled={busy || !pasted.trim()} style={{ backgroundColor: C.raised, borderRadius: 12, padding: 12, alignItems: 'center', opacity: pasted.trim() ? 1 : 0.5 }}>
          <Text style={{ color: C.text, fontWeight: '700' }}>Read it</Text>
        </Pressable>
      </Card>
    </ScrollView>
  )
}
