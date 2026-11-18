// Takes a key you already hold and prints the SQL that stores its hash.
// Use this when 1Password and the database have drifted apart, rather than
// making a new key and having to update the phone as well.
//
//   node scripts/hash-key.mjs Alex
//
// It reads the key from a hidden prompt, so it never reaches your shell
// history and never appears on screen.
import { createHash } from 'node:crypto'
import { createInterface } from 'node:readline'

const name = process.argv[2]
if (!name) { console.log('usage: node scripts/hash-key.mjs <Name>'); process.exit(1) }

const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
process.stdout.write(`Paste ${name}'s key, then press Enter: `)

// Suppress the echo so the key is not shown or scrolled back to.
const mute = { muted: true }
rl.output.write = (function (write) {
  return function (chunk, ...rest) {
    if (!mute.muted) return write.call(rl.output, chunk, ...rest)
  }
})(rl.output.write)

rl.question('', (answer) => {
  mute.muted = false
  const key = answer.trim()
  rl.close()
  console.log('\n')
  if (key.length < 20) { console.log('That looks too short to be a key.'); process.exit(1) }
  const hash = createHash('sha256').update(key).digest('hex')
  console.log('Run this in the Supabase SQL editor:\n')
  console.log(`update people set key_hash = '${hash}' where name = '${name.replace(/'/g, "''")}';\n`)
  console.log(`(key length ${key.length}, starts ${key.slice(0, 4)})`)
})
