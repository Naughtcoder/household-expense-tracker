// One-off: feed statement rows, already written as bank-message text, through
// the same ingest path the phone uses. Usage: node scripts/import-parsed.mts file.json personId [--dry]
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { extractAll } from '../lib/extract.ts'
import { ingestText } from '../lib/ingest.ts'

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const get = (k: string) => (env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1] ?? '').replace(/^"|"$/g, '').trim()
const [file, person, dry] = process.argv.slice(2)
const items: { text: string; date: string; key: string }[] = JSON.parse(readFileSync(file, 'utf8'))

let unread = 0
for (const it of items) {
  const f = extractAll(it.text, new Date(it.date + "T12:00:00+05:30")).transactions
  if (!f.length || f[0].date !== it.date) { unread++; console.log('UNREAD', it.text, JSON.stringify(f[0] ?? null)) }
}
console.log('items', items.length, 'unreadable or wrong date', unread)
if (dry) process.exit(0)

const sb = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'))
const tot = { saved: 0, duplicates: 0, refused: 0, unreadable: 0 }
for (const it of items) {
  const r = await ingestText(sb, it.text, person, false, it.key, true, new Date(it.date + "T12:00:00+05:30"))
  tot.saved += r.saved; tot.duplicates += r.duplicates; tot.refused += r.refused; tot.unreadable += r.unreadable
}
console.log(tot)
