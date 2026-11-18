import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
function sameHash(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/** The person a request's key belongs to, or null. Shared by both doors. */
export async function personForKey(supabase: SupabaseClient, key: string) {
  if (key.length < 32) return null
  const { data: people } = await supabase.from('people').select('id, key_hash')
  const hash = sha256(key)
  const person = people?.find(p => sameHash(p.key_hash, hash))
  if (person) return person
  // A linked phone's own key (Sam's Android SMS reader, for one).
  const { data: device } = await supabase.from('device_keys').select('id, person_id').eq('key_hash', hash).maybeSingle()
  if (!device) return null
  await supabase.from('device_keys').update({ last_used: new Date().toISOString() }).eq('id', device.id)
  return { id: device.person_id as string, key_hash: hash }
}

/** A new key for one phone. Returns the key once; only its hash is stored. */
export async function mintDeviceKey(supabase: SupabaseClient, personId: string, label: string) {
  const key = randomBytes(32).toString('hex')
  const { error } = await supabase.from('device_keys').insert({ person_id: personId, key_hash: sha256(key), label })
  if (error) throw new Error(error.message)
  return key
}

/** Write the receipt. A logging failure must never cost a transaction. */
export async function logIntake(supabase: SupabaseClient, row: {
  person_id?: string; source: string; sender?: string; text: string
  saved?: number; duplicates?: number; refused?: number; unreadable?: number; error?: string
}) {
  // Named fields only. Spreading an ingest result in carried its `message`
  // along, the insert failed on the unknown column, and the receipt vanished.
  const { error } = await supabase.from('intake_log').insert({
    person_id: row.person_id ?? null, source: row.source, sender: row.sender ?? null,
    saved: row.saved ?? 0, duplicates: row.duplicates ?? 0, refused: row.refused ?? 0,
    unreadable: row.unreadable ?? 0, error: row.error ?? null, text_sha: sha256(row.text),
  })
  // The receipt is evidence, not the transaction, so it never fails a request.
  if (error) console.error('intake_log', error.message)
}

/**
 * The inboxes allowed to post bank email, and whose money they report. The
 * Gmail script proves which inbox it runs in with that account's own Google
 * token, so no key has to be pasted into it.
 */
const INBOXES: Record<string, string> = {
  'alex@example.com': 'Alex',
  'user@example.com': 'Alex',
  'user@example.com': 'Alex',
  // Her payments are filed as paid by Sam. Add any other inbox her banks write to here.
  'user@example.com': 'Sam',
}

/** The verified inbox and person behind a Google access token, or null. */
export async function personForGoogleToken(supabase: SupabaseClient, token: string) {
  if (!token) return null
  const r = await fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(token),
    { cache: 'no-store' }).catch(() => null)
  if (!r?.ok) return null
  const info = await r.json().catch(() => null) as { email?: string; email_verified?: string | boolean; expires_in?: string } | null
  const email = info?.email?.toLowerCase()
  const verified = info?.email_verified === true || info?.email_verified === 'true'
  if (!email || !verified || !INBOXES[email]) return null
  const { data } = await supabase.from('people').select('id').eq('name', INBOXES[email]).maybeSingle()
  return data ? { id: data.id as string, inbox: email } : null
}
