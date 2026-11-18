import type { SupabaseClient } from '@supabase/supabase-js'
import { matchRule, type PaymentFacts, type Rule } from './rules.ts'

/**
 * The rule a payment falls under, from the database. Exact rules for its own
 * key, plus every "contains" and "starts with" rule (there are few, so they
 * are read once and kept in `cache` for the rest of one ingest or import).
 * The close-match guess is not here: each caller keeps its own, and it only
 * runs when this finds nothing.
 */
export async function findRule(
  supabase: SupabaseClient,
  p: PaymentFacts,
  cache: { loose?: Rule[] },
): Promise<Rule | null> {
  if (!cache.loose) {
    const { data } = await supabase.from('merchant_rules').select('*').in('match_type', ['contains', 'starts'])
    cache.loose = (data ?? []) as Rule[]
  }
  const exact = p.key
    ? ((await supabase.from('merchant_rules').select('*').eq('match_key', p.key).eq('match_type', 'exact').limit(50)).data ?? []) as Rule[]
    : []
  return matchRule([...exact, ...cache.loose], p)
}
