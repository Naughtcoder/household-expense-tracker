import { useCallback, useEffect, useState } from 'react'
import { AppState, Platform, Pressable, ScrollView, Text, View } from 'react-native'
import { router } from 'expo-router'
import { Card } from '@/components/ui'
import { C } from '@/theme'
import { SITE, act } from '@/lib/api'
import * as Readers from '../../modules/payment-readers'

const RESTRICTED = 'Android blocked SMS access. Tap Open on Keep it running below, then the menu at the top right, then Allow restricted settings and confirm. Then tap Permissions, SMS, Allow. Come back here and tap Allow again.'
const NO_LINK_ACTION = 'The website cannot make a key for the app yet. It needs the linkThisPhone action added to /api/app.'

/**
 * The phone's payment readers, the same steps as the website's /phone page
 * had in the old Android app: link the phone, allow SMS, read past texts,
 * switch on the screen and notification readers, keep it running.
 */
export default function PhoneReaders() {
  const [s, setS] = useState<Readers.ReaderStatus>(() => Readers.status())
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const refresh = useCallback(() => setS(Readers.status()), [])

  // Coming back from Android's settings: show what changed.
  useEffect(() => {
    const sub = AppState.addEventListener('change', a => { if (a === 'active') refresh() })
    return () => sub.remove()
  }, [refresh])

  if (Platform.OS !== 'android' || !s.available) {
    return (
      <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: 16 }}>
        <Card>
          <Text style={{ color: C.text, fontWeight: '700', fontSize: 16 }}>Android only</Text>
          <Text style={{ color: C.text2, marginTop: 6 }}>The payment readers run inside the Android app. On an iPhone there is nothing to set up here.</Text>
        </Card>
      </ScrollView>
    )
  }

  async function run(f: () => Promise<unknown> | void) {
    setBusy(true); setMsg(null)
    try { await f() } catch (e) { setMsg((e as Error).message ?? String(e)) }
    refresh()
    setBusy(false)
  }

  const step = (done: boolean, title: string, sub: string, action: string, onPress: () => void, first = false) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: first ? 0 : 1, borderTopColor: C.line }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.raised, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: done ? C.positive : C.text3, fontSize: 18, fontWeight: '700' }}>{done ? '✓' : '•'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: C.text, fontSize: 16, fontWeight: '600' }}>{title}</Text>
        <Text style={{ color: C.text2, fontSize: 13, marginTop: 2 }}>{sub}</Text>
      </View>
      {!done && (
        <Pressable disabled={busy} onPress={onPress}
          style={({ pressed }) => ({ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: C.raised, opacity: busy ? 0.5 : pressed ? 0.6 : 1 })}>
          <Text style={{ color: C.text, fontWeight: '600' }}>{action}</Text>
        </Pressable>
      )}
    </View>
  )

  const smsOn = s.permission === 'granted'
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 60 }}>
      <Card style={{ paddingVertical: 4 }}>
        {step(s.linked, 'Link this phone', s.linked ? 'Linked' : 'Gives this phone its own key', 'Link', () => run(async () => {
          let r: { key?: string; error?: string }
          try { r = await act<{ key?: string; error?: string }>('linkThisPhone', { label: 'Android SMS reader' }) }
          catch (e) { throw new Error(/Unknown action/.test((e as Error).message) ? NO_LINK_ACTION : (e as Error).message) }
          if (!r.key) throw new Error(r.error ?? 'Could not link')
          await Readers.link(r.key, SITE)
        }), true)}
        {step(smsOn, 'Allow SMS', smsOn ? 'Bank texts are read as they arrive' : 'Only bank texts are sent, never personal ones', 'Allow', () => run(async () => {
          const r = await Readers.requestSmsPermission()
          // Android blocks SMS for apps installed from a file until restricted
          // settings are allowed on the app's info page. Say how, here.
          if (r.permission !== 'granted') setMsg(RESTRICTED)
        }))}
        {step(false, 'Read past bank texts', s.historyDone ? 'Done once. Safe to run again, nothing is booked twice' : 'The last 2 years, filed quietly', s.historyDone ? 'Again' : 'Read', () => run(async () => {
          const r = await Readers.readHistory(24)
          setMsg(`Found ${r.found} bank texts, sending ${r.queued}. They file in the background.`)
        }))}
        {step(s.screenReader, 'Read payment screens',
          s.screenReader ? 'On. PhonePe, Google Pay, Paytm, BHIM and YONO payments are recorded as you pay'
            : 'Catches UPI payments SBI sends no text for. Tap Open, then Installed apps (or Downloaded apps), Household Expense Tracker payment reader, switch it on',
          'Open', () => run(() => {
            setMsg('If Android says the setting is restricted: open Household Expense Tracker in Settings, Apps, tap the menu at the top right, Allow restricted settings, then try again.')
            Readers.openScreenReaderSettings()
          }))}
        {step(s.notificationReader, 'Read payment notifications',
          s.notificationReader ? 'On, for the payment apps only' : 'A backup for the screen reader. Tap Open, then Household Expense Tracker, Allow',
          'Open', () => run(() => Readers.openNotificationSettings()))}
        {step(false, 'Keep it running', 'Turn off battery saving for Household Expense Tracker', 'Open', () => run(() => Readers.openBatterySettings()))}
      </Card>
      {/* What the readers missed (they were off, or the bank sent no text) is still in PhonePe's History. */}
      <Pressable onPress={() => router.push('/import-history' as never)} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
        <Card>
          <Text style={{ color: C.text, fontSize: 16, fontWeight: '600' }}>Missed some payments? ›</Text>
          <Text style={{ color: C.text2, fontSize: 13, marginTop: 2 }}>Add them from a PhonePe History screenshot</Text>
        </Card>
      </Pressable>
      {(s.queued > 0 || s.lastSent > 0) && (
        <Text style={{ color: C.text2, marginHorizontal: 2 }}>
          {s.queued ? `${s.queued} waiting to send. ` : ''}{s.lastSent ? `Last sent ${new Date(s.lastSent).toLocaleString('en-IN')}.` : ''}
        </Text>
      )}
      {msg && <Card><Text style={{ color: C.text }}>{msg}</Text></Card>}
    </ScrollView>
  )
}
