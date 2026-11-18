// Small stroke icons, drawn inline. No icon library for four shapes.
const base = {
  width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
}

export const IconMonth = () => (
  <svg {...base} aria-hidden><path d="M4 19V11M9.5 19V5M15 19v-6M20.5 19v-9" /></svg>
)
export const IconReview = () => (
  <svg {...base} aria-hidden><path d="M3 13h4l1.5 2.5h7L17 13h4" /><path d="M5 5h14l2 8v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4z" /></svg>
)
export const IconInsights = () => (
  <svg {...base} aria-hidden><path d="M3 16.5 9 10l4 4 7.5-8" /><path d="M20.5 6h-4.5M20.5 6v4.5" /></svg>
)
export const IconMore = () => (
  <svg {...base} aria-hidden><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></svg>
)

// A circled plus, matching the bottom bar in the design. It spreads the same
// base as its neighbours, which is not tidiness: base carries width and height,
// and .bicon does not size its child, so an svg without them collapses to
// nothing and the tab renders as a bare label.
export const IconAdd = () => (
  <svg {...base} aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 8.5v7M8.5 12h7" /></svg>
)
