import { useMemo, useState } from 'react'
import { Alert, FlatList, Pressable, RefreshControl, Text, View } from 'react-native'
import { router } from 'expo-router'
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable'
import { useQueryClient } from '@tanstack/react-query'
import { reasonsFor } from '@lib/review-reason.ts'
import { catTree } from '@lib/cats.ts'
import { refreshAll, useCategories, useReview, useUnparsed, type ReviewRow } from '@/lib/data'
import { act } from '@/lib/api'
import { CatIcon } from '@/components/CatIcon'
import { Card, Label, inr } from '@/components/ui'
import { C } from '@/theme'

const day = (iso: string) => new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })

/** Payments waiting for a category, a check, or a decision about a twin. */
export default function Review() {
  const review = useReview()
  const unparsed = useUnparsed()
  const cats = useCategories()
  const qc = useQueryClient()
  const tree = useMemo(() => catTree(cats.data ?? []), [cats.data])
  const [busy, setBusy] = useState<string | null>(null)
  const rows = review.data ?? []
  const sameCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows) if (r.merchant_key) m.set(r.merchant_key, (m.get(r.merchant_key) ?? 0) + 1)
    return m
  }, [rows])

  const run = async (id: string, action: string, args: Record<string, unknown>) => {
    setBusy(id)
    try { await act(action, args); refreshAll(qc) } catch (e) { Alert.alert('Not done', (e as Error).message) }
    setBusy(null)
  }

  return (
    <FlatList
      style={{ backgroundColor: C.bg }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 100 }}
      data={rows}
      keyExtractor={r => r.id}
      refreshControl={<RefreshControl refreshing={review.isRefetching} onRefresh={() => { review.refetch(); unparsed.refetch() }} tintColor={C.text2} />}
      ListHeaderComponent={<Text style={{ color: C.text, fontSize: 34, fontWeight: '800', marginBottom: 4 }}>Review</Text>}
      ListEmptyComponent={<Card><Text style={{ color: C.text2 }}>{review.isLoading ? 'Loading' : 'Nothing waiting. Everything is filed.'}</Text></Card>}
      renderItem={({ item: r }) => <Item r={r} tree={tree} same={sameCount.get(r.merchant_key ?? '') ?? 1} busy={busy === r.id} run={run} />}
      ListFooterComponent={(unparsed.data?.length ?? 0) > 0 ? (
        <View style={{ gap: 8, marginTop: 8 }}>
          <Label>Messages nothing could read</Label>
          {unparsed.data!.map(u => (
            <Card key={u.id} style={{ gap: 8 }}>
              <Text style={{ color: C.text2, fontFamily: 'Menlo', fontSize: 12 }} numberOfLines={6}>{u.raw_text}</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Btn label="Try again" onPress={() => run(u.id, 'retryUnparsed', { id: u.id, text: u.raw_text })} />
                <Btn label="Not a payment" onPress={() => run(u.id, 'dismissUnparsed', { id: u.id })} />
              </View>
            </Card>
          ))}
        </View>
      ) : null}
    />
  )
}

function Btn({ label, onPress, strong, disabled }: { label: string; onPress: () => void; strong?: boolean; disabled?: boolean }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => ({ paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999, backgroundColor: strong ? C.accent : C.raised, opacity: pressed || disabled ? 0.6 : 1 })}>
      <Text style={{ color: strong ? C.accentText : C.text, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  )
}

/** Swipe right to file it as the category shown, left to ignore it. */
function Swipe({ children, left, right }: { children: React.ReactNode; left?: { label: string; run: () => void }; right?: { label: string; run: () => void } }) {
  const action = (a: { label: string } | undefined, side: 'left' | 'right') => () => a ? (
    <View style={{ justifyContent: 'center', alignItems: side === 'left' ? 'flex-start' : 'flex-end', paddingHorizontal: 20, backgroundColor: side === 'left' ? C.positive : C.raised, borderRadius: 18, flex: 1 }}>
      <Text style={{ color: side === 'left' ? C.accentText : C.text, fontWeight: '800' }}>{a.label}</Text>
    </View>
  ) : null
  return (
    <ReanimatedSwipeable friction={1.5} leftThreshold={90} rightThreshold={90}
      renderLeftActions={right ? action(right, 'left') : undefined} renderRightActions={left ? action(left, 'right') : undefined}
      onSwipeableOpen={dir => (dir === 'left' ? right?.run() : left?.run())}>
      {children}
    </ReanimatedSwipeable>
  )
}

function Item({ r, tree, same, busy, run }: { r: ReviewRow; tree: ReturnType<typeof catTree>; same: number; busy: boolean; run: (id: string, a: string, args: Record<string, unknown>) => void }) {
  const why = reasonsFor({ ...r, amount: Number(r.amount) }, [...tree.byId.values()])
  const credit = r.direction === 'credit'
  const cat = tree.label(r.category_id)
  const fileable = !!cat && !r.twin && why.every(w => w.field === 'category')
  return (
    <Swipe
      right={fileable ? { label: `File as ${tree.name(r.category_id)}`, run: () => run(r.id, 'file', { id: r.id, categoryId: r.category_id, scope: r.scope, merchantKey: r.merchant_key, merchant: r.merchant }) } : undefined}
      left={{ label: 'Ignore', run: () => run(r.id, 'ignore', { id: r.id }) }}>
    <Card style={{ gap: 10, opacity: busy ? 0.5 : 1 }}>
      <Pressable onPress={() => router.push(`/t/${r.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <CatIcon name={tree.name(r.category_id) ?? (credit ? 'Income' : 'Uncategorised')} group={tree.root(r.category_id)?.name} size={42} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.text, fontSize: 16, fontWeight: '700' }} numberOfLines={1}>{r.merchant ?? r.merchant_key ?? 'Unknown'}</Text>
          <Text style={{ color: C.text2, fontSize: 13 }}>{day(r.occurred_on)}{r.bank ? ` · ${r.bank}` : ''} · {r.paid?.name}{same > 1 ? ` · ${same} from this payee` : ''}</Text>
        </View>
        <Text style={{ color: credit ? C.positive : C.text, fontSize: 18, fontWeight: '700' }}>{credit ? '+' : ''}{inr(Number(r.amount))}</Text>
      </Pressable>
      {why.length > 0 && <Text style={{ color: C.caution, fontSize: 13 }}>{why.map(w => w.short).join(' · ')}</Text>}
      {r.twin && (
        <Pressable onPress={() => router.push(`/t/${r.possible_duplicate_of}`)} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <Text style={{ color: C.text2, fontSize: 13 }}>Looks like a twin of {inr(Number(r.twin.amount))} to {r.twin.merchant ?? 'the same payee'} on {day(r.twin.occurred_on)}. Open it ›</Text>
        </Pressable>
      )}
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {r.twin ? (
          <>
            <Btn strong label="Same payment" disabled={busy} onPress={() => run(r.id, 'markDuplicate', { id: r.id })} />
            <Btn label="Two payments" disabled={busy} onPress={() => run(r.id, 'keepBoth', { id: r.id })} />
          </>
        ) : (
          <>
            <Btn strong label={cat ? `File as ${tree.name(r.category_id)}` : 'Pick a category'} disabled={busy}
              onPress={() => cat
                ? run(r.id, 'file', { id: r.id, categoryId: r.category_id, scope: r.scope, merchantKey: r.merchant_key, merchant: r.merchant })
                : router.push({ pathname: '/pick', params: { txn: r.id, mode: 'review', same: String(same) } })} />
            {cat ? <Btn label="Change" disabled={busy} onPress={() => router.push({ pathname: '/pick', params: { txn: r.id, mode: 'review', same: String(same) } })} /> : null}
            <Btn label="Ignore" disabled={busy} onPress={() => run(r.id, 'ignore', { id: r.id })} />
          </>
        )}
      </View>
    </Card>
    </Swipe>
  )
}
