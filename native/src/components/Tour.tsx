import { useEffect, useState } from 'react'
import { Modal, Pressable, Text, View } from 'react-native'
import { router } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { SymbolView } from 'expo-symbols'
import { IS_DEMO } from '@/lib/variant'
import { C } from '@/theme'

// The demo app's walkthrough: a card at the bottom of the screen, over the
// screen it describes, so the app behind it is the illustration. Shown the
// first time the demo opens; More has "Replay the tour".

type Step = { title: string; body: string; icon: string; go?: string }

const STEPS: Step[] = [
  { title: 'A made-up household', icon: 'house.fill', go: '/',
    body: 'This is a demo. Rohan and Meera, their salaries and every payment are invented. Press anything: nothing is saved, and it all resets when the app closes.' },
  { title: 'Safe by design', icon: 'lock.shield.fill', go: '/privacy',
    body: 'No bank passwords, no OTPs, no way to move money. Payments come from the alerts your bank already sends, and only your household can see them. Every safety question is answered on this page, and under More.' },
  { title: 'Month', icon: 'calendar', go: '/',
    body: 'This month at a glance: what came in, what went out, and where it went by group. Every number opens the payments behind it, down to a single one.' },
  { title: 'Review', icon: 'tray.fill', go: '/review',
    body: 'Payments the app cannot place wait here. Pick a category once and it remembers the payee for next time.' },
  { title: 'Add', icon: 'plus.circle.fill', go: '/add',
    body: 'In the real app, payments arrive by themselves from bank messages. Here you can add one by hand to see it land.' },
  { title: 'iPhone and Android', icon: 'iphone', go: '/platforms',
    body: 'The same app on both, with four differences: how payments get in, what you set up, the home-screen widget, and how you install it. Android reads bank texts itself. iPhone forwards them with a Shortcuts automation.' },
  { title: 'Work claims', icon: 'doc.text', go: '/claimable',
    body: 'Paid for something work will repay? Mark it as a work claim. It stays out of household spending and waits here as owed. When the repayment lands, tick the claims it covered, pick the repayment, and tap Mark settled. Each month shows what is still owed and what came back.' },
  { title: 'Insights', icon: 'chart.bar.fill', go: '/insights',
    body: 'Week, month or year: money in and out, where it went, and who paid. Tax paid shows the tax for the financial year, including what came out of salaries.' },
  { title: 'Go deeper', icon: 'square.grid.2x2', go: '/c/2',
    body: 'Every category has its own page: two years of months, what is inside it, and each month split by who paid. Try Rohan and Meera at the top.' },
]

// Keyed to the cards themselves, so a build that adds or renames a card
// shows the tour again to people who saw the older one.
const SEEN = `demo-tour-seen:${STEPS.map(s => s.title).join('|')}`
let open: (() => void) | null = null

/** Starts the walkthrough from the first card. */
export const startTour = () => open?.()

export function Tour() {
  const [step, setStep] = useState<number | null>(null)
  useEffect(() => {
    if (!IS_DEMO) return
    open = () => setStep(0)
    AsyncStorage.getItem(SEEN).then(v => { if (!v) setTimeout(() => setStep(0), 900) }).catch(() => {})
    return () => { open = null }
  }, [])
  useEffect(() => {
    const s = step === null ? null : STEPS[step]
    if (s?.go) router.navigate(s.go as never)
  }, [step])
  if (!IS_DEMO || step === null) return null
  const s = STEPS[step]
  const last = step === STEPS.length - 1
  const close = () => { setStep(null); AsyncStorage.setItem(SEEN, '1').catch(() => {}); router.navigate('/') }

  return (
    <Modal transparent animationType="fade" visible onRequestClose={close}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.25)', padding: 14, paddingBottom: 110 }}>
        <View style={{ backgroundColor: C.card, borderRadius: 22, padding: 20, gap: 12, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 20, elevation: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.raised, alignItems: 'center', justifyContent: 'center' }}>
              <SymbolView name={s.icon as never} tintColor={C.accent} size={22} />
            </View>
            <Text style={{ color: C.text, fontSize: 20, fontWeight: '800', flex: 1 }}>{s.title}</Text>
            <Text style={{ color: C.text3, fontSize: 13 }}>{step + 1} of {STEPS.length}</Text>
          </View>
          <Text style={{ color: C.text2, fontSize: 16, lineHeight: 22 }}>{s.body}</Text>
          {last && <Text style={{ color: C.text3, fontSize: 13 }}>Replay this tour any time from More.</Text>}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
            {!last && (
              <Pressable onPress={close} style={{ paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, backgroundColor: C.raised }}>
                <Text style={{ color: C.text2, fontWeight: '700' }}>Skip</Text>
              </Pressable>
            )}
            {step > 0 && (
              <Pressable onPress={() => setStep(step - 1)} style={{ paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, backgroundColor: C.raised }}>
                <Text style={{ color: C.text, fontWeight: '700' }}>Back</Text>
              </Pressable>
            )}
            <Pressable onPress={() => (last ? close() : setStep(step + 1))} style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: C.accent, alignItems: 'center' }}>
              <Text style={{ color: C.accentText, fontWeight: '800' }}>{last ? 'Start exploring' : 'Next'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}
