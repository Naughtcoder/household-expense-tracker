import { Fragment, useEffect } from 'react'
import { Stack, router, useSegments } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { QueryProvider } from '@/lib/query'
import { useSession } from '@/lib/data'
import { C } from '@/theme'
import { loadAppearance, takeReturnTo, useScheme } from '@/lib/appearance'
import { LogBox } from 'react-native'
import { Tour } from '@/components/Tour'

// A known, harmless React Native notice from screen transitions. It only shows
// in the test build, as a bar at the bottom that hides the tab bar.
LogBox.ignoreLogs(['Sending `onAnimatedValueUpdate` with no listeners registered'])

SplashScreen.preventAutoHideAsync()
loadAppearance()

/** Signed out goes to sign-in; signed in never sees it. */
function Gate() {
  const session = useSession()
  const seg = useSegments()
  useEffect(() => {
    if (session === undefined) return
    SplashScreen.hideAsync()
    const onLogin = seg[0] === 'login'
    if (!session && !onLogin) router.replace('/login')
    if (session && onLogin) router.replace('/')
  }, [session, seg])
  return null
}

/** Runs once after a theme remount and puts the user back where the switch
 *  was made (the remount restarts the screens on the first tab). */
function ReturnAfterRemount() {
  useEffect(() => {
    const to = takeReturnTo()
    if (!to) return
    const t = setTimeout(() => router.navigate(to as never), 0)
    return () => clearTimeout(t)
  }, [])
  return null
}

export default function Root() {
  // Undefined until the saved light, dark or system choice is read; the
  // splash stays up meanwhile, so the first frame is already the right theme.
  const scheme = useScheme()
  if (!scheme) return null
  // The key remounts every screen when the scheme changes. The React Compiler
  // memoizes components, so a re-render alone would keep the old colours.
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <QueryProvider>
      <Gate />
      <Tour />
      <Fragment key={scheme}>
      {/* Inside the keyed part, so it is set afresh after the window's own style changes. */}
      <StatusBar style={scheme === 'light' ? 'dark' : 'light'} />
      <ReturnAfterRemount />
      <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal', headerStyle: { backgroundColor: C.bg }, headerTintColor: C.text, contentStyle: { backgroundColor: C.bg }, headerShadowVisible: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="t/[id]" options={{ title: 'Payment' }} />
        <Stack.Screen name="c/[id]" options={{ title: 'Category' }} />
        <Stack.Screen name="m/[key]" options={{ title: 'Payee' }} />
        <Stack.Screen name="summary/[month]" options={{ title: 'Month summary' }} />
        <Stack.Screen name="p/[id]" options={{ title: 'Person' }} />
        <Stack.Screen name="all" options={{ title: 'Everything' }} />
        <Stack.Screen name="tax" options={{ title: 'Tax paid' }} />
        <Stack.Screen name="privacy" options={{ title: 'Privacy and security' }} />
        <Stack.Screen name="platforms" options={{ title: 'iPhone and Android' }} />
        <Stack.Screen name="trips/index" options={{ title: 'Trips and tags' }} />
        <Stack.Screen name="trips/[id]" options={{ title: 'Trip' }} />
        <Stack.Screen name="claimable/index" options={{ title: 'Claimable' }} />
        <Stack.Screen name="claimable/r/[id]" options={{ title: 'Repayment' }} />
        <Stack.Screen name="deposits" options={{ title: 'Deposits' }} />
        <Stack.Screen name="investments" options={{ title: 'Investments' }} />
        <Stack.Screen name="budgets" options={{ title: 'Budgets' }} />
        <Stack.Screen name="subscriptions" options={{ title: 'Repeat charges' }} />
        <Stack.Screen name="recurring" options={{ title: 'Recurring' }} />
        <Stack.Screen name="accounts" options={{ title: 'Accounts' }} />
        <Stack.Screen name="merchants" options={{ title: 'Merchants' }} />
        <Stack.Screen name="rules" options={{ title: 'Rules' }} />
        <Stack.Screen name="rule" options={{ title: 'Rule' }} />
        <Stack.Screen name="categories" options={{ title: 'Categories' }} />
        <Stack.Screen name="password" options={{ title: 'Change password' }} />
        <Stack.Screen name="import" options={{ title: 'Import a statement' }} />
        <Stack.Screen name="phone-readers" options={{ title: 'Payment readers' }} />
        <Stack.Screen name="import-history" options={{ title: 'From a screenshot' }} />
        <Stack.Screen name="split" options={{ title: 'Split this payment' }} />
        <Stack.Screen name="plans" options={{ title: 'Plan a payment' }} />
        <Stack.Screen name="plan" options={{ title: 'Plan a payment' }} />
        {/* Apple-style sheets: slide up from the bottom, half or full height. */}
        <Stack.Screen name="pick" options={{ presentation: 'formSheet', sheetAllowedDetents: [0.6, 1], sheetGrabberVisible: true, title: 'Category', headerShown: false }} />
        <Stack.Screen name="month" options={{ presentation: 'formSheet', sheetAllowedDetents: [0.5], sheetGrabberVisible: true, headerShown: false }} />
        <Stack.Screen name="choose" options={{ presentation: 'formSheet', sheetAllowedDetents: [0.5, 1], sheetGrabberVisible: true, headerShown: false }} />
        <Stack.Screen name="date" options={{ presentation: 'formSheet', sheetAllowedDetents: [0.62], sheetGrabberVisible: true, headerShown: false }} />
      </Stack>
      </Fragment>
    </QueryProvider>
    </GestureHandlerRootView>
  )
}
