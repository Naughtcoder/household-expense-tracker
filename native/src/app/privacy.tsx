import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { Stack } from 'expo-router'
import { Card, Label } from '@/components/ui'
import { C } from '@/theme'

// The questions people ask before they trust an expense app with their
// money, answered for the REAL app (what happens to their own data once they
// use it), not for this demo. Every answer has to stay true of the code: no
// bank login, OTP messages refused (lib/patterns.ts), iPhone automation posts
// that are not payments discarded and Android readers send only bank texts
// (app/api/ingest), no AI service, no analytics, both people see everything.

type QA = { q: string; a: string }

const SECTIONS: { title: string; items: QA[] }[] = [
  { title: 'Getting your payments in', items: [
    { q: 'Does it need my bank login, password or PIN?', a: 'No. It never asks for a bank password, PIN, card number or one-time password, and it is not connected to your bank in any way.' },
    { q: 'Then how do payments get in?', a: 'From the alert your bank already sends you after you pay. On Android you allow the app to read those alerts. On iPhone, which does not let apps read texts, a Shortcuts automation you set up forwards them. Nothing is pulled from your bank.' },
    { q: 'What about one-time passwords (OTPs)?', a: 'They are recognised and thrown away. An OTP is never saved.' },
    { q: 'Does it read my other messages?', a: 'No. On Android the app looks only at texts from banks and payment apps; your personal messages never leave the phone. On iPhone the automation forwards only messages containing words like "debit" or "spent", and anything that turns out not to be a payment is thrown away, not stored.' },
    { q: 'What about contacts, photos or location?', a: 'The app has no access to any of them. On Android it can also read a payment app\'s success screen, only at the moment a payment goes through, if you switch that on.' },
    { q: 'Can the app move my money?', a: 'No. It only keeps a record of payments that already happened. It cannot pay, transfer, or see your balance.' },
  ] },
  { title: 'What is kept, and where', items: [
    { q: 'What exactly is saved?', a: 'The amount, date, payee, the last four digits of the account or card, the category you pick, and the text of the bank alert. Never a full card or account number.' },
    { q: 'Where is it stored?', a: 'In a private database for your household. It travels over encrypted connections and is stored encrypted. Your phone keeps a copy of recent screens so they open instantly, protected by your phone\'s own lock.' },
    { q: 'Who can see it?', a: 'Only the people in your household who sign in. The database itself checks every request against that sign-in, so nothing is handed out without it.' },
    { q: 'Can my partner see my payments?', a: 'Yes. The app is built for a shared household, so both of you see every payment, including who paid it. There are no private payments between you.' },
    { q: 'Does AI read my messages?', a: 'No. Messages are read by fixed rules written for each bank\'s format. No AI service ever sees them.' },
  ] },
  { title: 'Your data stays yours', items: [
    { q: 'Do you look at my data?', a: 'No. We do not read, analyse or share your payments. The app exists to show your household its own money, and only your household.' },
    { q: 'Is it sold, or used for ads?', a: 'No. There are no ads, trackers or analytics in the app, and nothing is sold or shared with anyone.' },
    { q: 'Can I delete it?', a: 'Yes. Any payment can be deleted in the app, and all of your household\'s data can be deleted on request.' },
  ] },
]

export default function Privacy() {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 80 }}>
      <Stack.Screen options={{ title: 'Privacy and security' }} />
      <Text style={{ color: C.text2, fontSize: 15, lineHeight: 21 }}>
        How the app keeps your own money data private once you use it. No bank passwords, no OTPs, no way to move money. Tap a question for the answer.
      </Text>
      {SECTIONS.map(s => (
        <View key={s.title} style={{ gap: 8 }}>
          <Label>{s.title}</Label>
          <Card style={{ paddingVertical: 4 }}>
            {s.items.map((it, i) => {
              const on = open === it.q
              return (
                <Pressable key={it.q} onPress={() => setOpen(on ? null : it.q)} accessibilityRole="button" accessibilityState={{ expanded: on }}
                  style={({ pressed }) => ({ paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: C.line, opacity: pressed ? 0.7 : 1 })}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ color: C.text, fontSize: 16, fontWeight: '600', flex: 1 }}>{it.q}</Text>
                    <Text style={{ color: C.text3, fontSize: 18 }}>{on ? '−' : '+'}</Text>
                  </View>
                  {on && <Text style={{ color: C.text2, fontSize: 15, lineHeight: 21, marginTop: 8 }}>{it.a}</Text>}
                </Pressable>
              )
            })}
          </Card>
        </View>
      ))}
      <Text style={{ color: C.text3, fontSize: 13, lineHeight: 19 }}>
        This demo itself holds only made-up data. It has no sign-in and sends nothing anywhere; TestFlight tells the developer only that it was installed and opened, plus any crash reports.
      </Text>
    </ScrollView>
  )
}
