import { useMemo } from 'react'
import { FlatList, Text, View } from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { catTree } from '@lib/cats.ts'
import { countsAsSpend } from '@lib/scope.ts'
import { useCategories, type Txn } from '@/lib/data'
import { supabase } from '@/lib/supabase'
import { TxnRow, dayLabel } from '@/components/TxnRow'
import { collapseSplits } from '@lib/splits.ts'
import { Card, Label, inr } from '@/components/ui'
import { C } from '@/theme'

/** Everything paid to one payee, and the rule that files it. */
export default function Payee() {
  const { key } = useLocalSearchParams<{ key: string }>()
  const cats = useCategories()
  const tree = useMemo(() => catTree(cats.data ?? []), [cats.data])
  const q = useQuery({
    queryKey: ['payee', key],
    queryFn: async () => {
      const [{ data: rows }, { data: rule }] = await Promise.all([
        supabase.from('transactions').select('id, amount, direction, occurred_on, occurred_at, merchant, merchant_key, scope, status, category_id, paid_by, note, split_of, split_total, paid:people!transactions_paid_by_fkey(name)')
          .eq('merchant_key', key).not('status', 'in', '(duplicate,ignored)').order('occurred_on', { ascending: false }).limit(1000),
        supabase.from('merchant_rules').select('category_id, default_scope, merchant').eq('match_key', key).eq('rule_shape', 'exact||||').maybeSingle(),
      ])
      return { rows: (rows ?? []) as unknown as Txn[], rule }
    },
  })
  const rows = q.data?.rows ?? []
  const spend = rows.filter(countsAsSpend)
  const total = spend.reduce((s, r) => s + Number(r.amount), 0)
  const name = rows.find(r => r.merchant)?.merchant ?? key
  // A split payment is one payment however many parts it has.
  const shownRows = collapseSplits(rows)
  const payments = collapseSplits(spend).length
  const rule = q.data?.rule
  return (
    <FlatList
      style={{ backgroundColor: C.bg }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
      data={shownRows} keyExtractor={r => r.id}
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: 8 }}>
          <Stack.Screen options={{ title: name ?? 'Payee' }} />
          <View style={{ alignItems: 'center', gap: 4 }}>
            <Text style={{ color: C.text, fontSize: 40, fontWeight: '800' }}>{inr(total)}</Text>
            <Text style={{ color: C.text2 }}>{payments} payments{payments ? ` · about ${inr(total / payments)} each` : ''}{rows.length ? ` · since ${dayLabel(rows[rows.length - 1].occurred_on)}` : ''}</Text>
          </View>
          <Card><Label>Files itself as</Label><Text style={{ color: C.text, marginTop: 4 }}>{rule ? `${tree.label(rule.category_id) || 'No category'}${rule.default_scope !== 'household' ? ` · ${rule.default_scope}` : ''}` : 'Not set yet, file one in Review'}</Text></Card>
        </View>
      }
      renderItem={({ item, index }) => (
        <View>
          {(index === 0 || shownRows[index - 1].occurred_on.slice(0, 7) !== item.occurred_on.slice(0, 7)) &&
            <Text style={{ color: C.text2, fontWeight: '600', marginTop: 12 }}>{new Date(item.occurred_on.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</Text>}
          <TxnRow t={item} tree={tree} />
        </View>
      )}
    />
  )
}
