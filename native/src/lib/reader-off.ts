import { useCallback, useEffect, useState } from 'react'
import { AppState, Platform } from 'react-native'
import { IS_DEMO } from './variant'
import * as Readers from '../../modules/payment-readers'

/**
 * Android only: true while this phone's payment screen reader is switched off.
 * Rechecked whenever the app comes back to the front, because Android can
 * untick it while the app is closed (13 Nov 2026). Always false on iPhone,
 * in the demo, and in a build without the native module.
 */
export function useScreenReaderOff(): boolean {
  const read = useCallback(() => {
    if (Platform.OS !== 'android' || IS_DEMO) return false
    const s = Readers.status()
    return s.available && !s.screenReader
  }, [])
  const [off, setOff] = useState(read)
  useEffect(() => {
    setOff(read())
    const sub = AppState.addEventListener('change', a => { if (a === 'active') setOff(read()) })
    return () => sub.remove()
  }, [read])
  return off
}
