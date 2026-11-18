// The bottom bar's icons, filled, in the shapes the phone app uses (Apple's
// calendar, chart.bar.fill, plus.circle.fill, tray.fill, ellipsis.circle.fill).
// Alex preferred these to the outline set on 4 Oct 2026, so the website and
// the app read as one thing.

type P = { size?: number }

export const TabMonth = ({ size = 25 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <rect x="2.5" y="3.5" width="19" height="18" rx="4" fill="currentColor" />
    <rect x="2.5" y="3.5" width="19" height="4.5" rx="2" fill="currentColor" opacity=".55" />
    <g fill="var(--tab-cut, var(--page-bg))">
      {[0, 1, 2, 3].map(c => [0, 1, 2].map(r => <circle key={`${c}${r}`} cx={7 + c * 3.4} cy={11.2 + r * 3.3} r="1.05" />))}
    </g>
  </svg>
)

export const TabInsights = ({ size = 25 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
    <rect x="3" y="11" width="5" height="10" rx="1.6" />
    <rect x="9.5" y="7" width="5" height="14" rx="1.6" />
    <rect x="16" y="3" width="5" height="18" rx="1.6" />
  </svg>
)

export const TabAdd = ({ size = 25 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="10" fill="currentColor" />
    <path d="M12 7.2v9.6M7.2 12h9.6" stroke="var(--tab-cut, var(--page-bg))" strokeWidth="2.3" strokeLinecap="round" />
  </svg>
)

export const TabReview = ({ size = 25 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
    <path d="M5.6 4h12.8a2 2 0 0 1 1.85 1.24L22 9.5V18a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 18V9.5l1.75-4.26A2 2 0 0 1 5.6 4Zm-1.2 5.5H8a1 1 0 0 1 1 .9 3 3 0 0 0 6 0 1 1 0 0 1 1-.9h3.6l-1.3-3.2a.5.5 0 0 0-.46-.3H6.16a.5.5 0 0 0-.46.3Z" />
  </svg>
)

export const TabMore = ({ size = 25 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="10" fill="currentColor" />
    <g fill="var(--tab-cut, var(--page-bg))">
      <circle cx="7.4" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="16.6" cy="12" r="1.5" />
    </g>
  </svg>
)
