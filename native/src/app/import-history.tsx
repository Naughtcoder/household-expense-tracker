import { useCallback, useEffect, useState } from 'react'
import { AppState, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import * as DocumentPicker from 'expo-document-picker'
import { useQueryClient } from '@tanstack/react-query'
import { dayLabel } from '@lib/format.ts'
import { act } from '@/lib/api'
import { PEOPLE, refreshAll } from '@/lib/data'
import { Card, Label, Pills, inr } from '@/components/ui'
import { C } from '@/theme'
import * as Readers from '../../modules/payment-readers'

// The shapes app/add/actions.ts returns. Copied, not imported: that file is server-only.
type Row = { label: string; payee: string; amount: number; date: string; direction: 'debit' | 'credit'; inBooks: boolean }
type Read = { error?: string; paidBy?: string; rows?: Row[]; unread?: string[] }
type Picked = Row & { on: boolean; amountText: string }

const key = (r: { payee: string; amount: number; date: string }) => `${r.payee.toUpperCase()}|${r.amount}|${r.date}`

/**
 * Payments from a PhonePe History screenshot. The screenshot arrives by
 * Share (ShareShotActivity) or is picked here; its text is read on the phone
 * and only the text goes to the website, which rebuilds the rows. Each row is
 * ticked unless the books already have that amount on that day.
 *
 * Why: SBI sends Sam no text for UPI payments, so whatever she paid while
 * the readers were off is only in PhonePe (17 Oct 2026). Opened from the gap
 * alarm with ?gap=<alarm id>&who=<person>, it can also close that alarm.
 */
export default function ImportHistory() {
  const qc = useQueryClient()
  const { gap, who } = useLocalSearchParams<{ gap?: string; who?: string }>()
  const [paidBy, setPaidBy] = useState<string | null>(who && PEOPLE[who] ? who : null)
  const [rows, setRows] = useState<Picked[]>([])
  const [unread, setUnread] = useState<string[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const can = Readers.canReadShots()

  const readOne = useCallback(async (uri: string, takenAt: number) => {
    const shot = await Readers.readShot(uri)
    if (!shot) throw new Error('This phone cannot read screenshots.')
    const res = await act<Read>('readHistoryShot', {
      lines: shot.lines,
      takenAt: new Date(shot.takenAt || takenAt || Date.now()).toISOString(),
      ...(paidBy ? { paidBy } : {}),
    })
    if (res.error) throw new Error(res.error)
    setRows(prev => {
      const seen = new Set(prev.map(key))
      const fresh = (res.rows ?? []).filter(r => !seen.has(key(r)))
        .map(r => ({ ...r, on: r.direction === 'debit' && !r.inBooks, amountText: String(r.amount) }))
      return [...prev, ...fresh].sort((a, b) => (a.date < b.date ? 1 : -1))
    })
    setUnread(prev => [...prev, ...(res.unread ?? [])])
  }, [paidBy])

  // Screenshots shared to the app, now and whenever it comes back to the front.
  const takeShared = useCallback(async () => {
    const shots = await Readers.takeSharedShots()
    if (!shots.length) return
    setBusy(`Reading ${shots.length} screenshot${shots.length === 1 ? '' : 's'}…`); setMsg(null)
    try { for (const s of shots) await readOne(s.uri, s.takenAt) } catch (e) { setMsg((e as Error).message) }
    setBusy(null)
  }, [readOne])
  useEffect(() => {
    takeShared()
    const sub = AppState.addEventListener('change', a => { if (a === 'active') takeShared() })
    return () => sub.remove()
  }, [takeShared])

  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true, multiple: true })
    if (res.canceled || !res.assets?.length) return
    setBusy('Reading…'); setMsg(null)
    try { for (const a of res.assets) await readOne(a.uri, a.lastModified ?? 0) } catch (e) { setMsg((e as Error).message) }
    setBusy(null)
  }

  const chosen = rows.filter(r => r.on && r.direction === 'debit' && Number(r.amountText) > 0)
  const add = async () => {
    setBusy('Adding…'); setMsg(null)
    try {
      const res = await act<{ saved?: number; duplicates?: number; error?: string }>('addHistoryRows', {
        rows: chosen.map(r => ({ label: r.label, payee: r.payee, amount: Number(r.amountText), date: r.date, direction: r.direction })),
        ...(paidBy ? { paidBy } : {}),
      })
      if (res.error) throw new Error(res.error)
      refreshAll(qc)
      setRows(prev => prev.map(r => (r.on ? { ...r, on: false, inBooks: true } : r)))
      setMsg(`${res.saved ?? 0} added${res.duplicates ? `, ${res.duplicates} were already there` : ''}.`)
    } catch (e) { setMsg((e as Error).message) }
    setBusy(null)
  }

  const closeGap = async () => {
    setBusy('Closing…')
    try { await act('closeGap', { id: Number(gap) }); refreshAll(qc); router.back() } catch (e) { setMsg((e as Error).message) }
    setBusy(null)
  }

  const set = (i: number, patch: Partial<Picked>) => setRows(prev => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const button = (label: string, onPress: () => void, primary = false, disabled = false) => (
    <Pressable onPress={onPress} disabled={!!busy || disabled}
      style={({ pressed }) => ({ backgroundColor: primary ? C.accent : C.raised, borderRadius: 12, padding: 12, paddingHorizontal: 18, alignItems: 'center', opacity: busy || disabled ? 0.5 : pressed ? 0.7 : 1 })}>
      <Text style={{ color: primary ? '#fff' : C.text, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  )

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, gap: 14 }}>
      <Card style={{ gap: 10 }}>
        <Text style={{ color: C.text, fontSize: 16, fontWeight: '700' }}>Payments from a PhonePe screenshot</Text>
        <Text style={{ color: C.text2, fontSize: 14, lineHeight: 20 }}>
          In PhonePe open History and take a screenshot, scrolling for more if needed. Share it to Household Expense Tracker, or pick it here.
          The text is read on this phone; the picture is not sent anywhere.
        </Text>
        {can ? button('Pick screenshots', pick, true) : (
          <Text style={{ color: C.text2 }}>This phone cannot read screenshots. Install Android app build 12 or later.</Text>
        )}
      </Card>

      <View style={{ gap: 6 }}>
        <Label>Paid by</Label>
        <Pills options={[[null, 'Me'], ...Object.entries(PEOPLE).sort((a, b) => a[1].localeCompare(b[1]))] as [string | null, string][]} value={paidBy} onChange={setPaidBy} />
      </View>

      {busy && <Text style={{ color: C.text2 }}>{busy}</Text>}
      {msg && <Text style={{ color: C.text }}>{msg}</Text>}

      {rows.length > 0 && (
        <Card style={{ gap: 0 }}>
          {rows.map((r, i) => (
            <Pressable key={key(r)} onPress={() => r.direction === 'debit' && set(i, { on: !r.on })}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: C.line, opacity: r.direction === 'debit' ? 1 : 0.5 }}>
              <Text style={{ color: r.on ? C.positive : C.text3, fontSize: 20, width: 22 }}>{r.on ? '☑' : '☐'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>{r.payee}</Text>
                <Text style={{ color: C.text2, fontSize: 13 }}>
                  {dayLabel(r.date)}{r.direction === 'credit' ? ' · money in, not added' : r.inBooks ? ' · already in the app' : ''}
                </Text>
              </View>
              {/* Editable: a misread rupee sign is the likeliest mistake, so the amount can be put right here. */}
              <TextInput value={r.amountText} onChangeText={t => set(i, { amountText: t.replace(/[^0-9.]/g, '') })}
                keyboardType="decimal-pad" editable={r.direction === 'debit'}
                style={{ color: C.text, backgroundColor: C.raised, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, minWidth: 84, textAlign: 'right', fontVariant: ['tabular-nums'] }} />
            </Pressable>
          ))}
        </Card>
      )}

      {unread.length > 0 && (
        <Card style={{ gap: 6 }}>
          <Text style={{ color: C.text, fontWeight: '700' }}>{unread.length} row{unread.length === 1 ? '' : 's'} could not be read</Text>
          {unread.slice(0, 5).map((u, i) => <Text key={i} style={{ color: C.text2, fontSize: 13 }} numberOfLines={2}>{u}</Text>)}
          <Text style={{ color: C.text2, fontSize: 13 }}>Add those by hand, or send the screenshot to Alex.</Text>
        </Card>
      )}

      {rows.length > 0 && button(chosen.length ? `Add ${chosen.length} payment${chosen.length === 1 ? '' : 's'} (${inr(chosen.reduce((n, r) => n + Number(r.amountText), 0))})` : 'Nothing ticked', add, true, !chosen.length)}
      {gap ? button('Done, nothing else is missing', closeGap) : null}
    </ScrollView>
  )
}
