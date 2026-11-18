#!/usr/bin/env node
/**
 * The safety net under the phone.
 *
 * On 22 September two Swiggy charges arrived on the phone 52 seconds apart.
 * One reached the app and one did not, and nothing anywhere recorded the miss.
 * iOS gives no way to see whether a personal automation fired, so the only
 * honest answer is to check the messages themselves against what was logged.
 *
 * This reads the Mac's copy of his messages, which is the same inbox the phone
 * sees, and posts every bank message from the last stretch of hours. Anything
 * already logged is refused by the unique index on the transactions table, so
 * re-posting is free and this can run as often as you like.
 *
 * It needs Full Disk Access on whatever runs it, because the Messages database
 * is protected. Without that it exits saying so rather than silently doing
 * nothing, which is the failure it exists to prevent.
 */
import { openSync, closeSync, readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'

const HOURS = Number(process.env.CATCH_UP_HOURS ?? 24)
const DB = join(homedir(), 'Library/Messages/chat.db')
const ENV = join(homedir(), 'Desktop/household-tracker/.env.local')

// The same five words the phone automations trigger on, so the net has exactly
// the same reach as the thing it is backing up. See db/011 and DEPLOY.md.
const TRIGGERS = ['debit', 'credit', 'spent', 'sent', 'redeemed']

function apiKey() {
  const env = existsSync(ENV) ? readFileSync(ENV, 'utf8') : ''
  const m = /^HOUSEHOLD_API_KEY=(.+)$/m.exec(env)
  if (!m) {
    console.error('No HOUSEHOLD_API_KEY in .env.local. Add it, then run this again.')
    process.exit(2)
  }
  return m[1].trim()
}

function readMessages() {
  try {
    closeSync(openSync(DB, 'r'))
  } catch {
    console.error('Cannot read the Messages database.')
    console.error('Give Full Disk Access to whatever runs this, in System Settings,')
    console.error('Privacy and Security, Full Disk Access. Nothing was checked.')
    process.exit(3)
  }
  // Apple counts from 2001 in nanoseconds.
  const since = `(strftime('%s','now','-${HOURS} hours') - strftime('%s','2001-01-01')) * 1000000000`
  const sql = `
    select m.text
    from message m
    where m.is_from_me = 0 and m.text is not null and m.date > ${since}
    order by m.date asc;`
  const out = execFileSync('sqlite3', ['-readonly', DB, sql], { encoding: 'utf8', maxBuffer: 64 << 20 })
  return out.split('\n').filter(Boolean)
}

const looksFinancial = (t) => {
  const lower = t.toLowerCase()
  return TRIGGERS.some(w => lower.includes(w)) && /(?:rs\.?|inr)\s?[\d,]/i.test(t)
}

const key = apiKey()
const messages = readMessages().filter(looksFinancial)
console.log(`${messages.length} bank messages in the last ${HOURS} hours`)

let added = 0, already = 0, unread = 0
for (const text of messages) {
  const res = await fetch('https://your-app.vercel.app/api/ingest', {
    method: 'POST',
    headers: { 'x-api-key': key, 'content-type': 'application/json' },
    // Not `auto`: a message that reaches here has already been filtered as
    // financial, so anything unreadable is a pattern worth keeping.
    body: JSON.stringify({ text }),
  }).then(r => r.json()).catch(e => ({ error: String(e) }))

  if (res.error) { console.error('  failed:', res.error); continue }
  added += res.saved ?? 0
  already += res.duplicates ?? 0
  unread += res.unreadable ?? 0
  if (res.saved) console.log('  caught:', res.message)
}
console.log(`added ${added}, already logged ${already}, unreadable ${unread}`)
