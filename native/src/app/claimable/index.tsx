import { useEffect, useMemo, useRef, useState } from 'react'
import { EMPLOYER } from '@/lib/variant'
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import { Stack, router, useLocalSearchParams } from 'expo-router'
import { catTree } from '@lib/cats.ts'
import { EXPENSECARD_CARD } from '@lib/card-rules.ts'
import { monthLabel } from '@lib/drill.ts'
import { lookFor } from '@lib/caticons.ts'
import { PEOPLE, monthKeyOf, useCategories } from '@/lib/data'
import { useClaimAction, useClaims, useRecentPayouts, type ClaimRow } from '@/lib/claims-data'
import { setPicked, usePicked } from '@/lib/choice'
import { CatIcon } from '@/components/CatIcon'
import { dayLabel } from '@/components/TxnRow'
import { Card, Label, Pills, inr, AmountShare } from '@/components/ui'
import { C, HUES } from '@/theme'

const shift = (key: string, n: number) => { const [y, m] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7) }
const sum = (l: ClaimRow[]) => l.reduce((s, r) => s + Number(r.amount), 0)
const nameOf = (r: { merchant: string | null; merchant_key: string | null }) => r.merchant ?? r.merchant_key ?? 'Unknown'
const num = { fontVariant: ['tabular-nums'] as ('tabular-nums')[] }

/**
 * Money spent for Employer that comes back (app/claimable/page.tsx).
 *
 * Three kinds, kept apart because only one is owed: paid with your own money
 * and not yet repaid; paid on the ExpenseCard card (the employer's card, ending 5555,
 * never owed to you); and repaid. A repayment coming in is shown on its own
 * and never added to the claimed total.
 *
 * Without a month it is the overview: what Employer owes, and month by month.
 * With one it is that month: the split, categories, repayments, and the
 * claims to mark settled.
 */
export default function Claimable() {
  const params = useLocalSearchParams<{ m?: string; who?: string }>()
  const [month, setMonth] = useState<string | null>(params.m && /^\d{4}-\d{2}$/.test(params.m) ? params.m : null)
  const [who, setWho] = useState<string | null>(params.who && PEOPLE[params.who] ? params.who : null)
  const [cat, setCat] = useState<string | null>(null)
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [payout, setPayout] = useState<string | null>(null)
  // On the overview, which total's payments are open below it.
  const [listing, setListing] = useState<'owed' | 'back' | 'card' | null>(null)
  const now = monthKeyOf()

  const picked = usePicked()
  useEffect(() => { if (picked && picked.length === 7) { setMonth(picked); setPicked(null) } }, [picked])
  useEffect(() => { setCat(null); setChosen(new Set()) }, [month, who])

  const q = useClaims(month, who)
  const payoutsQ = useRecentPayouts()
  const payouts = payoutsQ.data ?? []
  useEffect(() => { setPayout(p => p ?? payouts[0]?.id ?? '') }, [payouts])
  const cats = useCategories()
  const tree = useMemo(() => catTree(cats.data ?? []), [cats.data])
  const action = useClaimAction()

  const scroller = useRef<ScrollView>(null)
  const anchors = useRef<Record<string, number>>({})
  const mark = (k: string) => (e: { nativeEvent: { layout: { y: number } } }) => { anchors.current[k] = e.nativeEvent.layout.y }

  const fetched = q.data ?? []
  const repayments = fetched.filter(r => r.direction === 'credit')
  const rows = fetched.filter(r => r.direction !== 'credit')
  const onCard = rows.filter(r => r.account_tail === EXPENSECARD_CARD)
  const mine = rows.filter(r => r.account_tail !== EXPENSECARD_CARD)
  const owedRows = mine.filter(r => !r.claim_settled_on)
  const backRows = mine.filter(r => r.claim_settled_on)
  const owed = sum(owedRows)
  const oldest = owedRows.length ? owedRows[owedRows.length - 1].occurred_on : null
  const days = oldest ? Math.floor((Date.now() - new Date(oldest).getTime()) / 86400000) : 0
  const total = sum(rows)

  const kinds = [
    { key: 'owed', label: 'Owed to you', v: owed, color: HUES[6] },
    { key: 'back', label: 'Repaid', v: sum(backRows), color: C.positive },
    { key: 'card', label: `On ${EMPLOYER}'s card`, v: sum(onCard), color: HUES[1] },
  ].filter(k => k.v > 0)

  const topName = (id: number | null) => tree.root(id)?.name ?? 'Uncategorised'
  const byCat = new Map<string, number>()
  for (const r of rows) byCat.set(topName(r.category_id), (byCat.get(topName(r.category_id)) ?? 0) + Number(r.amount))
  const catRows = [...byCat.entries()].sort((a, b) => b[1] - a[1])
  const catTotal = catRows.reduce((s, [, v]) => s + v, 0)

  const byMonth = new Map<string, { mine: number; back: number; owed: number; card: number }>()
  if (!month) for (const r of rows) {
    const k = r.occurred_on.slice(0, 7)
    const e = byMonth.get(k) ?? { mine: 0, back: 0, owed: 0, card: 0 }
    const a = Number(r.amount)
    if (r.account_tail === EXPENSECARD_CARD) e.card += a
    else { e.mine += a; if (r.claim_settled_on) e.back += a; else e.owed += a }
    byMonth.set(k, e)
  }
  const months = [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12)

  const chosenTotal = owedRows.filter(c => chosen.has(c.id)).reduce((s, c) => s + Number(c.amount), 0)
  const toggle = (id: string) => setChosen(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const run = (a: Parameters<typeof action.mutate>[0], after?: () => void) =>
    action.mutate(a, { onSuccess: () => after?.(), onError: e => Alert.alert('Not saved', e instanceof Error ? e.message : String(e)) })

  const settle = () => {
    const p = payouts.find(x => x.id === payout)
    Alert.alert(`Mark ${chosen.size} settled?`,
      `${inr(chosenTotal)}${p ? `, repaid by ${p.merchant ?? 'payout'} on ${dayLabel(p.occurred_on)}` : ', payout not in the app (settled today)'}`,
      [{ text: 'Cancel', style: 'cancel' }, { text: 'Mark settled', onPress: () => run({ name: 'markSettled', args: payout ? { ids: [...chosen], payoutId: payout } : { ids: [...chosen] } }, () => setChosen(new Set())) }])
  }
  const notClaimable = (r: ClaimRow) => Alert.alert('Not claimable?', `${nameOf(r)}, ${inr(Number(r.amount))} goes back into household spending.`,
    [{ text: 'Cancel', style: 'cancel' }, { text: 'Not claimable', style: 'destructive', onPress: () => run({ name: 'notClaimable', args: { id: r.id } }) }])
  const undo = (r: ClaimRow) => Alert.alert('Undo settled?', `${nameOf(r)}, ${inr(Number(r.amount))} counts as owed again.`,
    [{ text: 'Cancel', style: 'cancel' }, { text: 'Undo', onPress: () => run({ name: 'unsettle', args: { id: r.id } }) }])

  const Row = ({ title, sub, amt, color, onPress, chevron = true }: { title: string; sub?: string; amt: string; color?: string; onPress?: () => void; chevron?: boolean }) => (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, opacity: pressed ? 0.6 : 1 })}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: C.text, fontSize: 16, fontWeight: '600' }} numberOfLines={1}>{title}</Text>
        {!!sub && <Text style={{ color: C.text2, fontSize: 13 }} numberOfLines={2}>{sub}</Text>}
      </View>
      <Text style={{ color: color ?? C.text, fontSize: 16, fontWeight: '600', ...num }}>{amt}</Text>
      {chevron && onPress && <Text style={{ color: C.text3, fontSize: 18 }}>›</Text>}
    </Pressable>
  )

  return (
    <ScrollView ref={scroller} style={{ backgroundColor: C.bg }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 80 }}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); payoutsQ.refetch() }} tintColor={C.text2} />}>
      <Stack.Screen options={{ title: month ? 'Claims' : 'Claimable' }} />
      <Pills options={[[null, 'Household'], ...Object.entries(PEOPLE).sort((a, b) => a[1].localeCompare(b[1]))] as [string | null, string][]} value={who} onChange={setWho} />

      {month ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable onPress={() => setMonth(shift(month, -1))} hitSlop={12} style={{ padding: 10, backgroundColor: C.card, borderRadius: 12 }}><Text style={{ color: C.text, fontSize: 18 }}>‹</Text></Pressable>
          <Pressable onPress={() => router.push({ pathname: '/month', params: { m: month, mode: 'pick' } })}>
            <Text style={{ color: C.text, fontSize: 18, fontWeight: '700' }}>{monthLabel(month)} ▾</Text>
          </Pressable>
          <Pressable disabled={month >= now} onPress={() => setMonth(shift(month, 1))} hitSlop={12} style={{ padding: 10, backgroundColor: C.card, borderRadius: 12, opacity: month >= now ? 0.3 : 1 }}><Text style={{ color: C.text, fontSize: 18 }}>›</Text></Pressable>
        </View>
      ) : (
        <Pressable onPress={() => router.push({ pathname: '/month', params: { m: now, mode: 'pick' } })} style={{ alignSelf: 'center' }}>
          <Text style={{ color: C.text2, fontSize: 15, fontWeight: '600' }}>Go to a month ▾</Text>
        </Pressable>
      )}

      {q.isLoading && <ActivityIndicator color={C.text2} style={{ marginTop: 30 }} />}
      {q.error && <Text style={{ color: C.negative }}>{q.error instanceof Error ? q.error.message : 'Could not load claims.'}</Text>}

      {!q.isLoading && month && (
        <>
          <View style={{ alignItems: 'center', gap: 4 }}>
            <Text style={{ color: C.text2 }}>Claimable, {monthLabel(month)}{who ? `, ${PEOPLE[who]}` : ''}</Text>
            <Text style={{ color: C.text, fontSize: 40, fontWeight: '800', ...num }}>{inr(total)}</Text>
            <Text style={{ color: C.text2 }}>{rows.length} payment{rows.length === 1 ? '' : 's'}</Text>
          </View>

          {kinds.length > 0 && (
            <Card style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: C.raised }}>
                {kinds.map(k => <View key={k.key} style={{ width: `${(k.v / (total || 1)) * 100}%`, backgroundColor: k.color }} />)}
              </View>
              {kinds.map(k => (
                <Pressable key={k.key} onPress={() => { const y = anchors.current[k.key]; if (y != null) scroller.current?.scrollTo({ y: y - 8, animated: true }) }}
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, opacity: pressed ? 0.6 : 1 })}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: k.color }} />
                  <Text style={{ color: C.text, flex: 1, fontWeight: '600' }}>{k.label}</Text>
                  <Text style={{ color: C.text, fontWeight: '600', ...num }}>{inr(k.v)}</Text>
                </Pressable>
              ))}
            </Card>
          )}

          <Pressable onPress={() => setMonth(null)} style={({ pressed }) => ({ backgroundColor: C.raised, borderRadius: 12, padding: 12, alignItems: 'center', opacity: pressed ? 0.6 : 1 })}>
            <Text style={{ color: C.text, fontWeight: '600' }}>Claims, month by month</Text>
          </Pressable>

          {catRows.length > 0 && (
            <Card style={{ gap: 2 }}>
              <Label>By category</Label>
              {catRows.map(([name, v]) => {
                const open = cat === name
                const look = lookFor(name)
                return (
                  <View key={name}>
                    <Pressable onPress={() => setCat(open ? null : name)}
                      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 6, marginHorizontal: -6, borderRadius: 12, backgroundColor: open ? C.raised : 'transparent', opacity: pressed ? 0.6 : 1 })}>
                      <CatIcon name={name} size={32} />
                      <View style={{ flex: 1, gap: 5 }}>
                        <Text style={{ color: C.text, fontWeight: '600' }} numberOfLines={1}>{name}</Text>
                        <View style={{ height: 4, borderRadius: 2, backgroundColor: C.raised }}>
                          <View style={{ height: 4, borderRadius: 2, width: `${(v / (catRows[0][1] || 1)) * 100}%`, backgroundColor: look.hue ? HUES[look.hue] : C.text3 }} />
                        </View>
                      </View>
                      <AmountShare v={v} of={catTotal} bold />
                      <Text style={{ color: C.text3, fontSize: 18 }}>{open ? '⌄' : '›'}</Text>
                    </Pressable>
                    {open && (
                      <View style={{ paddingLeft: 42 }}>
                        {rows.filter(r => topName(r.category_id) === name).map(r => (
                          <Row key={r.id} title={nameOf(r)} amt={inr(Number(r.amount))} onPress={() => router.push(`/t/${r.id}`)}
                            sub={`${dayLabel(r.occurred_on)} · ${r.account_tail === EXPENSECARD_CARD ? `${EMPLOYER}'s card` : r.claim_settled_on ? 'repaid' : 'owed to you'}`} />
                        ))}
                      </View>
                    )}
                  </View>
                )
              })}
            </Card>
          )}

          {repayments.length > 0 && (
            <Card style={{ gap: 2 }}>
              <Label>Money that came back</Label>
              {repayments.map(r => (
                <Row key={r.id} title={nameOf(r)} sub={dayLabel(r.occurred_on)} amt={`+${inr(Number(r.amount))}`} color={C.positive}
                  onPress={() => router.push({ pathname: '/claimable/r/[id]', params: { id: r.id } })} />
              ))}
            </Card>
          )}

          <View onLayout={mark('owed')}>
            <Card style={{ gap: 2 }}>
              <Label>Waiting to come back</Label>
              {owedRows.map(c => {
                const on = chosen.has(c.id)
                return (
                  <View key={c.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 9 }}>
                    <Pressable onPress={() => toggle(c.id)} hitSlop={10}
                      style={{ width: 22, height: 22, borderRadius: 6, marginTop: 2, borderWidth: 2, borderColor: on ? C.accent : C.text3, backgroundColor: on ? C.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      {on && <Text style={{ color: C.accentText, fontSize: 14, fontWeight: '800' }}>✓</Text>}
                    </Pressable>
                    <Pressable style={{ flex: 1 }} onPress={() => toggle(c.id)}>
                      <Text style={{ color: C.text, fontSize: 16, fontWeight: '600' }} numberOfLines={1}>{nameOf(c)}</Text>
                      <Text style={{ color: C.text2, fontSize: 13 }}>{dayLabel(c.occurred_on)}{c.bank ? ` · ${c.bank}` : ''}</Text>
                      <View style={{ flexDirection: 'row', gap: 16, marginTop: 4 }}>
                        <Pressable hitSlop={8} onPress={() => router.push(`/t/${c.id}`)}><Text style={{ color: C.text, fontSize: 13, textDecorationLine: 'underline' }}>open</Text></Pressable>
                        <Pressable hitSlop={8} disabled={action.isPending} onPress={() => notClaimable(c)}><Text style={{ color: C.text2, fontSize: 13, textDecorationLine: 'underline' }}>not claimable</Text></Pressable>
                      </View>
                    </Pressable>
                    <Text style={{ color: C.text, fontSize: 16, fontWeight: '600', ...num }}>{inr(Number(c.amount))}</Text>
                  </View>
                )
              })}
              {owedRows.length === 0 && <Text style={{ color: C.text2, paddingVertical: 8 }}>Nothing outstanding.</Text>}

              {chosen.size > 0 && payouts.length > 0 && (
                <View style={{ marginTop: 12, gap: 6 }}>
                  <Text style={{ color: C.text2, fontSize: 13, fontWeight: '600' }}>Repaid by</Text>
                  {[...payouts.map(p => ({ id: p.id, text: `${p.merchant ?? 'payout'}, ${dayLabel(p.occurred_on)}, ${inr(Number(p.amount))}` })), { id: '', text: 'Payout not in the app' }].map(o => {
                    const on = (payout ?? '') === o.id
                    return (
                      <Pressable key={o.id || 'none'} onPress={() => setPayout(o.id)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, backgroundColor: on ? C.raised : 'transparent' }}>
                        <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: on ? C.accent : C.text3, alignItems: 'center', justifyContent: 'center' }}>
                          {on && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent }} />}
                        </View>
                        <Text style={{ color: C.text, flex: 1 }} numberOfLines={1}>{o.text}</Text>
                      </Pressable>
                    )
                  })}
                </View>
              )}
              {chosen.size > 0 && (
                <Pressable disabled={action.isPending} onPress={settle}
                  style={({ pressed }) => ({ marginTop: 10, backgroundColor: C.accent, borderRadius: 12, padding: 13, alignItems: 'center', opacity: pressed || action.isPending ? 0.6 : 1 })}>
                  <Text style={{ color: C.accentText, fontWeight: '700', fontSize: 16 }}>{action.isPending ? 'Marking' : `Mark ${chosen.size} settled, ${inr(chosenTotal)}`}</Text>
                </Pressable>
              )}
            </Card>
          </View>

          {backRows.length > 0 && (
            <View onLayout={mark('back')}>
              <Card style={{ gap: 2 }}>
                <Label>Already back</Label>
                {backRows.map(c => (
                  <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
                    <Pressable style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.6 : 1 })} onPress={() => router.push(`/t/${c.id}`)}>
                      <Text style={{ color: C.text, fontSize: 16, fontWeight: '600' }} numberOfLines={1}>{nameOf(c)}</Text>
                      <Text style={{ color: C.text2, fontSize: 13 }}>spent {dayLabel(c.occurred_on)}, settled {dayLabel(c.claim_settled_on!)}</Text>
                      <Pressable hitSlop={8} disabled={action.isPending} onPress={() => undo(c)} style={{ marginTop: 4, alignSelf: 'flex-start' }}>
                        <Text style={{ color: C.text2, fontSize: 13, textDecorationLine: 'underline' }}>undo</Text>
                      </Pressable>
                    </Pressable>
                    <Text style={{ color: C.text, fontSize: 16, fontWeight: '600', opacity: 0.6, ...num }}>{inr(Number(c.amount))}</Text>
                  </View>
                ))}
              </Card>
            </View>
          )}

          {onCard.length > 0 && (
            <View onLayout={mark('card')}>
              <Card style={{ gap: 2 }}>
                <Label>On {EMPLOYER}&apos;s card</Label>
                <Text style={{ color: C.text2, fontSize: 13, marginTop: 4 }}>Paid on the company card. {EMPLOYER} pays the card, so nothing comes back to you.</Text>
                {onCard.map(r => (
                  <Row key={r.id} title={nameOf(r)} sub={dayLabel(r.occurred_on)} amt={inr(Number(r.amount))} onPress={() => router.push(`/t/${r.id}`)} />
                ))}
              </Card>
            </View>
          )}
        </>
      )}

      {!q.isLoading && !month && (
        <>
          <Pressable disabled={!owedRows.length} onPress={() => setListing(l => (l === 'owed' ? null : 'owed'))} style={({ pressed }) => ({ alignItems: 'center', gap: 4, opacity: pressed ? 0.6 : 1 })}>
            <Text style={{ color: C.text2 }}>{EMPLOYER === 'work' ? 'Work' : EMPLOYER} owes you{who ? `, ${PEOPLE[who]}` : ''}</Text>
            <Text style={{ color: owed ? HUES[6] : C.text, fontSize: 40, fontWeight: '800', ...num }}>{inr(owed)}</Text>
            <Text style={{ color: C.text2 }}>
              {owedRows.length ? `${owedRows.length} not yet repaid, oldest ${days} day${days === 1 ? '' : 's'} ago ${listing === 'owed' ? '⌄' : '›'}` : 'Nothing waiting'}
            </Text>
          </Pressable>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {([['back', 'Repaid', backRows], ['card', `On ${EMPLOYER}'s card`, onCard]] as const).map(([k, label, list]) => (
              <Pressable key={k} disabled={!list.length} onPress={() => setListing(l => (l === k ? null : k))} style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.6 : 1 })}>
                <Card style={{ flex: 1, borderWidth: 2, borderColor: listing === k ? C.accent : 'transparent' }}>
                  <Label>{label}</Label>
                  <Text style={{ color: C.text, fontSize: 18, fontWeight: '700', marginTop: 4, ...num }}>{inr(sum(list))}</Text>
                </Card>
              </Pressable>
            ))}
          </View>

          {listing && (
            <Card style={{ gap: 2 }}>
              <Label>{listing === 'owed' ? 'Not yet repaid' : listing === 'back' ? 'Repaid' : `On ${EMPLOYER}'s card`}</Label>
              {(listing === 'owed' ? owedRows : listing === 'back' ? backRows : onCard).map(r => (
                <Row key={r.id} title={nameOf(r)} amt={inr(Number(r.amount))} onPress={() => router.push(`/t/${r.id}`)}
                  sub={`${dayLabel(r.occurred_on)}${r.claim_settled_on ? `, settled ${dayLabel(r.claim_settled_on)}` : ''}`} />
              ))}
            </Card>
          )}

          {months.length > 0 && (
            <Card style={{ gap: 2 }}>
              <Label>By month</Label>
              {months.map(([k, e]) => (
                <Row key={k} title={monthLabel(k)} onPress={() => setMonth(k)}
                  sub={`${e.mine ? `${inr(e.mine)} yours` : 'nothing yours'}${e.card ? ` · ${inr(e.card)} on the card` : ''}`}
                  amt={e.owed ? `${inr(e.owed)} owed` : 'settled'} color={e.owed ? C.positive : C.text2} />
              ))}
            </Card>
          )}
        </>
      )}
    </ScrollView>
  )
}
