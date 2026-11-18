// The category tree, any depth. Transportation > Car > Toll is three levels,
// and pages used to assume two (a category and its parent). Every page that
// needs "the top of this branch", "the trail down to it" or "everything under
// it" asks here, so a deeper branch reads the same everywhere.

export type Cat = { id: number; name: string; parent_id: number | null }

export type Tree = ReturnType<typeof catTree>

export function catTree(cats: readonly Cat[]) {
  const byId = new Map(cats.map(c => [c.id, c]))
  const kids = new Map<number | null, Cat[]>()
  for (const c of cats) {
    const list = kids.get(c.parent_id) ?? []
    list.push(c)
    kids.set(c.parent_id, list)
  }
  for (const list of kids.values()) list.sort((a, b) => a.name.localeCompare(b.name))

  /** Top first, the category itself last. Guards against a loop in the data. */
  const path = (id: number | null | undefined): Cat[] => {
    const out: Cat[] = []
    const seen = new Set<number>()
    let c = id != null ? byId.get(id) : undefined
    while (c && !seen.has(c.id)) {
      seen.add(c.id)
      out.unshift(c)
      c = c.parent_id != null ? byId.get(c.parent_id) : undefined
    }
    return out
  }

  /** The category and everything under it, at any depth. */
  const family = (id: number): number[] => {
    const out = [id]
    for (let i = 0; i < out.length; i++) for (const k of kids.get(out[i]) ?? []) if (!out.includes(k.id)) out.push(k.id)
    return out
  }

  /** Which direct child of `ancestor` the category sits under, or null when it
   *  is the ancestor itself or not under it at all. */
  const branchOf = (ancestor: number, id: number | null): Cat | null => {
    const p = path(id)
    const i = p.findIndex(c => c.id === ancestor)
    return i >= 0 && i < p.length - 1 ? p[i + 1] : null
  }

  /** Depth-first, with depth, for pickers and the categories screen. */
  const flat = (): { cat: Cat; depth: number }[] => {
    const out: { cat: Cat; depth: number }[] = []
    const walk = (parent: number | null, depth: number) => {
      for (const c of kids.get(parent) ?? []) {
        out.push({ cat: c, depth })
        walk(c.id, depth + 1)
      }
    }
    walk(null, 0)
    return out
  }

  return {
    byId,
    get: (id: number | null | undefined) => (id != null ? byId.get(id) ?? null : null),
    name: (id: number | null | undefined) => (id != null ? byId.get(id)?.name ?? null : null),
    children: (id: number | null) => kids.get(id) ?? [],
    hasChildren: (id: number) => (kids.get(id)?.length ?? 0) > 0,
    roots: () => kids.get(null) ?? [],
    path,
    root: (id: number | null | undefined) => path(id)[0] ?? null,
    parent: (id: number | null | undefined) => { const p = path(id); return p.length > 1 ? p[p.length - 2] : null },
    label: (id: number | null | undefined, sep = ' · ') => path(id).map(c => c.name).join(sep),
    family,
    branchOf,
    flat,
  }
}

const SMALL = new Set(['and', 'or', 'of', 'the', 'to', 'for', 'in', 'on', 'a', 'an', 'at', 'by'])

/** Every word of a category name starts with a capital ("Consulting Tools"),
 *  except small joining words after the first ("Parking and Tolls"). A word
 *  already written with capitals in it (Holiday) is left alone.
 *  Ruled by Alex, 4 Oct 2026. */
export function titleCase(name: string) {
  return name.trim().replace(/\s+/g, ' ').split(' ').map((w, i) =>
    w !== w.toLowerCase() ? w : i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

/** Other words people search for a category by. Lower case. */
const ALSO_CALLED: Record<string, string[]> = {
  mobile: ['phone', 'jio', 'airtel', 'vi', 'vodafone', 'bsnl', 'recharge', 'postpaid', 'prepaid', 'sim'],
  internet: ['wifi', 'broadband', 'act', 'fiber', 'fibre'],
  power: ['electricity', 'bescom', 'electric', 'light bill'],
  gas: ['cylinder', 'lpg', 'indane', 'hp gas', 'bharat gas'],
  subscriptions: ['netflix', 'spotify', 'apple', 'youtube', 'claude', 'chatgpt', 'prime'],
}

/** Does a search term find this category, by its name or another word for it? */
export function catMatches(name: string, term: string) {
  const n = name.toLowerCase()
  // Two letters at least before another word counts, so "s" does not find Mobile by "sim".
  return n.includes(term) || (term.length >= 2 && (ALSO_CALLED[n] ?? []).some(w => w.startsWith(term)))
}
