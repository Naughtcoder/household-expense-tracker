import AsyncStorage from '@react-native-async-storage/async-storage'
import { AppState, Platform } from 'react-native'
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query'
import { IS_DEMO } from './variant'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'

// Every screen's data is kept on the phone. Opening a screen shows the last
// copy at once and fetches a fresh one behind it, so a tap never waits on
// the network the way the website does.
// Coming back to the app counts as coming back to the page, and every screen
// is fetched again, however recently (refetchOnWindowFocus: 'always'). Without this a phone left open showed the
// numbers from when it last loaded (8 Oct: the month was Rs 2,000 behind,
// missing five payments Alex made after noon).
AppState.addEventListener('change', s => {
  if (Platform.OS !== 'web') focusManager.setFocused(s === 'active')
})

export const queryClient = new QueryClient({
  // Screens on show also refetch every 5 minutes while the app is in front,
  // so payments the other phone sends appear without leaving the screen.
  defaultOptions: { queries: { staleTime: 30_000, gcTime: 7 * 24 * 3600_000, retry: 1, refetchInterval: 5 * 60_000, refetchOnWindowFocus: 'always' } },
})
const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: 'household-cache-v2' })

export function QueryProvider({ children }: { children: React.ReactNode }) {
  // The demo starts fresh every time, so nothing from it is kept on the phone.
  if (IS_DEMO) return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: 7 * 24 * 3600_000 }}>
      {children}
    </PersistQueryClientProvider>
  )
}
