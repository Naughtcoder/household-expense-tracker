import { useState } from 'react'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { Stack } from 'expo-router'
import * as DocumentPicker from 'expo-document-picker'
import { File } from 'expo-file-system'
import { useQueryClient } from '@tanstack/react-query'
import { dayLabel } from '@lib/format.ts'
import { act } from '@/lib/api'
import { refreshAll } from '@/lib/data'
import { Card, Label, inr } from '@/components/ui'
import { C } from '@/theme'

// The same shapes app/import/actions.ts returns. Copied, not imported: that
// file is server-only.
type Preview = {
  format: string; total: number; debits: number; credits: number
  from: string | null; to: string | null
  recognised: number; unknownMerchants: string[]; skipped: string[]
}
type ImportResult = { error?: string; saved?: number; duplicates?: number; toReview?: number; message?: string }
type BulkResult = ImportResult & { done?: boolean; next?: number; total?: number }

// A function, so it reads the palette in use at render, not at import.
const input = () => ({ backgroundColor: C.raised, color: C.text, borderRadius: 12, padding: 12, fontSize: 14 }) as const
const n = (v: number) => v.toLocaleString('en-IN')

/** A card statement as CSV, read on the phone and filed by the website, so
 *  both import exactly the same way. */
export default function ImportScreen() {
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [text, setText] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [done, setDone] = useState<ImportResult | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [pasting, setPasting] = useState(false)
  const [pasted, setPasted] = useState('')

  const read = async (body: string, label: string) => {
    setProblem(null); setPreview(null); setDone(null)
    setName(label); setText(body)
    setBusy(true)
    try { setPreview(await act<Preview>('previewStatement', { text: body })) }
    catch (e) { setProblem((e as Error).message) }
    setBusy(false)
  }

  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/vnd.ms-excel', '*/*'],
      copyToCacheDirectory: true,
    })
    if (res.canceled || !res.assets?.[0]) return
    const file = res.assets[0]
    try { await read(await new File(file.uri).text(), file.name) }
    catch (e) { setProblem(`Could not read that file: ${(e as Error).message}`) }
  }

  // Anything large goes in chunks, so one slow request cannot time out and lose
  // the lot. Each chunk is safe to repeat.
  const runBulk = async (body: string) => {
    let offset = 0, saved = 0, dupes = 0
    for (;;) {
      const res = await act<BulkResult>('importBulk', { text: body, offset })
      saved += res.saved ?? 0
      dupes += res.duplicates ?? 0
      setProgress(`${n(Math.min(offset + 800, res.total ?? 0))} of ${n(res.total ?? 0)} read, ${n(saved)} added`)
      if (res.done || res.next === undefined) break
      offset = res.next
    }
    setProgress(null)
    setDone({ saved, duplicates: dupes, message: `${n(saved)} added, ${n(dupes)} already there.` })
  }

  const doImport = async () => {
    if (!preview || !text) return
    setBusy(true); setProblem(null)
    try {
      if (preview.total > 400) await runBulk(text)
      else setDone(await act<ImportResult>('importStatement', { text }))
      refreshAll(qc)
    } catch (e) { setProblem((e as Error).message); setProgress(null) }
    setBusy(false)
  }

  const row = (label: string, value: string, sub?: string, color: string = C.text) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: label === 'Transactions' ? 0 : 1, borderTopColor: C.line }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: C.text }}>{label}</Text>
        {sub && <Text style={{ color: C.text2, fontSize: 12 }}>{sub}</Text>}
      </View>
      <Text style={{ color, fontVariant: ['tabular-nums'], fontWeight: '600' }}>{value}</Text>
    </View>
  )

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 80 }}
      keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <Stack.Screen options={{ title: 'Import a statement' }} />
      <Text style={{ color: C.text2 }}>
        For everything that happened before the app existed, and for anything a message never reached you about.
      </Text>

      <Card style={{ gap: 12 }}>
        <View>
          <Text style={{ color: C.text, fontSize: 17, fontWeight: '700' }}>Pick a file</Text>
          <Text style={{ color: C.text2, marginTop: 4 }}>An BankA credit card statement, downloaded as CSV from the card portal.</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Pressable onPress={pick} disabled={busy} style={{ backgroundColor: C.accent, borderRadius: 12, padding: 12, paddingHorizontal: 18, alignItems: 'center', opacity: busy ? 0.5 : 1 }}>
            <Text style={{ color: C.accentText, fontWeight: '700' }}>{busy && !preview ? 'Reading' : 'Choose a CSV file'}</Text>
          </Pressable>
          <Pressable onPress={() => setPasting(p => !p)} style={{ backgroundColor: C.raised, borderRadius: 12, padding: 12, paddingHorizontal: 18, alignItems: 'center' }}>
            <Text style={{ color: C.text, fontWeight: '600' }}>{pasting ? 'Hide the text box' : 'Paste the CSV text'}</Text>
          </Pressable>
        </View>
        {pasting && (
          <View style={{ gap: 8 }}>
            <TextInput value={pasted} onChangeText={setPasted} multiline placeholder="Paste the whole CSV here, header row included" placeholderTextColor={C.text3}
              autoCapitalize="none" autoCorrect={false} style={[input(), { minHeight: 140, textAlignVertical: 'top', fontFamily: 'Menlo' }]} />
            <Pressable onPress={() => read(pasted, 'Pasted text')} disabled={busy || !pasted.trim()}
              style={{ alignSelf: 'flex-start', backgroundColor: C.raised, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, opacity: busy || !pasted.trim() ? 0.5 : 1 }}>
              <Text style={{ color: C.text, fontWeight: '600' }}>Read it</Text>
            </Pressable>
          </View>
        )}
        {name !== '' && <Text style={{ color: C.text2 }}>{name}</Text>}
        {problem && <Text style={{ color: C.caution, fontFamily: 'Menlo', fontSize: 13 }}>{problem}</Text>}
      </Card>

      {preview && !done && (
        <Card style={{ gap: 12 }}>
          <View>
            <Text style={{ color: C.text, fontSize: 17, fontWeight: '700' }}>What is in it</Text>
            <Text style={{ color: C.text2, marginTop: 4 }}>Read as a {preview.format}. Nothing is saved yet.</Text>
          </View>

          <View>
            {row('Transactions', n(preview.total))}
            {row('Spending', inr(preview.debits))}
            {preview.credits > 0 && row('Credits and payments', inr(preview.credits), undefined, C.positive)}
            {row('Period', `${preview.from ? dayLabel(preview.from) : '?'} to ${preview.to ? dayLabel(preview.to) : '?'}`)}
            {row('Merchants already known', n(preview.recognised), 'the rest will wait in Review')}
          </View>

          {preview.unknownMerchants.length > 0 && (
            <View style={{ gap: 8 }}>
              <Label>New to the app</Label>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                {preview.unknownMerchants.map(m => (
                  <View key={m} style={{ backgroundColor: C.raised, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 10 }}>
                    <Text style={{ color: C.text2, fontSize: 13 }}>{m}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {preview.skipped.length > 0 && (
            <View style={{ gap: 6 }}>
              <Label>Lines skipped</Label>
              {preview.skipped.slice(0, 10).map((s, i) => <Text key={i} style={{ color: C.text3, fontSize: 12, fontFamily: 'Menlo' }}>{s}</Text>)}
              {preview.skipped.length > 10 && <Text style={{ color: C.text3, fontSize: 12 }}>and {n(preview.skipped.length - 10)} more</Text>}
            </View>
          )}

          <Text style={{ color: C.text2 }}>
            Card bill payments and GST lines are left out, since neither is spending.
            Anything that looks like something already here goes to Review rather than being refused.
          </Text>

          <Pressable onPress={doImport} disabled={busy} style={{ backgroundColor: C.accent, borderRadius: 12, padding: 12, alignItems: 'center', opacity: busy ? 0.5 : 1 }}>
            <Text style={{ color: C.accentText, fontWeight: '700' }}>{busy ? (progress ?? 'Importing') : `Import ${n(preview.total)} transactions`}</Text>
          </Pressable>
        </Card>
      )}

      {done && (
        <Card>
          <Text style={{ color: C.text, fontSize: 17, fontWeight: '700' }}>Done</Text>
          <Text style={{ color: C.text2, marginTop: 6 }}>{done.message}</Text>
        </Card>
      )}

      <Card>
        <Label>Where to get the file</Label>
        <Text style={{ color: C.text2, marginTop: 8 }}>
          BankA net banking, Cards, then Statements, downloaded as CSV rather than PDF.
          Money Manager exports from its own menu, and its categories are kept rather than thrown away.
        </Text>
      </Card>
    </ScrollView>
  )
}
