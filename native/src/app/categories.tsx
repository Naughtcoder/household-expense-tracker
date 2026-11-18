import { useMemo, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native'
import { Stack, router } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { catTree, titleCase, type Cat } from '@lib/cats.ts'
import { refreshAll, useCategories } from '@/lib/data'
import { act } from '@/lib/api'
import { useCategoryChoice } from '@/lib/setup-data'
import { CatIcon } from '@/components/CatIcon'
import { Card, Label } from '@/components/ui'
import { C } from '@/theme'

// A function, so it reads the palette in use at render, not at import.
const input = () => ({ backgroundColor: C.raised, color: C.text, borderRadius: 12, padding: 12, fontSize: 16 }) as const

/** Add a category anywhere in the tree, rename one, or move it under another.
 *  Nothing is deleted: a category with history is renamed or moved instead. */
export default function Categories() {
  const qc = useQueryClient()
  const cats = useCategories()
  const all = cats.data ?? []
  const tree = useMemo(() => catTree(cats.data ?? []), [cats.data])

  // Adding.
  const [name, setName] = useState('')
  const [parent, setParent] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)
  const [addMsg, setAddMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Changing one.
  const [editing, setEditing] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editParent, setEditParent] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [editMsg, setEditMsg] = useState<string | null>(null)

  // One sheet, two possible askers: the add form's parent, or a move.
  const [target, setTarget] = useState<'add' | 'edit'>('add')
  const choose = useCategoryChoice('categories', id => {
    if (target === 'add') { setParent(id); return }
    // It cannot move under itself or anything below it.
    if (editing !== null && tree.family(editing).includes(id)) { setEditMsg('It cannot sit under itself or anything inside it.'); return }
    setEditMsg(null); setEditParent(id)
  })
  const ask = (t: 'add' | 'edit') => { setTarget(t); choose() }

  const refresh = async () => { await qc.invalidateQueries({ queryKey: ['categories'] }); refreshAll(qc); qc.invalidateQueries({ queryKey: ['budgets'] }) }

  const add = async () => {
    if (!name.trim()) { setAddMsg({ ok: false, text: 'Give it a name.' }); return }
    setAdding(true); setAddMsg(null)
    try {
      await act('createCategory', { name, parentId: parent })
      setAddMsg({ ok: true, text: `Added ${titleCase(name)}.` }); setName(''); setParent(null)
      await refresh()
    } catch (e) { setAddMsg({ ok: false, text: (e as Error).message }) }
    setAdding(false)
  }

  const open = (c: Cat) => {
    if (editing === c.id) { setEditing(null); return }
    setEditing(c.id); setEditName(c.name); setEditParent(c.parent_id); setEditMsg(null)
  }
  const save = async () => {
    if (editing === null) return
    setSaving(true); setEditMsg(null)
    try {
      await act('editCategory', { id: editing, name: editName, parentId: editParent })
      setEditing(null)
      await refresh()
    } catch (e) { setEditMsg((e as Error).message) }
    setSaving(false)
  }

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 80 }}
      keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets
      refreshControl={<RefreshControl refreshing={cats.isRefetching} onRefresh={() => cats.refetch()} tintColor={C.text2} />}>
      <Stack.Screen options={{ title: 'Categories' }} />

      <Card style={{ gap: 10 }}>
        <Label>Add a category</Label>
        <Text style={{ color: C.text2, fontSize: 13 }}>Put it under any category to nest it, as deep as you like. Leave it at the top for a new group.</Text>
        <TextInput value={name} onChangeText={setName} placeholder="Name, for example Toll" placeholderTextColor={C.text3} autoCorrect={false} style={input()} onSubmitEditing={add} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable onPress={() => ask('add')} style={[input(), { flex: 1 }]}>
            <Text style={{ color: parent ? C.text : C.text2, fontSize: 16 }}>{parent ? `Under ${tree.label(parent, ' › ')}` : 'At the top, a new group'} ▾</Text>
          </Pressable>
          {parent !== null && <Pressable onPress={() => setParent(null)} style={input()}><Text style={{ color: C.text2 }}>Top</Text></Pressable>}
        </View>
        <Pressable onPress={add} disabled={adding} style={{ backgroundColor: C.accent, borderRadius: 12, padding: 12, alignItems: 'center', opacity: adding ? 0.5 : 1 }}>
          <Text style={{ color: C.accentText, fontWeight: '700' }}>{adding ? 'Adding' : 'Add category'}</Text>
        </Pressable>
        {addMsg && <Text style={{ color: addMsg.ok ? C.positive : C.negative }}>{addMsg.text}</Text>}
      </Card>

      <Card>
        <Label>All categories</Label>
        <View style={{ marginTop: 6 }}>
          {tree.flat().map(({ cat, depth }, i) => (
            <View key={cat.id} style={{ paddingLeft: depth * 18, paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Pressable onPress={() => router.push({ pathname: '/c/[id]', params: { id: String(cat.id) } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                  <CatIcon name={cat.name} group={tree.root(cat.id)?.name} size={depth ? 28 : 34} />
                  <Text style={{ color: C.text, fontWeight: depth ? '400' : '600', flexShrink: 1 }} numberOfLines={1}>{cat.name}</Text>
                </Pressable>
                <Pressable onPress={() => open(cat)} style={{ backgroundColor: C.raised, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 }}>
                  <Text style={{ color: C.text, fontWeight: '600', fontSize: 13 }}>{editing === cat.id ? 'Close' : 'Change'}</Text>
                </Pressable>
              </View>
              {editing === cat.id && (
                <View style={{ gap: 10, marginTop: 10 }}>
                  <TextInput value={editName} onChangeText={setEditName} placeholderTextColor={C.text3} autoCorrect={false} style={input()} />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable onPress={() => ask('edit')} style={[input(), { flex: 1 }]}>
                      <Text style={{ color: editParent ? C.text : C.text2, fontSize: 16 }}>{editParent ? `Under ${tree.label(editParent, ' › ')}` : 'At the top'} ▾</Text>
                    </Pressable>
                    {editParent !== null && <Pressable onPress={() => setEditParent(null)} style={input()}><Text style={{ color: C.text2 }}>Top</Text></Pressable>}
                  </View>
                  <Pressable onPress={save} disabled={saving} style={{ backgroundColor: C.accent, borderRadius: 12, padding: 12, alignItems: 'center', opacity: saving ? 0.5 : 1 }}>
                    <Text style={{ color: C.accentText, fontWeight: '700' }}>{saving ? 'Saving' : 'Save'}</Text>
                  </Pressable>
                  {editMsg && <Text style={{ color: C.negative }}>{editMsg}</Text>}
                </View>
              )}
            </View>
          ))}
          {all.length === 0 && !cats.isLoading && <Text style={{ color: C.text2 }}>{cats.error ? (cats.error as Error).message : 'No categories yet.'}</Text>}
        </View>
      </Card>
    </ScrollView>
  )
}
