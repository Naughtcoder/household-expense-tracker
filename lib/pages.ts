/**
 * Every row of a query, a thousand at a time. PostgREST stops at 1,000 rows
 * and says nothing, so any page that adds up raw rows over more than a month
 * or two has to read in pages or it quietly adds up part of the answer.
 */
export async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if ((data ?? []).length < 1000) return out
  }
}
