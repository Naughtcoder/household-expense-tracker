import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import { Stack } from 'expo-router'
import { dayLabel } from '@lib/format.ts'
import { useAccounts } from '@/lib/setup-data'
import { Card, Label, inr } from '@/components/ui'
import { C } from '@/theme'
import { openAll } from '@/lib/nav'

// The phone's inr() drops the sign; a balance can be overdrawn.
const signed = (n: number) => `${Math.round(n) < 0 ? '−' : ''}${inr(n)}`
const NONE = '–'

/** The last balance each bank reported, one row per account. */
export default function Accounts() {
  const q = useAccounts()
  const list = q.data ?? []
  const known = list.filter(a => a.balance !== null)
  const total = known.reduce((s, a) => s + (a.balance ?? 0), 0)

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 80 }}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={C.text2} />}>
      <Stack.Screen options={{ title: 'Accounts' }} />
      <Card style={{ gap: 4 }}>
        <Label>Across {known.length} account{known.length === 1 ? '' : 's'}</Label>
        <Text style={{ color: C.text, fontSize: 36, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{known.length ? signed(total) : NONE}</Text>
        <Text style={{ color: C.text2 }}>
          {known.length
            ? 'Last balance each bank reported, not a live figure.'
            : 'No balance has come through yet. Most Indian banks include one in their alerts.'}
        </Text>
      </Card>

      <Card>
        <Label>Accounts</Label>
        <View style={{ marginTop: 6 }}>
          {list.map((a, i) => (
            <Pressable key={`${a.bank}${a.tail}`} onPress={() => openAll({ acct: a.tail, bank: a.bank })}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: C.line, opacity: pressed ? 0.6 : 1 })}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontWeight: '600' }}>{a.bank} ···{a.tail}</Text>
                <Text style={{ color: C.text2, fontSize: 12 }}>
                  {a.asOf ? `as at ${dayLabel(a.asOf)}` : 'no balance reported'} · {a.seen} transaction{a.seen === 1 ? '' : 's'}
                </Text>
              </View>
              <Text style={{ color: C.text, fontVariant: ['tabular-nums'], fontWeight: '600' }}>{a.balance === null ? NONE : signed(a.balance)}</Text>
              <Text style={{ color: C.text3, fontSize: 18 }}>›</Text>
            </Pressable>
          ))}
          {list.length === 0 && !q.isLoading && (
            <Text style={{ color: C.text2, paddingVertical: 8 }}>{q.error ? (q.error as Error).message : 'Nothing yet. Accounts appear as messages arrive.'}</Text>
          )}
        </View>
      </Card>

      <Card style={{ gap: 8 }}>
        <Label>Why this screen exists</Label>
        <Text style={{ color: C.text2 }}>
          If a balance falls further than the transactions here explain, something was
          missed: a payment made in an app that does not text, or a message never shared.
          No other screen can tell you that.
        </Text>
      </Card>
    </ScrollView>
  )
}
