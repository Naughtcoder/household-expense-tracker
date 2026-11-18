import { useMemo, useRef } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { catTree } from '@lib/cats.ts'
import { remainder, type Part } from '@lib/splits.ts'
import type { Scope } from '@lib/scope.ts'
import { useCategories } from '@/lib/data'
import { SCOPE_OPTIONS, scopeLabel, useCategoryChoice, useSheetChoice } from '@/lib/choice'
import { inrSigned } from '@/lib/split-data'
import { CatIcon } from './CatIcon'
import { Card, ChoiceRow, Label } from './ui'
import { C } from '@/theme'

/** One part as typed: the amount stays a string so "65,4" is not lost mid-typing. */
export type PartRow = { amount: string; cat: number | null; scope: Scope; note: string }

export const toRow = (p: { amount: number | string; category_id: number | null; scope: string; note?: string | null }): PartRow =>
  ({ amount: String(p.amount), cat: p.category_id ?? null, scope: (p.scope as Scope) || 'household', note: p.note ?? '' })
export const toPart = (r: PartRow): Part => ({ amount: Number(r.amount.replace(/[,\s₹]/g, '')), category_id: r.cat, scope: r.scope, note: r.note.trim() || null })
export const blankRow = (amount = ''): PartRow => ({ amount, cat: null, scope: 'household', note: '' })

/** The parts of a split, each an amount, a category (opens the category
 *  sheet), who it is for (opens the choice sheet) and a note, with what is
 *  left to place against `total`. Shared by Split and Plan a payment. */
export function PartsEditor({ who, total, rows, onChange }: { who: string; total: number; rows: PartRow[]; onChange: (rows: PartRow[]) => void }) {
  const cats = useCategories()
  const tree = useMemo(() => catTree(cats.data ?? []), [cats.data])
  // One sheet answers for whichever row asked.
  const asking = useRef(0)
  const latest = useRef(rows)
  latest.current = rows
  const set = (i: number, patch: Partial<PartRow>) => onChange(latest.current.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const chooseCat = useCategoryChoice(`${who}-cat`, id => set(asking.current, { cat: id }))
  const chooseScope = useSheetChoice(`${who}-scope`, v => set(asking.current, { scope: v as Scope }))
  const left = remainder(total || 0, rows.map(r => ({ amount: Number(r.amount.replace(/[,\s₹]/g, '')) || 0 })))

  return (
    <View style={{ gap: 10 }}>
      {rows.map((r, i) => (
        <Card key={i} style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Label>Part {i + 1}</Label>
            <TextInput value={r.amount} onChangeText={v => set(i, { amount: v })} keyboardType="numbers-and-punctuation" placeholder="Amount"
              placeholderTextColor={C.text3} accessibilityLabel={`Amount of part ${i + 1}`}
              style={{ flex: 1, color: C.text, fontSize: 20, fontWeight: '700', textAlign: 'right', fontVariant: ['tabular-nums'], paddingVertical: 4 }} />
            {rows.length > 2 && (
              <Pressable onPress={() => onChange(rows.filter((_, j) => j !== i))} hitSlop={8} accessibilityLabel={`Remove part ${i + 1}`}>
                <Text style={{ color: C.text3, fontSize: 18 }}>✕</Text>
              </Pressable>
            )}
          </View>
          <Pressable onPress={() => { asking.current = i; chooseCat() }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.raised, borderRadius: 12, padding: 10 }}>
            <CatIcon name={tree.name(r.cat) ?? 'Uncategorised'} group={tree.root(r.cat)?.name} size={28} />
            <Text style={{ color: r.cat ? C.text : C.text2, fontSize: 15, flex: 1 }}>{r.cat ? tree.label(r.cat) : 'Pick a category'}</Text>
            <Text style={{ color: C.text3 }}>›</Text>
          </Pressable>
          <ChoiceRow label="For" value={scopeLabel(r.scope)} onPress={() => { asking.current = i; chooseScope({ title: `Who part ${i + 1} is for`, options: SCOPE_OPTIONS, value: r.scope }) }} />
          <TextInput value={r.note} onChangeText={v => set(i, { note: v })} placeholder="Note" placeholderTextColor={C.text3}
            style={{ color: C.text, fontSize: 15, backgroundColor: C.raised, borderRadius: 12, padding: 10 }} />
        </Card>
      ))}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable onPress={() => onChange([...rows, blankRow(left ? String(left) : '')])} style={{ backgroundColor: C.raised, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14 }}>
          <Text style={{ color: C.text, fontWeight: '700' }}>Add a part</Text>
        </Pressable>
        <Text style={{ color: left === 0 ? C.positive : C.caution, fontWeight: '700' }}>{left === 0 ? 'Adds up' : `Left to place: ${inrSigned(left)}`}</Text>
      </View>
    </View>
  )
}
