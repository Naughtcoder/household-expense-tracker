import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Rupees per one unit of a currency on a day: the European Central Bank's
 * reference rate (via frankfurter.dev), which covers SGD, USD, EUR, JPY and
 * the rest. Cached in fx_rates. Weekends and holidays use the last working
 * day's rate, which is what the service returns for them.
 */
export async function inrRate(supabase: SupabaseClient, currency: string, day: string): Promise<number | null> {
  const cur = currency.toUpperCase()
  if (cur === 'INR' || cur === 'RS' || cur === 'RS.') return 1
  const { data: cached } = await supabase.from('fx_rates').select('inr').eq('day', day).eq('currency', cur).maybeSingle()
  if (cached) return Number(cached.inr)
  try {
    const r = await fetch(`https://api.frankfurter.dev/v1/${day}?from=${cur}&to=INR`, { cache: 'no-store' })
    if (!r.ok) return null
    const j = await r.json() as { rates?: { INR?: number } }
    const rate = j.rates?.INR
    if (!rate) return null
    await supabase.from('fx_rates').upsert({ day, currency: cur, inr: rate })
    return rate
  } catch {
    return null
  }
}
