import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import { AppState } from 'react-native'
import { IS_DEMO } from './variant'

// The same database as the website, through the same access rules: the
// phone signs in as Alex or Sam and sees exactly what they see there.
// No window means the code is being run on a server to pre-draw a web page,
// where there is no phone storage to keep a sign-in in.
const onServer = typeof window === 'undefined'
const makeClient = () => createClient(process.env.EXPO_PUBLIC_SUPABASE_URL!, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!, {
  auth: { storage: onServer ? undefined : AsyncStorage, autoRefreshToken: !onServer, persistSession: !onServer, detectSessionInUrl: false },
})
// The demo app gets the in-memory stand-in instead (lib/demo/client.ts).
export const supabase: ReturnType<typeof makeClient> = IS_DEMO
  ? (require('./demo/client').demoClient as unknown as ReturnType<typeof makeClient>)
  : makeClient()

// Refresh the sign-in only while the app is open, as Supabase recommends.
AppState.addEventListener('change', s => {
  if (s === 'active') supabase.auth.startAutoRefresh()
  else supabase.auth.stopAutoRefresh()
})
