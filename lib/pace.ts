/**
 * Where a monthly budget should be by today. 70% spent on the 10th is a
 * problem; 70% on the 28th is not. The marker on each budget bar sits here.
 */
export function paceOf(monthKey: string, today = new Date()) {
  const [y, m] = monthKey.split('-').map(Number)
  const days = new Date(y, m, 0).getDate()
  const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  if (key < monthKey) return { share: 0, daysLeft: days }
  if (key > monthKey) return { share: 1, daysLeft: 0 }
  const day = today.getDate()
  return { share: day / days, daysLeft: days - day + 1 }
}

/** ahead: spending faster than the month is passing. over: past the limit. */
export function budgetState(spent: number, limit: number, share: number) {
  const used = limit > 0 ? spent / limit : 0
  return { used, state: used >= 1 ? 'over' as const : used > share + 0.1 ? 'ahead' as const : 'fine' as const }
}
