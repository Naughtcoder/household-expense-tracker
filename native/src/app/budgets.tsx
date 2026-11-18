import { useState } from 'react'
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native'
import { Stack, router } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { paceOf, budgetState } from '@lib/pace.ts'
import { lookFor } from '@lib/caticons.ts'
import { monthKeyOf } from '@/lib/data'
import { act } from '@/lib/api'
import { monthOf, refreshSetup, useBudgets } from '@/lib/setup-data'
import { CatIcon } from '@/components/CatIcon'
import { Card, Label, inr } from '@/components/ui'
import { C, HUES } from '@/theme'
import { openAll } from '@/lib/nav'

const tone = (s: string) => (s === 'over' ? C.negative : s === 'ahead' ? C.caution : C.positive)

/** Budgets as a place to look: the whole month against every limit, then one
 *  tile per category with what is left and where it should be by today.
 *  Setting limits is below, behind "Set limits". */
export default function Budgets() {
  const [key, setKey] = useState(monthKeyOf())
  const [edit, setEdit] = useState(false)
  const q = useBudgets(key)
  const month = monthOf(key)
  const pace = paceOf(key)
  const d = q.data
  const tiles = (d?.cats ?? []).filter(c => d!.limit[c.id] != null).map(c => {
    const spent = d!.cur[c.id] ?? 0, lim = d!.limit[c.id]
    return { ...c, spent, lim, left: lim - spent, ...budgetState(spent, lim, pace.share) }
  }).sort((a, b) => b.used - a.used)
  const totalLimit = tiles.reduce((s, t) => s + t.lim, 0)
  const totalSpent = tiles.reduce((s, t) => s + t.spent, 0)
  const overall = budgetState(totalSpent, totalLimit, pace.share)
  const editing = edit || (!!d && tiles.length === 0)
  const list = (d?.cats ?? []).map(c => ({ ...c, average: (d!.six[c.id] ?? 0) / 6 })).sort((a, b) => b.average - a.average)

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 80 }}
      keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={C.text2} />}>
      <Stack.Screen options={{
        title: 'Budgets',
        headerRight: tiles.length > 0 ? () => (
          <Pressable onPress={() => setEdit(e => !e)} hitSlop={10}><Text style={{ color: C.text, fontWeight: '600', fontSize: 16 }}>{editing ? 'Done' : 'Set limits'}</Text></Pressable>
        ) : undefined,
      }} />

      {tiles.length > 0 && (
        <Card style={{ alignItems: 'center', gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch' }}>
            <Pressable onPress={() => setKey(month.prev)} hitSlop={12} style={{ padding: 8, backgroundColor: C.raised, borderRadius: 10 }}><Text style={{ color: C.text, fontSize: 18 }}>‹</Text></Pressable>
            <Label>{month.label}</Label>
            <Pressable disabled={month.isCurrent} onPress={() => setKey(month.next)} hitSlop={12} style={{ padding: 8, backgroundColor: C.raised, borderRadius: 10, opacity: month.isCurrent ? 0.3 : 1 }}><Text style={{ color: C.text, fontSize: 18 }}>›</Text></Pressable>
          </View>
          <Pressable onPress={() => openAll({ m: key, dir: 'debit' })} style={({ pressed }) => ({ alignSelf: 'stretch', alignItems: 'center', gap: 10, opacity: pressed ? 0.6 : 1 })}>
            <Text style={{ color: C.text, fontSize: 40, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{inr(totalLimit - totalSpent)}</Text>
            <PaceBar used={overall.used} color={tone(overall.state)} marker={month.isCurrent ? pace.share : null} height={14} />
            <Text style={{ color: C.text2, textAlign: 'center' }}>
              {totalSpent <= totalLimit ? 'left' : 'over'} {month.isCurrent ? 'this month' : `in ${month.label}`} · {Math.round(overall.used * 100)}% of {inr(totalLimit)} spent
              {month.isCurrent ? `, ${pace.daysLeft} day${pace.daysLeft === 1 ? '' : 's'} to go` : ''} ›
            </Text>
          </Pressable>
        </Card>
      )}

      {tiles.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {tiles.map(t => {
            const look = lookFor(t.name)
            return (
              <Pressable key={t.id} onPress={() => router.push({ pathname: '/c/[id]', params: { id: String(t.id), m: key } })}
                style={({ pressed }) => ({ width: '48.5%', opacity: pressed ? 0.6 : 1 })}>
                <Card style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <CatIcon name={t.name} size={24} />
                    <Text style={{ color: C.text, fontWeight: '600', flex: 1 }} numberOfLines={1}>{t.name}</Text>
                  </View>
                  <Text style={{ color: tone(t.state), fontSize: 12, marginTop: 6 }}>{Math.round(t.used * 100)}% spent</Text>
                  <Text style={{ color: C.text, fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{inr(t.left)}</Text>
                  <Text style={{ color: C.text2, fontSize: 12 }}>{t.left >= 0 ? 'left' : 'over'}{month.isCurrent ? `, ${pace.daysLeft}d to go` : ''}</Text>
                  <PaceBar used={t.used} color={t.state === 'fine' ? (look.hue ? HUES[look.hue] : C.accent) : tone(t.state)} marker={month.isCurrent ? pace.share : null} height={6} />
                </Card>
              </Pressable>
            )
          })}
        </View>
      )}
      {tiles.length > 0 && month.isCurrent && (
        <Text style={{ color: C.text2, fontSize: 13 }}>The line on each bar is where spending should be by today if the month is spread evenly. Amber means ahead of it, red means over the limit.</Text>
      )}

      {editing && d && (
        <Card style={{ gap: 4 }}>
          <Label>Set limits</Label>
          <Text style={{ color: C.text2, fontSize: 13, marginBottom: 6 }}>A monthly limit per category. Leave one blank for no limit. The average is the last six whole months.</Text>
          {list.map((c, i) => (
            <BudgetRow key={c.id} id={c.id} name={c.name} average={c.average} first={i === 0}
              current={d.limit[c.id] ?? null} thisMonth={d.cur[c.id] ?? 0} />
          ))}
        </Card>
      )}
      {q.error && <Text style={{ color: C.negative }}>{(q.error as Error).message}</Text>}
    </ScrollView>
  )
}

/** Filled to the share spent, with a line where it should be by today. */
function PaceBar({ used, color, marker, height }: { used: number; color: string; marker: number | null; height: number }) {
  return (
    <View style={{ alignSelf: 'stretch', height, borderRadius: height, backgroundColor: C.raised, marginTop: 6 }}>
      <View style={{ width: `${Math.min(100, used * 100)}%`, height, borderRadius: height, backgroundColor: color }} />
      {marker !== null && <View style={{ position: 'absolute', left: `${marker * 100}%`, top: -3, bottom: -3, width: 2, borderRadius: 1, backgroundColor: C.text }} />}
    </View>
  )
}

function BudgetRow({ id, name, average, current, thisMonth, first }: { id: number; name: string; average: number; current: number | null; thisMonth: number; first: boolean }) {
  const qc = useQueryClient()
  const [value, setValue] = useState(current ? String(Math.round(current)) : '')
  const [saved, setSaved] = useState(current)
  const [problem, setProblem] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const n = Number(value.replace(/[^\d.]/g, '')) || null
  const dirty = (n ?? null) !== (saved ? Math.round(saved) : null)

  const save = async (next: number | null) => {
    setProblem(null); setPending(true)
    try {
      await act('setBudget', { categoryId: id, monthly: next })
      setSaved(next); setValue(next ? String(next) : '')
      refreshSetup(qc, 'budgets')
    } catch (e) { setProblem((e as Error).message) }
    setPending(false)
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: first ? 0 : 1, borderTopColor: C.line }}>
      <Pressable style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.6 : 1 })} onPress={() => router.push({ pathname: '/c/[id]', params: { id: String(id) } })}>
        <Text style={{ color: C.text, fontWeight: '600' }}>{name} ›</Text>
        <Text style={{ color: C.text2, fontSize: 12 }}>
          averages {inr(average)} a month · {inr(thisMonth)} so far this month
          {problem ? <Text style={{ color: C.negative }}> · {problem}</Text> : null}
        </Text>
      </Pressable>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <TextInput value={value} onChangeText={setValue} placeholder="No limit" placeholderTextColor={C.text3} keyboardType="number-pad"
          accessibilityLabel={`${name} monthly budget`}
          style={{ width: 104, textAlign: 'right', backgroundColor: C.raised, color: C.text, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, fontSize: 15, fontVariant: ['tabular-nums'] }} />
        {dirty
          ? <Pressable disabled={pending} onPress={() => save(n)} style={{ backgroundColor: C.accent, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 14, opacity: pending ? 0.5 : 1 }}>
              <Text style={{ color: C.accentText, fontWeight: '700' }}>{pending ? '…' : 'Save'}</Text>
            </Pressable>
          : !saved && average > 0
            ? <Pressable disabled={pending} onPress={() => save(Math.round(average / 500) * 500 || 500)} style={{ backgroundColor: C.raised, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 }}>
                <Text style={{ color: C.text2, fontWeight: '600', fontSize: 13 }}>Use average</Text>
              </Pressable>
            : null}
      </View>
    </View>
  )
}
