import { useMemo, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View, type TextStyle } from 'react-native'
import { Stack, router } from 'expo-router'
import { catTree } from '@lib/cats.ts'
import { SALARY_KIND, fyOf, fyLabel, fyMonths, fyRange, monthlyTaxOn, rateFor, summarise } from '@lib/tax.ts'
import { act } from '@/lib/api'
import { PEOPLE, useCategories, useTax } from '@/lib/data'
import { Bars, type Bar } from '@/components/Bars'
import { CatIcon } from '@/components/CatIcon'
import { Card, Label, Pills, inr, AmountShare } from '@/components/ui'
import { C } from '@/theme'
import { openAll } from '@/lib/nav'

const today = new Date().toISOString().slice(0, 10)
/** Lakhs once a figure would wrap a table column: Rs 11,00,000 shows as ₹11.0L. */
const short = (n: number) => (Math.abs(n) >= 100000 ? `₹${(n / 100000).toFixed(2)}L` : inr(n))

/** Tax paid, by financial year: the total, month by month, by kind, and every
 *  year split by who paid. Each figure opens the payments behind it. */
export default function Tax() {
  const q = useTax()
  const cats = useCategories()
  const tree = useMemo(() => catTree(cats.data ?? []), [cats.data])
  const [fy, setFy] = useState(fyOf(today))
  const [who, setWho] = useState<string | null>(null)
  const rows = q.data?.rows ?? []
  const s = summarise(rows, fy, who)
  const range = fyRange(fy)
  const rootId = q.data?.rootId ?? null
  const rentTds = (q.data?.rentTds ?? []).filter(r => fyOf(r.occurred_on) === fy && (!who || r.paid_by === who))
  const rentTdsTotal = rentTds.reduce((a, r) => a + Number(r.amount), 0)
  const people = Object.entries(PEOPLE).sort((a, b) => a[1].localeCompare(b[1]))
  const atEnd = fy >= fyOf(today)
  const fromSalary = rows.filter(r => r.category_id === SALARY_KIND && fyOf(r.occurred_on) === fy && (!who || r.paid_by === who)).reduce((a, r) => a + Number(r.amount), 0)
  const fromAccounts = s.total - fromSalary
  const salaryCatId = tree.roots().length ? (cats.data ?? []).find(c => c.name === 'Salary')?.id ?? null : null

  const bars: Bar[] = fyMonths(fy).map(k => ({
    key: k, label: 'JFMAMJJASOND'[Number(k.slice(5, 7)) - 1], value: s.byMonth[k] ?? 0, future: `${k}-01` > today,
  }))
  const kinds = Object.entries(s.byKind).sort((a, b) => b[1] - a[1])
  const head: TextStyle = { color: C.text3, fontSize: 11, textAlign: 'right' }
  const num: TextStyle = { color: C.text, textAlign: 'right', fontVariant: ['tabular-nums'] }

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 80 }}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={C.text2} />}>
      <Stack.Screen options={{ title: 'Tax paid' }} />
      <Pills options={[[null, 'Household'], ...people] as [string | null, string][]} value={who} onChange={setWho} />

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable onPress={() => setFy(fy - 1)} hitSlop={12} style={{ padding: 10, backgroundColor: C.card, borderRadius: 12 }}><Text style={{ color: C.text, fontSize: 18 }}>‹</Text></Pressable>
        <Text style={{ color: C.text, fontSize: 18, fontWeight: '700' }}>{fyLabel(fy)}</Text>
        <Pressable disabled={atEnd} onPress={() => setFy(fy + 1)} hitSlop={12} style={{ padding: 10, backgroundColor: C.card, borderRadius: 12, opacity: atEnd ? 0.3 : 1 }}><Text style={{ color: C.text, fontSize: 18 }}>›</Text></Pressable>
      </View>

      <Pressable disabled={!rootId} onPress={() => openAll({ ...range, who, dir: 'debit', cat: rootId })} style={({ pressed }) => ({ alignItems: 'center', gap: 4, opacity: pressed ? 0.6 : 1 })}>
        <CatIcon name="Tax" size={44} />
        <Text style={{ color: C.text, fontSize: 40, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{inr(s.total)}</Text>
        <Text style={{ color: C.text2, textAlign: 'center' }}>{inr(fromSalary)} taken from salaries · {inr(fromAccounts)} paid from your accounts ›</Text>
      </Pressable>

      <Card>
        <Bars bars={bars} color={C.accent} height={110} onPress={b => rootId && openAll({ m: b.key, who, dir: 'debit', cat: rootId })} />
      </Card>

      {kinds.length > 0 && (
        <Card style={{ gap: 10 }}>
          <Label>By kind</Label>
          {kinds.map(([id, v]) => {
            const name = q.data?.names?.[Number(id)] ?? tree.get(Number(id))?.name ?? 'Tax'
            return (
              <Pressable key={id} onPress={() => Number(id) === SALARY_KIND ? openAll({ ...range, who, dir: 'credit', cat: salaryCatId }) : openAll({ ...range, who, dir: 'debit', cat: Number(id), exact: true })}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, opacity: pressed ? 0.6 : 1 })}>
                <CatIcon name={name} group="Tax" size={30} />
                <Text style={{ color: C.text, flex: 1, fontWeight: '600' }}>{name}</Text>
                <AmountShare v={v} of={s.total} />
                <Text style={{ color: C.text3, fontSize: 18 }}>›</Text>
              </Pressable>
            )
          })}
        </Card>
      )}

      <Card style={{ gap: 2 }}>
        <Label>Year by year, by who paid</Label>
        <View style={{ flexDirection: 'row', paddingVertical: 6 }}>
          <Text style={[head, { flex: 1.2, textAlign: 'left' }]}>YEAR</Text>
          {people.map(([, n]) => <Text key={n} style={[head, { flex: 1 }]}>{n.toUpperCase()}</Text>)}
          <Text style={[head, { flex: 1.1 }]}>HOUSEHOLD</Text>
        </View>
        {s.yearList.map(({ fy: y, split }) => (
          <Pressable key={y} onPress={() => setFy(y)} style={({ pressed }) => ({ flexDirection: 'row', paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.line, opacity: pressed ? 0.6 : 1 })}>
            <Text style={{ color: C.text, flex: 1.2, fontWeight: y === fy ? '700' : '400' }}>{fyLabel(y).slice(3)}</Text>
            {people.map(([pid]) => <Text key={pid} style={[num, { flex: 1, color: split[pid] ? C.text : C.text3, fontWeight: y === fy ? '700' : '400' }]}>{short(split[pid] ?? 0)}</Text>)}
            <Text style={[num, { flex: 1.1, fontWeight: y === fy ? '700' : '400' }]}>{short(split.all)}</Text>
          </Pressable>
        ))}
        {s.yearList.length === 0 && !q.isLoading && <Text style={{ color: C.text2 }}>{q.error ? (q.error as Error).message : 'No tax payments yet.'}</Text>}
      </Card>

      <Salaries rates={q.data?.rates ?? []} onSaved={() => q.refetch()} />

      {rentTdsTotal > 0 && (
        <Pressable onPress={() => openAll({ ...range, who, dir: 'debit', q: 'TDS on' })} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <Card style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Label>Also sent to the tax office</Label>
              <Text style={{ color: C.text, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{inr(rentTdsTotal)} ›</Text>
            </View>
            <Text style={{ color: C.text2, fontSize: 13 }}>TDS on the rent. It is the landlord's tax, paid out of the rent, so it counts in Rent, not above.</Text>
          </Card>
        </Pressable>
      )}

      <Text style={{ color: C.text3, fontSize: 12 }}>
        Tax taken from salaries is counted for each month a salary arrived, at the rate under Salaries: your payslip's figure where there is one, otherwise worked out from the yearly salary under the new regime. Tax paid from your accounts is advance tax, self-assessment and filing fees.
      </Text>
      {rootId !== null && (
        <Pressable onPress={() => router.push({ pathname: '/c/[id]', params: { id: String(rootId) } })}>
          <Text style={{ color: C.text2, fontWeight: '600' }}>Tax as a category ›</Text>
        </Pressable>
      )}
    </ScrollView>
  )
}

type Rate = { person_id: string; from_month: string; monthly_tax: number | string; basis: string; annual_salary: number | string | null }
const thisMonth = today.slice(0, 7)
const lakh = (n: number) => `Rs ${(n / 100000).toLocaleString('en-IN', { maximumFractionDigits: 2 })}L`

/** Each person's salary and the tax taken from it, with a form to change it
 *  from any month on. */
function Salaries({ rates, onSaved }: { rates: Rate[]; onSaved: () => void }) {
  const people = Object.entries(PEOPLE).sort((a, b) => a[1].localeCompare(b[1]))
  const [open, setOpen] = useState<string | null>(null)
  const [salary, setSalary] = useState('')
  const [from, setFrom] = useState(thisMonth)
  const [payslip, setPayslip] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const input = { backgroundColor: C.raised, color: C.text, borderRadius: 10, padding: 10, fontSize: 16 } as const
  const annual = Number(salary.replace(/[^\d.]/g, ''))
  const start = (pid: string) => {
    const r = rateFor(rates as never, pid, thisMonth)
    setOpen(open === pid ? null : pid); setSalary(r?.annual_salary ? String(Number(r.annual_salary)) : ''); setFrom(thisMonth); setPayslip(''); setMsg(null)
  }
  const save = async () => {
    if (!open) return
    if (!(annual > 0)) { setMsg('Give the yearly salary before tax, in rupees.'); return }
    if (!/^\d{4}-\d{2}$/.test(from)) { setMsg('Start month as 2026-10.'); return }
    setSaving(true); setMsg(null)
    try {
      await act('setSalary', { personId: open, fromMonth: from, annualSalary: annual, monthlyTax: payslip.trim() === '' ? null : Number(payslip.replace(/[^\d.]/g, '')) })
      setOpen(null); onSaved()
    } catch (e) { setMsg((e as Error).message) }
    setSaving(false)
  }
  return (
    <Card style={{ gap: 10 }}>
      <Label>Salaries</Label>
      {people.map(([pid, name]) => {
        const r = rateFor(rates as never, pid, thisMonth) as Rate | null
        return (
          <View key={pid} style={{ gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.line }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontWeight: '700' }}>{name}{r?.annual_salary ? ` · ${lakh(Number(r.annual_salary))} a year` : ''}</Text>
                <Text style={{ color: C.text2, fontSize: 12, marginTop: 2 }}>{r ? `${inr(Number(r.monthly_tax))} tax a month · ${r.basis} · from ${r.from_month}` : 'No salary set'}</Text>
              </View>
              <Pressable onPress={() => start(pid)} style={{ backgroundColor: C.raised, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 }}>
                <Text style={{ color: C.text, fontWeight: '600', fontSize: 13 }}>{open === pid ? 'Close' : 'Update'}</Text>
              </Pressable>
            </View>
            {open === pid && (
              <View style={{ gap: 8 }}>
                <Text style={{ color: C.text2, fontSize: 12 }}>Yearly salary before tax, in rupees</Text>
                <TextInput value={salary} onChangeText={setSalary} keyboardType="number-pad" placeholder="8100000" placeholderTextColor={C.text3} style={input} />
                <Text style={{ color: C.text2, fontSize: 12 }}>From which month</Text>
                <TextInput value={from} onChangeText={setFrom} placeholder="2026-10" placeholderTextColor={C.text3} autoCapitalize="none" style={input} />
                <Text style={{ color: C.text2, fontSize: 12 }}>Tax on the payslip a month, if you have it (leave empty to work it out)</Text>
                <TextInput value={payslip} onChangeText={setPayslip} keyboardType="number-pad" placeholder={annual > 0 ? String(monthlyTaxOn(annual)) : ''} placeholderTextColor={C.text3} style={input} />
                {annual > 0 && payslip.trim() === '' && <Text style={{ color: C.text2, fontSize: 13 }}>Worked out: {inr(monthlyTaxOn(annual))} a month under the new regime.</Text>}
                <Pressable onPress={save} disabled={saving} style={{ backgroundColor: C.accent, borderRadius: 12, padding: 12, alignItems: 'center', opacity: saving ? 0.5 : 1 }}>
                  <Text style={{ color: C.accentText, fontWeight: '700' }}>{saving ? 'Saving' : 'Save'}</Text>
                </Pressable>
                {msg && <Text style={{ color: C.negative }}>{msg}</Text>}
              </View>
            )}
          </View>
        )
      })}
    </Card>
  )
}
