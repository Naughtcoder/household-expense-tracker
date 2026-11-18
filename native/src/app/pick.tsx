import { useMemo, useState } from 'react'
import { Alert, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { CloseX } from '@/components/ui'
import { catMatches, catTree, titleCase, type Cat } from '@lib/cats.ts'
import { refreshAll, useCategories, useSaveTxn, useTxn } from '@/lib/data'
import { act } from '@/lib/api'
import { setChosen } from '@/lib/choice'
import { CatIcon } from '@/components/CatIcon'
import { C } from '@/theme'
import { useQueryClient } from '@tanstack/react-query'

/** The category sheet: groups first, then what is inside one, a search, and
 *  New category at the bottom. Tapping a category saves it straight away. */
export default function Pick() {
  const { txn, mode, same } = useLocalSearchParams<{ txn: string; mode?: string; same?: string }>()
  // From Review, filing goes through the website's own filing (it learns the
  // payee's category, files twins of it, takes a friend's pay-back off the cost).
  const fromReview = mode === 'review'
  const others = Number(same ?? 1)
  const [all, setAll] = useState(others > 1)
  const cats = useCategories()
  const t = useTxn(txn)
  const save = useSaveTxn()
  const qc = useQueryClient()
  const tree = useMemo(() => catTree(cats.data ?? []), [cats.data])
  const [group, setGroup] = useState<number | null>(null)
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [under, setUnder] = useState<number | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const pick = (id: number) => {
    // Choosing for a new payment on Add: hand the choice back, save nothing.
    if (mode === 'choose') { setChosen(id); router.back(); return }
    if (!t.data) return
    if (fromReview) {
      const p = t.data
      act('file', { id: p.id, categoryId: id, scope: p.scope === 'transfer' ? 'household' : p.scope, merchantKey: p.merchant_key, merchant: p.merchant, applyToAll: all && others > 1 })
        .then(() => refreshAll(qc))
        .catch(e => Alert.alert('Not filed', (e as Error).message))
    } else {
      save.mutate({ id: t.data.id, category_id: id, scope: t.data.scope, note: t.data.note ?? null, merchant: t.data.merchant })
    }
    router.back()
  }
  const term = q.trim().toLowerCase()
  const matches = term ? (cats.data ?? []).filter(c => tree.label(c.id).toLowerCase().includes(term) || catMatches(c.name, term)).slice(0, 16) : null
  const open = group !== null ? tree.get(group) : null
  const inside: { c: Cat; label: string }[] = []
  if (open) {
    const walk = (id: number, trail: string) => {
      for (const k of tree.children(id)) { const l = trail ? `${trail} › ${k.name}` : k.name; inside.push({ c: k, label: l }); walk(k.id, l) }
    }
    walk(open.id, '')
  }
  const startAdding = () => { setUnder(open?.id ?? null); setName(q.trim()); setNote(null); setAdding(true) }
  // Through the website, which refuses a second category of the same name in
  // the same place. One that already exists there is simply picked.
  const add = async () => {
    const clean = titleCase(name)
    if (!clean) { setNote('Give it a name.'); return }
    const there = (cats.data ?? []).find(c => c.name.toLowerCase() === clean.toLowerCase() && (c.parent_id ?? null) === under)
    if (there) { pick(there.id); return }
    try {
      const r = await act<{ id?: number; error?: string }>('createCategory', { name: clean, parentId: under })
      if (!r.id) { setNote(r.error ?? 'Could not add it.'); return }
      await qc.invalidateQueries({ queryKey: ['categories'] })
      pick(r.id)
    } catch (e) { setNote((e as Error).message) }
  }

  const Tile = ({ c, label, group: g, onPress, count }: { c: Cat; label: string; group?: string; onPress: () => void; count?: number }) => (
    <Pressable onPress={onPress} style={({ pressed }) => ({ width: '25%', alignItems: 'center', gap: 6, paddingVertical: 8, opacity: pressed ? 0.6 : 1 })}>
      <CatIcon name={c.name} group={g} size={46} />
      <Text style={{ color: t.data?.category_id === c.id ? C.text : C.text2, fontSize: 12, fontWeight: '600', textAlign: 'center' }} numberOfLines={2}>{label}</Text>
      {count ? <Text style={{ color: C.text3, fontSize: 10 }}>{count} inside</Text> : null}
    </Pressable>
  )

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.card }} contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: C.text, fontSize: 20, fontWeight: '700' }}>Category</Text>
        <CloseX onPress={() => router.back()} />
      </View>
      {fromReview && others > 1 && (
        <Pressable onPress={() => setAll(a => !a)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: 12, backgroundColor: C.raised }}>
          <Text style={{ color: C.text, fontWeight: '600', flex: 1 }}>File all {others} waiting from {t.data?.merchant ?? 'this payee'}</Text>
          <Switch value={all} onValueChange={setAll} />
        </Pressable>
      )}
      <TextInput placeholder="Type to find a category" placeholderTextColor={C.text3} value={q} onChangeText={setQ}
        style={{ backgroundColor: C.raised, color: C.text, borderRadius: 12, padding: 12, fontSize: 16 }} />
      {open && !matches && (
        <Pressable onPress={() => setGroup(null)}><Text style={{ color: C.text2, fontWeight: '600' }}>‹ All groups</Text></Pressable>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {matches
          ? matches.map(c => <Tile key={c.id} c={c} label={tree.label(c.id, ' › ')} group={tree.root(c.id)?.name} onPress={() => pick(c.id)} />)
          : open
            ? [<Tile key="g" c={open} label={tree.hasChildren(open.id) ? `${open.name}, general` : open.name} group={open.name} onPress={() => pick(open.id)} />,
               ...inside.map(({ c, label }) => <Tile key={c.id} c={c} label={label} group={open.name} onPress={() => pick(c.id)} />)]
            : tree.roots().map(r => <Tile key={r.id} c={r} label={r.name} group={r.name} count={tree.children(r.id).length}
                onPress={() => (tree.hasChildren(r.id) ? setGroup(r.id) : pick(r.id))} />)}
      </View>
      {matches && matches.length === 0 && !adding && (
        <Text style={{ color: C.text2 }}>No category called “{q.trim()}” yet.</Text>
      )}
      {adding ? (
        <View style={{ gap: 10, padding: 12, borderRadius: 14, backgroundColor: C.raised }}>
          <TextInput autoFocus placeholder="Name, for example Mobile" placeholderTextColor={C.text3}
            value={name} onChangeText={setName} onSubmitEditing={add}
            style={{ backgroundColor: C.card, color: C.text, borderRadius: 10, padding: 12, fontSize: 16 }} />
          <Text style={{ color: C.text2, fontSize: 13, fontWeight: '600' }}>Goes in</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>
            {[{ id: null as number | null, name: 'Its own group' }, ...tree.roots()].map(r => (
              <Pressable key={r.id ?? 'top'} onPress={() => setUnder(r.id)}
                style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: under === r.id ? C.accent : C.card }}>
                <Text style={{ color: under === r.id ? C.accentText : C.text, fontWeight: '600', fontSize: 13 }}>{r.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Text style={{ color: C.text3, fontSize: 12 }}>
            {under === null ? 'A new group of its own, like Utilities.' : `A category inside ${tree.label(under, ' › ')}.`}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={add} style={{ flex: 1, backgroundColor: C.accent, borderRadius: 12, padding: 12, alignItems: 'center' }}>
              <Text style={{ color: C.accentText, fontWeight: '700' }}>Add and pick it</Text>
            </Pressable>
            <Pressable onPress={() => { setAdding(false); setNote(null) }} style={{ borderRadius: 12, padding: 12, backgroundColor: C.card }}>
              <Text style={{ color: C.text2, fontWeight: '600' }}>Cancel</Text>
            </Pressable>
          </View>
          {note && <Text style={{ color: C.negative }}>{note}</Text>}
        </View>
      ) : (
        <Pressable onPress={startAdding} style={{ borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.text3, borderRadius: 14, padding: 14, alignItems: 'center' }}>
          <Text style={{ color: C.text, fontWeight: '700' }}>
            {matches && matches.length === 0 ? `+ Add “${q.trim()}”` : `+ New category${open ? ` in ${open.name}` : ''}`}
          </Text>
        </Pressable>
      )}
    </ScrollView>
  )
}
