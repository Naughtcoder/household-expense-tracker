import { catTree, type Cat } from '../lib/cats'

/** The category choices for a select: one group per top category, with every
 *  level under it indented, so Transportation shows Car and, under Car,
 *  Parking and Toll. */
export function CatOptions({ categories }: { categories: Cat[] }) {
  const tree = catTree(categories)
  const pad = (depth: number) => '   '.repeat(depth)
  return (
    <>
      {tree.roots().map(r => {
        const under: { cat: Cat; depth: number }[] = []
        const walk = (id: number, depth: number) => {
          for (const c of tree.children(id)) { under.push({ cat: c, depth }); walk(c.id, depth + 1) }
        }
        walk(r.id, 0)
        return (
          <optgroup key={r.id} label={r.name}>
            <option value={r.id}>{under.length ? `${r.name}, general` : r.name}</option>
            {under.map(({ cat, depth }) => (
              <option key={cat.id} value={cat.id}>
                {pad(depth)}{depth ? '› ' : ''}{cat.name}{tree.hasChildren(cat.id) ? ', general' : ''}
              </option>
            ))}
          </optgroup>
        )
      })}
    </>
  )
}
