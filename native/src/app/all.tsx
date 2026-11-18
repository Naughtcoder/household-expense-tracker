import { useMemo, useState } from 'react'
import { FlatList, Pressable, Text, TextInput, View } from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { catTree } from '@lib/cats.ts'
import { countsAsIncome, countsAsSpend } from '@lib/scope.ts'
import { PEOPLE, monthKeyOf, useCategories, useMonth, type Txn } from '@/lib/data'
import { supabase } from '@/lib/supabase'
import { TxnRow, dayLabel } from '@/components/TxnRow'
import { collapseSplits } from '@lib/splits.ts'
import { Card, Label, Pills, inr } from '@/components/ui'
import { C } from '@/theme'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const shift = (key: string, n: number) => { const [y, m] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7) }
const COLS = 'id, amount, direction, occurred_on, occurred_at, merchant, merchant_key, scope, status, category_id, paid_by, bank, account_tail, note, split_of, split_total, paid:people!transactions_paid_by_fkey(name)'
const isMonth = (s?: string) => !!s && /^\d{4}-\d{2}$/.test(s)
const isDay = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s)
const short = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

type Params = { m?: string; who?: string; dir?: string; cat?: string; exact?: string; scope?: string; q?: string; d?: string; from?: string; to?: string; acct?: string; bank?: string }

/** Every payment in a month, by day, with money out and in that leave
 *  transfers out. A search box finds any payment by payee, wording or amount.
 *
 *  Drill-downs open it narrowed, from the query string:
 *  m (YYYY-MM), who (person id), dir (debit: spending only, by the same rule
 *  as every total; credit: income only), cat (category id and everything
 *  under it, or "none" for no category; exact=1 for that category alone),
 *  scope, q (search), d (one day), from and to (a span of days), acct and
 *  bank (one account, all time). Each narrowing shows as a chip that can be
 *  taken off, so it is clear why the list is shorter. */
export default function Everything() {
  const p = useLocalSearchParams<Params>()
  // A link that lands on this screen while it is already open brings new
  // params; starting afresh keeps the filters in step with them.
  return <List key={JSON.stringify(p)} p={p} />
}

function List({ p }: { p: Params }) {
  const now = monthKeyOf()
  const [key, setKey] = useState(isMonth(p.m) ? p.m! : isDay(p.d) ? p.d!.slice(0, 7) : now)
  const [who, setWho] = useState<string | null>(p.who && PEOPLE[p.who] ? p.who : null)
  const [q, setQ] = useState(p.q ?? '')
  const [dir, setDir] = useState(p.dir === 'debit' || p.dir === 'credit' ? p.dir : '')
  const [cat, setCat] = useState(p.cat ?? '')
  const [exact, setExact] = useState(p.exact === '1')
  const [scope, setScope] = useState(p.scope ?? '')
  const [day, setDay] = useState(isDay(p.d) ? p.d! : '')
  const [range, setRange] = useState(isDay(p.from) && isDay(p.to) ? { from: p.from!, to: p.to! } : null)
  const [acct, setAcct] = useState(p.acct ? { tail: p.acct, bank: p.bank ?? '' } : null)

  const cats = useCategories()
  const tree = useMemo(() => catTree(cats.data ?? []), [cats.data])
  const term = q.trim()
  const mode = term.length >= 2 ? 'search' : acct ? 'acct' : range ? 'range' : 'month'
  const month = useMonth(key)
  const search = useQuery({
    queryKey: ['search', term],
    enabled: mode === 'search',
    queryFn: async () => {
      const amt = Number(term.replace(/[₹,\s]/g, ''))
      let query = supabase.from('transactions').select(COLS)
        .not('status', 'in', '(duplicate,ignored)').order('occurred_on', { ascending: false }).limit(200)
      query = Number.isFinite(amt) && amt > 0
        ? query.or(`amount.eq.${amt},amount.eq.${-amt}`)
        : query.or(`merchant.ilike.%${term.replace(/[%,()]/g, '')}%,merchant_raw.ilike.%${term.replace(/[%,()]/g, '')}%,note.ilike.%${term.replace(/[%,()]/g, '')}%`)
      const { data } = await query
      return (data ?? []) as unknown as Txn[]
    },
  })
  // A span of days (a week, a year) pages past the 1000-row cap.
  const spanQ = useQuery({
    queryKey: ['all-range', range?.from, range?.to],
    enabled: mode === 'range',
    queryFn: async () => {
      const all: Txn[] = []
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from('transactions').select(COLS)
          .gte('occurred_on', range!.from).lte('occurred_on', range!.to).neq('status', 'duplicate').neq('status', 'ignored')
          .order('occurred_on', { ascending: false }).order('occurred_at', { ascending: false, nullsFirst: false }).range(from, from + 999)
        if (error) throw error
        all.push(...((data ?? []) as unknown as Txn[]))
        if ((data ?? []).length < 1000) break
      }
      return all
    },
  })
  // One account, newest first, the latest 1000.
  const acctQ = useQuery({
    queryKey: ['all-acct', acct?.tail, acct?.bank],
    enabled: mode === 'acct',
    queryFn: async () => {
      let query = supabase.from('transactions').select(COLS).eq('account_tail', acct!.tail).neq('status', 'duplicate').neq('status', 'ignored')
      query = acct!.bank && acct!.bank !== 'Unknown' ? query.eq('bank', acct!.bank) : acct!.bank === 'Unknown' ? query.is('bank', null) : query
      const { data, error } = await query.order('occurred_on', { ascending: false }).limit(1000)
      if (error) throw error
      return (data ?? []) as unknown as Txn[]
    },
  })

  const source: Txn[] = mode === 'search' ? (search.data ?? []) : mode === 'acct' ? (acctQ.data ?? []) : mode === 'range' ? (spanQ.data ?? []) : (month.data ?? [])
  const family = useMemo(() => {
    if (!cat || cat === 'none') return null
    const id = Number(cat)
    return new Set(exact ? [id] : tree.family(id))
  }, [cat, exact, tree])
  const rows = source.filter(t =>
    (!who || t.paid_by === who)
    && (!day || t.occurred_on.slice(0, 10) === day)
    && (!cat || (cat === 'none' ? t.category_id == null : t.category_id != null && !!family?.has(t.category_id)))
    && (!scope || t.scope === scope)
    // With a scope chosen, the direction is taken as it is (claimable money
    // out, say); without one it follows the spending and income rules, so the
    // list adds up to the figure that was tapped.
    && (!dir || (scope ? t.direction === dir : dir === 'debit' ? countsAsSpend(t) : countsAsIncome(t))))
  // Narrowed to one kind (investments, transfers, claims), the totals are that
  // kind's money out and in; otherwise spending and income as on Month.
  const out = rows.filter(t => scope ? t.direction === 'debit' : countsAsSpend(t)).reduce((s, t) => s + Number(t.amount), 0)
  const inn = rows.filter(t => scope ? t.direction === 'credit' : countsAsIncome(t)).reduce((s, t) => s + Number(t.amount), 0)
  // A split payment shows once, at what the bank took; the totals above add up the parts.
  const shownRows = collapseSplits(rows)
  const [y, m] = key.split('-').map(Number)
  const loading = mode === 'search' ? search.isFetching : mode === 'acct' ? acctQ.isLoading : mode === 'range' ? spanQ.isLoading : month.isLoading

  const catName = cat === 'none' ? 'No category' : cat ? (exact ? `${tree.name(Number(cat)) ?? 'Category'}, not split further` : tree.label(Number(cat), ' › ') || 'Category') : ''
  const chips: [string, () => void][] = []
  if (acct) chips.push([`${acct.bank && acct.bank !== 'Unknown' ? acct.bank + ' ' : ''}···${acct.tail}`, () => setAcct(null)])
  if (range) chips.push([`${short(range.from)} to ${short(range.to)}`, () => setRange(null)])
  if (day) chips.push([short(day), () => setDay('')])
  if (dir) chips.push([dir === 'debit' ? (scope ? 'Money out' : 'Spending only') : (scope ? 'Money in' : 'Income only'), () => setDir('')])
  if (cat) chips.push([catName, () => { setCat(''); setExact(false) }])
  if (scope) chips.push([scope === 'claimable' ? 'Claimable' : scope === 'transfer' ? 'Transfers' : scope === 'investment' ? 'Investments' : 'Household', () => setScope('')])

  return (
    <FlatList
      style={{ backgroundColor: C.bg }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
      keyboardShouldPersistTaps="handled" data={shownRows} keyExtractor={t => t.id}
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: 6 }}>
          <Stack.Screen options={{ title: 'Everything' }} />
          <TextInput value={q} onChangeText={setQ} placeholder="Search a payee, a word, or an amount" placeholderTextColor={C.text3} clearButtonMode="while-editing"
            style={{ backgroundColor: C.card, color: C.text, borderRadius: 12, padding: 12, fontSize: 16 }} />
          {chips.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              <Text style={{ color: C.text2, fontSize: 13 }}>Showing only</Text>
              {chips.map(([label, off]) => (
                <Pressable key={label} onPress={off} accessibilityRole="button" accessibilityLabel={`Remove filter ${label}`}
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: C.raised, opacity: pressed ? 0.6 : 1 })}>
                  <Text style={{ color: C.text, fontWeight: '600', fontSize: 13 }}>{label}</Text>
                  <Text style={{ color: C.text3, fontSize: 13, fontWeight: '700' }}>✕</Text>
                </Pressable>
              ))}
            </View>
          )}
          {term.length < 2 && <>
            <Pills options={[[null, 'Household'], ...Object.entries(PEOPLE).sort((a, b) => a[1].localeCompare(b[1]))] as [string | null, string][]} value={who} onChange={setWho} />
            {mode === 'month' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Pressable onPress={() => { setKey(shift(key, -1)); setDay('') }} hitSlop={12} style={{ padding: 10, backgroundColor: C.card, borderRadius: 12 }}><Text style={{ color: C.text, fontSize: 18 }}>‹</Text></Pressable>
                <Text style={{ color: C.text, fontSize: 18, fontWeight: '700' }}>{MONTHS[m - 1]} {y}</Text>
                <Pressable disabled={key >= now} onPress={() => { setKey(shift(key, 1)); setDay('') }} hitSlop={12} style={{ padding: 10, backgroundColor: C.card, borderRadius: 12, opacity: key >= now ? 0.3 : 1 }}><Text style={{ color: C.text, fontSize: 18 }}>›</Text></Pressable>
              </View>
            )}
          </>}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Card style={{ flex: 1 }}><Label>Out</Label><Text style={{ color: C.text, fontSize: 18, fontWeight: '700', marginTop: 4 }}>{inr(out)}</Text></Card>
            <Card style={{ flex: 1 }}><Label>In</Label><Text style={{ color: C.positive, fontSize: 18, fontWeight: '700', marginTop: 4 }}>{inr(inn)}</Text></Card>
          </View>
          {term.length >= 2 && <Text style={{ color: C.text2 }}>{search.isFetching ? 'Searching' : `${shownRows.length} found${source.length === 200 ? ', the latest 200' : ''}`}</Text>}
          {mode === 'acct' && !loading && <Text style={{ color: C.text2 }}>{shownRows.length} payment{shownRows.length === 1 ? '' : 's'}{source.length === 1000 ? ', the latest 1000' : ''}</Text>}
        </View>
      }
      ListEmptyComponent={<Text style={{ color: C.text2, marginTop: 10 }}>{loading ? 'Loading' : 'Nothing matches.'}</Text>}
      renderItem={({ item, index }) => (
        <View>
          {(index === 0 || shownRows[index - 1].occurred_on !== item.occurred_on) && <Text style={{ color: C.text2, fontWeight: '600', marginTop: 12 }}>{dayLabel(item.occurred_on)}</Text>}
          <TxnRow t={item} tree={tree} />
        </View>
      )}
    />
  )
}
