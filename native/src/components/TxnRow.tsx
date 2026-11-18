import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { router } from 'expo-router'
import type { catTree } from '@lib/cats.ts'
import type { Txn } from '@/lib/data'
import { inrSigned } from '@/lib/split-data'
import { CatIcon } from './CatIcon'
import { inr } from './ui'
import { C } from '@/theme'

/** One payment in a list: icon, payee, category and who, amount. Transfers
 *  between the two of them are greyed and marked as not spending. A split
 *  payment (from collapseSplits in lib/splits.ts) shows once, at what the
 *  bank took, with "Split into N" opening its parts. */
export function TxnRow({ t, tree, sub }: { t: Txn & { parts?: Txn[]; shown?: number }; tree: ReturnType<typeof catTree>; sub?: string }) {
  const [open, setOpen] = useState(false)
  const transfer = t.scope === 'transfer'
  const credit = t.direction === 'credit'
  const cat = tree.name(t.category_id)
  const amount = t.shown ?? Number(t.amount)
  return (
    <View>
      <Pressable onPress={() => router.push(`/t/${t.id}`)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, opacity: pressed ? 0.6 : 1 })}>
        <CatIcon name={transfer ? 'Transfer' : cat ?? 'Uncategorised'} group={tree.root(t.category_id)?.name} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.text, fontSize: 16, fontWeight: '600' }} numberOfLines={1}>{t.merchant ?? t.merchant_key ?? 'Unknown'}</Text>
          <Text style={{ color: C.text2, fontSize: 13 }} numberOfLines={1}>
            {sub ?? `${t.parts ? `Split into ${t.parts.length}` : transfer ? 'Transfer, not spending' : cat ?? 'No category'}${t.paid?.name ? ` · ${t.paid.name}` : ''}${t.scope === 'claimable' ? ' · claimable' : ''}${t.status === 'review' ? ' · in Review' : ''}`}
          </Text>
        </View>
        <Text style={{ color: transfer ? C.text3 : credit ? C.positive : C.text, fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
          {transfer ? '⇄ ' : credit ? '+' : amount < 0 ? '−' : ''}{inr(amount)}
        </Text>
      </Pressable>
      {t.parts && (
        <View style={{ marginLeft: 52, marginTop: -4, marginBottom: 6 }}>
          <Pressable onPress={() => setOpen(o => !o)} hitSlop={6}>
            <Text style={{ color: C.text2, fontSize: 13 }}>{open ? 'Hide the parts ▴' : `Show the ${t.parts.length} parts ▾`}</Text>
          </Pressable>
          {open && t.parts.map(x => (
            <Pressable key={x.id} onPress={() => x.category_id ? router.push({ pathname: '/c/[id]', params: { id: String(x.category_id), m: x.occurred_on.slice(0, 7) } }) : router.push(`/t/${x.id}`)}
              style={({ pressed }) => ({ flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 4, opacity: pressed ? 0.6 : 1 })}>
              <Text style={{ color: C.text2, fontSize: 13, flex: 1 }} numberOfLines={1}>{tree.label(x.category_id) || 'No category'}{x.note ? ` · ${x.note}` : ''}</Text>
              <Text style={{ color: C.text2, fontSize: 13, fontVariant: ['tabular-nums'] }}>{inrSigned(Number(x.amount))}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  )
}

export const dayLabel = (iso: string) => new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
