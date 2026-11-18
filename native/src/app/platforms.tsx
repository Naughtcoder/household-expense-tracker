import { ScrollView, Text, View } from 'react-native'
import { Stack } from 'expo-router'
import { Card, Label } from '@/components/ui'
import { C } from '@/theme'

// Where the real app works differently on an iPhone and on Android, for the
// demo's walkthrough. Keep it true of the code: Android reads bank texts,
// payment notifications and payment screens itself (modules/payment-readers);
// iPhone apps cannot read texts, so a Shortcuts automation forwards them; the
// Spend widget is iPhone only (lib/widget.ts).

type Row = { topic: string; iphone: string; android: string }

const ROWS: Row[] = [
  { topic: 'Getting payments in',
    iphone: 'iPhone apps are not allowed to read text messages. A Shortcuts automation, set up once, forwards each bank alert to the app the moment it arrives. No tapping after that.',
    android: 'The app reads bank texts itself, once you allow it. It can also catch the payment app\'s notification and its "payment successful" screen, so UPI payments land even when the bank\'s text is late.' },
  { topic: 'Setting it up',
    iphone: 'One automation in the Shortcuts app, per phone. The app has nothing extra to switch on.',
    android: 'More, then Payment readers: link the phone, allow bank texts, and switch on the payment-screen reader if you want UPI apps caught too. It can also read the last two years of bank texts once, so your history is there on day one.' },
  { topic: 'Home-screen widget',
    iphone: 'A Spend widget shows today and this month, for the household or either person.',
    android: 'No widget yet.' },
  { topic: 'Installing and updates',
    iphone: 'Through TestFlight. New versions arrive there like any app update.',
    android: 'An app file sent to you directly. A new version is a new file to install over the old one.' },
]

const SAME = 'Everything else is the same on both: every screen, every number, Review, budgets, claims, tax, and the same household data, so either of you can use either phone.'

export default function Platforms() {
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 80 }}>
      <Stack.Screen options={{ title: 'iPhone and Android' }} />
      <Text style={{ color: C.text2, fontSize: 15, lineHeight: 21 }}>The same app on both, with four differences. Most come from what each phone lets an app do.</Text>
      {ROWS.map(r => (
        <View key={r.topic} style={{ gap: 8 }}>
          <Label>{r.topic}</Label>
          <Card style={{ gap: 12 }}>
            <View style={{ gap: 4 }}>
              <Text style={{ color: C.text, fontWeight: '700' }}>iPhone</Text>
              <Text style={{ color: C.text2, fontSize: 15, lineHeight: 21 }}>{r.iphone}</Text>
            </View>
            <View style={{ height: 1, backgroundColor: C.line }} />
            <View style={{ gap: 4 }}>
              <Text style={{ color: C.text, fontWeight: '700' }}>Android</Text>
              <Text style={{ color: C.text2, fontSize: 15, lineHeight: 21 }}>{r.android}</Text>
            </View>
          </Card>
        </View>
      ))}
      <Card><Text style={{ color: C.text2, fontSize: 15, lineHeight: 21 }}>{SAME}</Text></Card>
    </ScrollView>
  )
}
