import { seed } from './seed'

export type Row = Record<string, unknown>

// Every table, in memory, made up fresh each time the app starts.
export const db: Record<string, Row[]> = seed()

const UUID_TABLES = new Set(['transactions', 'people', 'planned_splits', 'unparsed'])

export function uuid() {
  const h = '0123456789abcdef'
  let s = ''
  for (let i = 0; i < 32; i++) s += h[Math.floor(Math.random() * 16)]
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-a${s.slice(17, 20)}-${s.slice(20, 32)}`
}

export function newId(table: string): string | number {
  if (UUID_TABLES.has(table)) return uuid()
  return Math.max(0, ...(db[table] ?? []).map(r => Number(r.id) || 0)) + 1
}
