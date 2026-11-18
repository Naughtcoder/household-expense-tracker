import { router } from 'expo-router'

/** Opens Everything narrowed to the payments behind a figure. Empty values
 *  are left out, so a caller can pass `who: who ?? ''` and the like. */
export function openAll(f: { m?: string; who?: string | null; dir?: 'debit' | 'credit' | ''; cat?: string | number | null; exact?: boolean; scope?: string; q?: string; d?: string; from?: string; to?: string; acct?: string; bank?: string }) {
  const params: Record<string, string> = {}
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === null || v === '' || v === false) continue
    params[k] = v === true ? '1' : String(v)
  }
  router.push({ pathname: '/all', params })
}
