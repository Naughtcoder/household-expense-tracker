import Constants from 'expo-constants'

/** The version and build of the app actually installed, read from the phone
 *  (falls back to the config, then 'dev', in a build that lacks the module). */
const installed = (() => {
  try {
    const A = require('expo-application') as typeof import('expo-application')
    if (A.nativeBuildVersion) return { version: A.nativeApplicationVersion ?? '', build: A.nativeBuildVersion }
  } catch { /* the module arrives with the next native build */ }
  return { version: Constants.expoConfig?.version ?? '', build: 'dev' }
})()
import { Alert, Platform, Pressable, ScrollView, Text, View } from 'react-native'
import { router } from 'expo-router'
import { SymbolView } from 'expo-symbols'
import { supabase } from '@/lib/supabase'
import { queryClient } from '@/lib/query'
import { Card, ChoiceRow, Label } from '@/components/ui'
import { useSheetChoice } from '@/lib/choice'
import { APPEARANCE_OPTIONS, appearanceLabel, setAppearanceMode, useAppearanceMode, type AppearanceMode } from '@/lib/appearance'
import { C } from '@/theme'
import { IS_DEMO } from '@/lib/variant'
import { startTour } from '@/components/Tour'

// Every screen of the website, now in the app.
const GROUPS: { title: string; items: [string, string, string][] }[] = [
  // The demo leads with the question people ask first.
  ...(IS_DEMO ? [{ title: 'About this app', items: [['Privacy and security', '/privacy', 'lock.shield'], ['iPhone and Android', '/platforms', 'iphone']] as [string, string, string][] }] : []),
  { title: 'Money', items: [
    ['Everything and search', '/all', 'magnifyingglass'], ['Claimable', '/claimable', 'doc.text'], ['Deposits', '/deposits', 'key.fill'],
    ['Investments', '/investments', 'chart.line.uptrend.xyaxis'],
    ['Plan a payment', '/plans', 'arrow.triangle.branch'], ['Budgets', '/budgets', 'target'], ['Repeat charges', '/subscriptions', 'repeat'], ['Trips and tags', '/trips', 'airplane'],
    ['Merchants', '/merchants', 'storefront'],
    // The demo has no bank statements to read.
    ...(IS_DEMO ? [] : [['Import a statement', '/import', 'square.and.arrow.down'] as [string, string, string]]),
  ] },
  { title: 'Setup', items: [
    ['Categories', '/categories', 'square.grid.2x2'], ['Rules', '/rules', 'slider.horizontal.3'], ['Recurring', '/recurring', 'calendar.badge.clock'],
    ['Accounts', '/accounts', 'building.columns'],
    ...(IS_DEMO ? [] : [['Change password', '/password', 'lock'] as [string, string, string]]),
    // Android only: the bank text and payment app readers.
    ...(Platform.OS === 'android' && !IS_DEMO ? [['Payment readers', '/phone-readers', 'iphone'] as [string, string, string]] : []),
  ] },
]

export default function More() {
  const mode = useAppearanceMode() ?? 'system'
  // Applied once the sheet has slid away: the switch remounts every screen,
  // then puts the user back here.
  const askAppearance = useSheetChoice('more-appearance', v => {
    setTimeout(() => setAppearanceMode(v as AppearanceMode, '/more'), 350)
  })
  const signOut = () => Alert.alert('Sign out?', undefined, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Sign out', style: 'destructive', onPress: async () => { queryClient.clear(); await supabase.auth.signOut() } },
  ])
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 120 }}>
      <Text style={{ color: C.text, fontSize: 34, fontWeight: '800' }}>More</Text>
      {GROUPS.map(g => (
        <View key={g.title} style={{ gap: 8 }}>
          <Label>{g.title}</Label>
          <Card style={{ paddingVertical: 4 }}>
            {g.items.map(([label, path, icon], i) => (
              <Pressable key={path} onPress={() => router.push(path as never)}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: C.line, opacity: pressed ? 0.6 : 1 })}>
                <SymbolView name={icon as never} tintColor={C.text2} size={20} />
                <Text style={{ color: C.text, fontSize: 16, flex: 1 }}>{label}</Text>
                <Text style={{ color: C.text3 }}>›</Text>
              </Pressable>
            ))}
          </Card>
        </View>
      ))}
      <View style={{ gap: 8 }}>
        <Label>Display</Label>
        <ChoiceRow label="Appearance" value={appearanceLabel(mode)}
          onPress={() => askAppearance({ title: 'Appearance', options: APPEARANCE_OPTIONS, value: mode })} />
      </View>
      {IS_DEMO
        ? <Pressable onPress={startTour} style={{ padding: 14, alignItems: 'center' }}><Text style={{ color: C.accent, fontWeight: '700' }}>Replay the tour</Text></Pressable>
        : <Pressable onPress={signOut} style={{ padding: 14, alignItems: 'center' }}><Text style={{ color: C.negative, fontWeight: '700' }}>Sign out</Text></Pressable>}
      {/* Which build this phone runs, to compare with TestFlight. Read from the
          config baked into the installed app, so it changes only on update. */}
      <Text style={{ color: C.text3, fontSize: 12, textAlign: 'center' }}>
        {IS_DEMO ? 'Expense Tracker demo, made-up data' : 'Household Expense Tracker'} {installed.version}, build {installed.build}
      </Text>
    </ScrollView>
  )
}
