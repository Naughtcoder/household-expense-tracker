// Generates one Shortcut key per person, prints the key once and the SQL to
// store only its hash. Run: node scripts/make-keys.mjs Alex Sam
import { randomBytes, createHash } from 'node:crypto'

const names = process.argv.slice(2)
if (!names.length) { console.log('usage: node scripts/make-keys.mjs Alex Sam'); process.exit(1) }

console.log('\nKEEP THESE. They are shown once and are not recoverable.\n')
const rows = names.map(name => {
  const key = randomBytes(32).toString('base64url')
  console.log(`  ${name.padEnd(10)} ${key}`)
  return `  ('${name.replace(/'/g, "''")}', '${createHash('sha256').update(key).digest('hex')}')`
})
console.log('\nRun this in the Supabase SQL editor:\n')
console.log('insert into people (name, key_hash) values\n' + rows.join(',\n') + '\non conflict (name) do update set key_hash = excluded.key_hash;\n')
