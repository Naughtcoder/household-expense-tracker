import { supabaseAdmin } from '../../../lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The phone app's over-the-air updates (Expo Updates protocol 1). The app
 * asks on every launch with its platform and native runtime; this answers
 * with the newest bundle published for exactly that runtime, or nothing.
 *
 * A bundle built for one runtime must never reach another: new native code
 * (a reader, a permission) means a new runtimeVersion in native/app.json and
 * a new APK. Bundles are published by native/scripts/publish-update.mjs.
 */
export async function GET(req: Request) {
  const h = req.headers
  const platform = h.get('expo-platform')
  const runtimeVersion = h.get('expo-runtime-version')
  const common = { 'expo-protocol-version': '1', 'expo-sfv-version': '0', 'cache-control': 'private, max-age=0' }
  if (h.get('expo-protocol-version') !== '1') return new Response('Only protocol 1.', { status: 400 })
  if (platform !== 'android' && platform !== 'ios') return new Response('Unknown platform.', { status: 400 })
  if (!runtimeVersion) return new Response('No runtime version.', { status: 400 })

  const { data } = await supabaseAdmin().from('app_updates').select('manifest')
    .eq('runtime_version', runtimeVersion).eq('platform', platform)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  // Nothing published for this runtime: an empty answer, which the app reads as "keep what you have".
  if (!data) return new Response(null, { status: 204, headers: common })

  const boundary = `update-${crypto.randomUUID()}`
  const body = [
    `--${boundary}`,
    'content-type: application/json; charset=utf-8',
    'content-disposition: form-data; name="manifest"',
    '',
    JSON.stringify(data.manifest),
    `--${boundary}--`,
    '',
  ].join('\r\n')
  return new Response(body, { status: 200, headers: { ...common, 'content-type': `multipart/mixed; boundary=${boundary}` } })
}
