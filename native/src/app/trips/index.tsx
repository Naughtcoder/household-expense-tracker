import { Platform, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import { router, Stack } from 'expo-router'
import { SymbolView } from 'expo-symbols'
import { PARTS, extra, place, short, tripWhen, useTrips, type TagSummary } from '@/lib/trips-data'
import { Card, Label, inr } from '@/components/ui'
import { C } from '@/theme'

const open = (id: number) => router.push({ pathname: '/trips/[id]', params: { id: String(id) } })

/** A grey tile with an SF Symbol, or a letter off iPhone. */
function Tile({ symbol, letter, size = 40 }: { symbol: string; letter: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: C.raised, alignItems: 'center', justifyContent: 'center' }}>
      {Platform.OS === 'ios'
        ? <SymbolView name={symbol as never} tintColor={C.text} size={size * 0.5} />
        : <Text style={{ color: C.text, fontWeight: '700', fontSize: size * 0.42 }}>{letter}</Text>}
    </View>
  )
}

const payments = (n: number) => `${n} payment${n === 1 ? '' : 's'}`

function TripCard({ t }: { t: TagSummary }) {
  const who = extra(t.name)
  const s = t.awayFirst || t.first, e = t.awayLast || t.last
  return (
    <Pressable onPress={() => open(t.id)} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Tile symbol="airplane" letter="✈" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.text, fontSize: 16, fontWeight: '600' }} numberOfLines={1}>
              {place(t.name)}{who ? <Text style={{ color: C.text2, fontWeight: '400' }}> · {who}</Text> : null}
            </Text>
            <Text style={{ color: C.text2, fontSize: 13 }} numberOfLines={1}>
              {t.n ? `${short(s)}${s !== e ? ` to ${short(e)}` : ''} · ${payments(t.n)}` : 'Nothing tagged yet'}
            </Text>
          </View>
          <Text style={{ color: C.text, fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{inr(t.total)}</Text>
          <Text style={{ color: C.text3, fontSize: 18 }}>›</Text>
        </View>
        {t.total > 0 && (
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: C.raised }}>
              {PARTS.map(p => t.parts[p.key] > 0 && <View key={p.key} style={{ flex: t.parts[p.key] / t.total, backgroundColor: p.color }} />)}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 2 }}>
              {/* Each part opens the trip narrowed to it. */}
              {PARTS.filter(p => t.parts[p.key] > 0).map(p => (
                <Pressable key={p.key} hitSlop={6} onPress={() => router.push({ pathname: '/trips/[id]', params: { id: String(t.id), part: p.key } })}
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                  <Text style={{ color: C.text2, fontSize: 13, fontVariant: ['tabular-nums'] }}>{p.key} {inr(t.parts[p.key])}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </Card>
    </Pressable>
  )
}

/** Trips by year, newest first, each with what it cost, what it went on and
 *  the dates away. Other tags (Holiday, ExpenseCard, Moving house) are listed below. */
export default function Trips() {
  const q = useTrips()
  const trips = q.data?.trips ?? []
  const others = q.data?.others ?? []
  const years = [...new Set(trips.map(t => tripWhen(t.name)!.y))].sort((a, b) => b - a)
  const thisYear = new Date().getFullYear()
  const mine = trips.filter(t => tripWhen(t.name)!.y === thisYear)
  const yearTotal = mine.reduce((s, t) => s + t.total, 0)

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 80 }}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={C.text2} />}>
      <Stack.Screen options={{ title: 'Trips' }} />

      <View style={{ alignItems: 'center', gap: 6 }}>
        <Text style={{ color: C.text2 }}>Trips in {thisYear}</Text>
        <Text style={{ color: C.text, fontSize: 40, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{inr(yearTotal)}</Text>
        <Text style={{ color: C.text2, textAlign: 'center' }}>{mine.length} trip{mine.length === 1 ? '' : 's'} · flights, stays and everything spent while away</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 12, rowGap: 4, marginTop: 6 }}>
          {PARTS.map(p => (
            <View key={p.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: p.color }} />
              <Text style={{ color: C.text2, fontSize: 12 }}>{p.key}</Text>
            </View>
          ))}
        </View>
      </View>

      {q.isLoading && <Text style={{ color: C.text2, textAlign: 'center' }}>Loading…</Text>}
      {q.error && <Text style={{ color: C.negative, textAlign: 'center' }}>{(q.error as Error).message}</Text>}

      {years.map(y => {
        const list = trips.filter(t => tripWhen(t.name)!.y === y)
        const sum = list.reduce((s, t) => s + t.total, 0)
        return (
          <View key={y} style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 4, marginTop: 6 }}>
              <Text style={{ color: C.text, fontSize: 22, fontWeight: '700' }}>{y}</Text>
              <Text style={{ color: C.text2, fontVariant: ['tabular-nums'] }}>{inr(sum)}</Text>
            </View>
            {list.map(t => <TripCard key={t.id} t={t} />)}
          </View>
        )
      })}

      {others.length > 0 && (
        <Card style={{ gap: 4 }}>
          <Label>Other tags</Label>
          {others.map(t => (
            <Pressable key={t.id} onPress={() => open(t.id)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, opacity: pressed ? 0.6 : 1 })}>
              <Tile symbol="tag.fill" letter="#" size={32} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontSize: 16, fontWeight: '600' }} numberOfLines={1}>{t.name}</Text>
                <Text style={{ color: C.text2, fontSize: 13 }}>{t.n ? payments(t.n) : 'Nothing tagged yet'}</Text>
              </View>
              <Text style={{ color: C.text, fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{inr(t.total)}</Text>
              <Text style={{ color: C.text3, fontSize: 18 }}>›</Text>
            </Pressable>
          ))}
        </Card>
      )}
    </ScrollView>
  )
}
