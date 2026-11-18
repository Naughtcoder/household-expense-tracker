import { PermissionsAndroid, Platform } from 'react-native'
import { requireOptionalNativeModule } from 'expo'

/**
 * Sam's Android payment readers: bank texts, payment app screens and
 * payment app notifications. They run in the background on the phone and send
 * what they catch to the website's /api/ingest with this phone's own key.
 *
 * Android only. On iPhone (and on the web) there is no native side, every
 * call answers "not available" and nothing throws.
 */

export type ReaderStatus = {
  /** False on iPhone, the web, or a build without the native side. */
  available: boolean
  /** The phone has its own key and the website address, so it can send. */
  linked: boolean
  /** "granted" once both RECEIVE_SMS and READ_SMS are allowed. */
  permission: 'granted' | 'not granted'
  /** Texts waiting to be sent. */
  queued: number
  /** When the books last took a batch, in ms since 1970. 0 for never. */
  lastSent: number
  historyDone: boolean
  screenReader: boolean
  notificationReader: boolean
}

type Native = {
  status(): ReaderStatus
  link(key: string, url: string): Promise<ReaderStatus>
  readHistory(months: number): Promise<{ found: number; queued: number }>
  openScreenReaderSettings(): void
  openNotificationSettings(): void
  openBatterySettings(): void
  takeSharedShots(): Promise<SharedShot[]>
  readShot(uri: string): Promise<ShotText>
}

/** A screenshot shared to the app and waiting for the import screen. takenAt in ms since 1970. */
export type SharedShot = { uri: string; takenAt: number }
/** The text read off a screenshot on the phone, each line with its box in pixels. takenAt 0 when unknown. */
export type ShotText = { lines: { text: string; left: number; top: number; right: number; bottom: number }[]; width: number; height: number; takenAt: number }

const native: Native | null = Platform.OS === 'android' ? requireOptionalNativeModule<Native>('PaymentReaders') : null

const OFF: ReaderStatus = {
  available: false, linked: false, permission: 'not granted', queued: 0, lastSent: 0,
  historyDone: false, screenReader: false, notificationReader: false,
}

export const available = () => native !== null

/** Which readers are on and what is waiting. A plain object, safe to cache. */
export function status(): ReaderStatus {
  if (!native) return OFF
  try { return { ...OFF, ...native.status(), available: true } } catch { return OFF }
}

/** Hands the background sender this phone's key and the website address. */
export async function link(key: string, url: string): Promise<ReaderStatus> {
  if (!native) return OFF
  return { ...OFF, ...(await native.link(key, url)), available: true }
}

/** Asks Android for SMS access. Answers with the status after the answer. */
export async function requestSmsPermission(): Promise<ReaderStatus> {
  if (!native) return OFF
  const P = PermissionsAndroid.PERMISSIONS
  await PermissionsAndroid.requestMultiple([P.RECEIVE_SMS, P.READ_SMS])
  return status()
}

/** Queues every bank payment text from the last n months as history. */
export async function readHistory(months = 24): Promise<{ found: number; queued: number }> {
  if (!native) return { found: 0, queued: 0 }
  return native.readHistory(months)
}

export function openScreenReaderSettings() { native?.openScreenReaderSettings() }
export function openNotificationSettings() { native?.openNotificationSettings() }
export function openBatterySettings() { native?.openBatterySettings() }

/** Screenshots shared to the app since last asked. Each is handed out once. */
export async function takeSharedShots(): Promise<SharedShot[]> {
  if (!native?.takeSharedShots) return []
  return native.takeSharedShots()
}

/** Reads the text off a picture on the phone. Null where the phone cannot (iPhone, web, older builds). */
export async function readShot(uri: string): Promise<ShotText | null> {
  if (!native?.readShot) return null
  return native.readShot(uri)
}

/** True when this build can read screenshots (Android app build 12 on). */
export const canReadShots = () => !!native?.readShot
