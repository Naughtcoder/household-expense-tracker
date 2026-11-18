import webpush from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Phone notifications for a payment that is waiting for a category.
 *
 * The signing keys live in push_config, readable only with the service key, so
 * nothing has to be set in Vercel. Every failure here is swallowed: a missed
 * notification must never cost the payment it is about.
 */
let configured = false
async function configure(supabase: SupabaseClient) {
  if (configured) return true
  const { data } = await supabase.from('push_config').select('key, value')
  const v = Object.fromEntries((data ?? []).map(r => [r.key, r.value]))
  if (!v.vapid_public || !v.vapid_private) return false
  webpush.setVapidDetails(v.vapid_subject ?? 'https://your-app.vercel.app', v.vapid_public, v.vapid_private)
  configured = true
  return true
}

export async function publicKey(supabase: SupabaseClient) {
  const { data } = await supabase.from('push_config').select('value').eq('key', 'vapid_public').maybeSingle()
  return data?.value as string | undefined
}

/** Tell the person who paid that this payment needs a category. */
export async function notifyNeedsCategory(supabase: SupabaseClient, personId: string,
  t: { id: string; merchant: string | null; amount: number }) {
  try {
    if (!(await configure(supabase))) return
    const { data: subs } = await supabase.from('push_subscriptions')
      .select('endpoint, p256dh, auth').eq('person_id', personId)
    const amount = '₹' + Math.abs(t.amount).toLocaleString('en-IN')
    const payload = JSON.stringify({
      title: `${t.merchant ?? 'A payment'} ${amount}`,
      body: 'Tap to pick a category',
      url: `/t/${t.id}`,
      tag: t.id,
    })
    await Promise.all((subs ?? []).map(async s => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400 })
      } catch (e) {
        // Gone means the phone withdrew permission or the app was removed.
        const code = (e as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
      }
    }))
  } catch { /* the payment is already saved; the notification is a courtesy */ }
}

/** One message to every phone in the household, for the weekly digest. */
export async function notifyEveryone(supabase: SupabaseClient, msg: { title: string; body: string; url: string; tag: string }) {
  if (!(await configure(supabase))) return 0
  const { data: subs } = await supabase.from('push_subscriptions').select('endpoint, p256dh, auth')
  let sent = 0
  await Promise.all((subs ?? []).map(async s => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), { TTL: 86400 })
      sent++
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
    }
  }))
  return sent
}
