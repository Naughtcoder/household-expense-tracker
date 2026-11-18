// The usual reason the installed app crashes is that it was left open across a
// deploy. Its old page then asks for code files the new build no longer has.
// A plain reload fixes that, so the error screen tries one reload by itself.
// A second crash within a minute is a real fault, and is shown as one.

const KEY = 'crash-reloaded-at'

export function reloadOnce(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0)
    if (Date.now() - last < 60_000) return false
    sessionStorage.setItem(KEY, String(Date.now()))
  } catch { return false }
  window.location.reload()
  return true
}
