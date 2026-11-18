import { supabase } from './supabase'
import { IS_DEMO } from './variant'

/** The website, which does the filing, adding and pay-back work for both
 *  the site and the app, so the two can never disagree. */
export const SITE = 'https://your-app.vercel.app'

/** Runs one of the website's actions as the signed-in person. */
export async function act<T = { ok?: boolean; error?: string; message?: string; filed?: number }>(action: string, args: Record<string, unknown> = {}): Promise<T> {
  if (IS_DEMO) return (await require('./demo/act').demoAct(action, args)) as T
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sign in again.')
  const r = await fetch(`${SITE}/api/app`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, args }),
  })
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `The website answered ${r.status}`)
  if ((body as { error?: string }).error && !(body as { ok?: boolean }).ok) throw new Error((body as { error: string }).error)
  return body as T
}
