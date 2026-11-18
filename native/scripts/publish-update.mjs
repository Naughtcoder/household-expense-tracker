#!/usr/bin/env node
// Publishes the phone app's JavaScript as an over-the-air update.
//
//   node scripts/publish-update.mjs android      (or ios)
//
// Phones running the same native runtime (expo.runtimeVersion in app.json)
// pick it up the next time the app opens and run it from the launch after.
// Only screens and logic travel this way. New native code (a reader, a
// permission, a new library with Android or iOS code) needs a new
// runtimeVersion and a new APK or TestFlight build, or the update would run
// against native code it does not have.
//
// Files go to the public storage bucket app-updates under a fresh id and are
// never overwritten; the manifest goes to the app_updates table, which
// app/api/updates reads. To take an update back, delete its app_updates row:
// phones then fall back to the newest one before it on their next launch.
import { execSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const platform = process.argv[2]
if (platform !== 'android' && platform !== 'ios') { console.error('Usage: publish-update.mjs android|ios'); process.exit(1) }
const NATIVE = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const REPO = path.resolve(NATIVE, '..')

const dirty = execSync('git status --porcelain -- native/src native/app.json native/assets lib', { cwd: REPO }).toString().trim()
if (dirty) { console.error(`Commit first, so the update is exactly a commit:\n${dirty}`); process.exit(1) }
const sha = execSync('git rev-parse HEAD', { cwd: REPO }).toString().trim()

const env = Object.fromEntries(fs.readFileSync(path.join(REPO, '.env.local'), 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const config = JSON.parse(execSync('npx expo config --json --type public', { cwd: NATIVE }).toString())
// UPDATE_RUNTIME publishes under another runtime, which no phone has, to test the server end to end.
const runtimeVersion = process.env.UPDATE_RUNTIME || config.runtimeVersion
if (typeof runtimeVersion !== 'string') { console.error('app.json needs expo.runtimeVersion as a plain string.'); process.exit(1) }

const out = path.join(NATIVE, '.update-dist')
fs.rmSync(out, { recursive: true, force: true })
execSync(`npx expo export --platform ${platform} --output-dir .update-dist`, { cwd: NATIVE, stdio: 'inherit' })
const meta = JSON.parse(fs.readFileSync(path.join(out, 'metadata.json'), 'utf8')).fileMetadata[platform]

const id = randomUUID()
const base = `${runtimeVersion}/${platform}/${id}`
const TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  ttf: 'font/ttf', otf: 'font/otf', json: 'application/json', js: 'application/javascript', hbc: 'application/javascript' }

async function upload(rel, contentType) {
  const file = fs.readFileSync(path.join(out, rel))
  const key = `${base}/${rel}`
  const { error } = await supabase.storage.from('app-updates').upload(key, file, { contentType, cacheControl: '31536000', upsert: false })
  if (error) throw new Error(`${rel}: ${error.message}`)
  return {
    hash: createHash('sha256').update(file).digest('base64url'),
    key: createHash('md5').update(file).digest('hex'),
    contentType,
    url: supabase.storage.from('app-updates').getPublicUrl(key).data.publicUrl,
  }
}

const launchAsset = await upload(meta.bundle, 'application/javascript')
const assets = []
for (const a of meta.assets) assets.push({ ...(await upload(a.path, TYPES[a.ext] ?? 'application/octet-stream')), fileExtension: `.${a.ext}` })

const manifest = { id, createdAt: new Date().toISOString(), runtimeVersion, launchAsset, assets, metadata: {}, extra: { expoClient: config } }
const { error } = await supabase.from('app_updates').insert({ id, runtime_version: runtimeVersion, platform, manifest, commit_sha: sha })
if (error) throw new Error(error.message)
fs.rmSync(out, { recursive: true, force: true })
console.log(`Published ${platform} update ${id} for runtime ${runtimeVersion} from ${sha.slice(0, 7)} (${assets.length} assets).`)
