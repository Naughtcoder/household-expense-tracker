'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { ThemeToggle } from './theme'
import { TabMonth as IconMonth, TabInsights as IconInsights, TabAdd as IconAdd, TabReview as IconReview, TabMore as IconMore } from './tabicons'
import { IconListDetails, IconReceipt2, IconTargetArrow, IconRepeat, IconPlane, IconBuildingStore, IconSearch, IconBuildingBank,
  IconAdjustmentsHorizontal, IconCalendarRepeat, IconFileImport, IconDeviceMobile, IconLock, IconKey, IconCategory, IconTrendingUp, IconArrowsSplit } from '@tabler/icons-react'

// The same knot as the home screen icon, drawn in the accent rather than on a
// tile, so the app in the browser and the app on the phone are the same thing.
// The transform is potrace's own: it traces in a flipped, tenth-scale space.
function Mark() {
  return (
    <svg className="mark" viewBox="0 0 1024 1024" aria-hidden="true">
      <g transform="translate(0,1024) scale(0.1,-0.1)" fill="currentColor" stroke="none">
      <path d="M3075 8037 c-280 -128 -656 -300 -835 -382 -179 -82 -329 -151 -333
-155 -7 -6 155 -1776 168 -1836 5 -23 25 -40 426 -361 l277 -222 -39 -192
c-22 -105 -38 -193 -37 -194 2 -1 336 -71 743 -155 407 -84 936 -193 1175
-243 239 -50 462 -91 495 -91 40 -1 211 30 515 93 250 52 457 96 459 97 2 2
-15 25 -37 51 -48 56 -105 175 -121 251 -16 77 -13 207 8 285 16 60 16 67 2
63 -9 -3 -196 -42 -416 -87 l-400 -82 -180 36 c-99 20 -288 59 -420 86 -132
27 -465 96 -740 152 -275 56 -502 104 -505 106 -6 6 53 52 121 94 l59 37 -364
291 c-201 161 -369 298 -374 304 -14 17 -117 1096 -106 1107 5 5 231 110 503
234 l495 225 445 -172 446 -173 7 96 c3 52 14 118 23 145 45 132 125 245 219
310 31 21 53 42 49 45 -9 8 -1200 470 -1211 470 -4 0 -236 -105 -517 -233z" />
      <path d="M6226 8109 c-225 -87 -413 -159 -417 -159 -4 0 -71 57 -149 127 -104
93 -146 124 -156 117 -7 -5 -220 -241 -471 -524 -252 -284 -532 -599 -623
-701 -91 -102 -250 -281 -353 -398 l-189 -212 -153 -467 c-85 -257 -153 -467
-152 -468 1 -1 38 3 83 8 146 20 308 -25 437 -121 30 -22 66 -54 80 -72 l24
-32 137 409 137 409 282 316 c155 173 435 487 621 698 204 230 343 378 348
373 5 -5 12 -54 16 -109 l7 -99 446 173 445 172 495 -225 c272 -124 498 -229
503 -234 11 -11 -92 -1091 -106 -1107 -5 -7 -174 -144 -374 -304 l-364 -292
61 -36 c160 -94 276 -276 296 -463 3 -32 7 -58 9 -58 2 0 231 183 509 406 325
261 507 414 510 427 6 32 176 1829 173 1832 -20 17 -1679 775 -1694 774 -5 0
-193 -72 -418 -160z" />
      <path d="M5704 7084 c-24 -76 -83 -173 -141 -235 -78 -82 -150 -128 -258 -164
-44 -15 -81 -28 -83 -30 -1 -1 123 -143 277 -316 l280 -314 295 -889 c163
-489 294 -891 292 -894 -9 -8 -103 29 -149 58 l-47 29 -5 -22 c-2 -12 -36
-226 -74 -475 -38 -249 -71 -455 -73 -456 -27 -22 -884 -629 -892 -632 -7 -3
-32 10 -57 29 -24 18 -224 161 -444 317 -220 156 -402 284 -403 286 -2 1 -35
207 -73 456 -38 249 -72 463 -74 475 -5 22 -6 22 -63 -12 -100 -59 -183 -78
-325 -73 -106 3 -130 7 -187 32 -36 15 -72 30 -81 32 -13 5 0 -98 82 -628 54
-348 99 -638 99 -645 0 -6 342 -255 760 -552 l761 -541 747 532 c411 292 752
536 759 542 6 6 42 210 79 453 l68 443 186 61 c102 34 186 62 187 63 1 1 -173
529 -387 1174 l-389 1171 -322 363 c-177 200 -326 367 -330 372 -5 5 -11 1
-15 -10z" />
      </g>
    </svg>
  )
}

// Two navigations from one source of truth.
//
// On a laptop the tabs sit along the top. On a phone they sit at the bottom,
// inside thumb reach, which is what Actual Budget does and what the top bar
// was getting wrong on every single interaction.
const TABS = [
  { href: '/', label: 'Month', Icon: IconMonth },
  { href: '/insights', label: 'Insights', Icon: IconInsights },
  { href: '/add', label: 'Add', Icon: IconAdd },
  { href: '/review', label: 'Review', Icon: IconReview },
]
// More, in groups, the way a phone's Settings reads: an icon, a name, and
// what it is for. Money is where to look; Setup is how it gets filed.
const MORE = [
  { href: '/phone', label: 'This phone', hint: 'Read bank texts on Android', group: 'This phone', Icon: IconDeviceMobile },
  { href: '/all', label: 'Everything', hint: 'Every payment, day by day', group: 'Money', Icon: IconListDetails },
  { href: '/claimable', label: 'Claimable', hint: 'What Employer still owes you', group: 'Money', Icon: IconReceipt2 },
  { href: '/deposits', label: 'Deposits', hint: 'Money with landlords, and what came back', group: 'Money', Icon: IconKey },
  { href: '/investments', label: 'Investments', hint: 'Zerodha and deposits, month by month', group: 'Money', Icon: IconTrendingUp },
  { href: '/plan', label: 'Plan a payment', hint: 'Split a payment before it happens', group: 'Money', Icon: IconArrowsSplit },
  { href: '/budgets', label: 'Budgets', hint: 'What is left this month', group: 'Money', Icon: IconTargetArrow },
  { href: '/subscriptions', label: 'Subscriptions', hint: 'This month, yearly plans spread over 12', group: 'Money', Icon: IconCalendarRepeat },
  { href: '/repeat', label: 'Repeat charges', hint: 'Anything that bills you every month', group: 'Money', Icon: IconRepeat },
  { href: '/trips', label: 'Trips and tags', hint: 'What each trip cost, all cards together', group: 'Money', Icon: IconPlane },
  { href: '/m', label: 'Merchants', hint: 'Where the money actually goes', group: 'Money', Icon: IconBuildingStore },
  { href: '/search', label: 'Search', hint: 'By merchant, wording, or amount', group: 'Money', Icon: IconSearch },
  { href: '/accounts', label: 'Accounts', hint: 'Balances each bank last reported', group: 'Setup', Icon: IconBuildingBank },
  { href: '/categories', label: 'Categories', hint: 'Add, rename and nest them', group: 'Setup', Icon: IconCategory },
  { href: '/rules', label: 'Rules', hint: 'What files itself, and where', group: 'Setup', Icon: IconAdjustmentsHorizontal },
  { href: '/recurring', label: 'Recurring', hint: 'Rent and anything monthly', group: 'Setup', Icon: IconCalendarRepeat },
  { href: '/import', label: 'Import', hint: 'A card statement, as CSV', group: 'Setup', Icon: IconFileImport },
  { href: '/password', label: 'Change password', hint: 'Set a new one while signed in', group: 'Setup', Icon: IconLock },
]
const GROUPS = ['This phone', 'Money', 'Setup']

export function Nav({ reviewCount }: { reviewCount: number }) {
  const path = usePathname()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => { setOpen(false) }, [path])
  useEffect(() => {
    if (!open) return
    // A tap fires mousedown before click. `box` is the laptop dropdown, so on a
    // phone every tap on a sheet item counted as "outside", the sheet closed,
    // and the link it was unmounting never received the click. The sheet has to
    // be spared here too, or More opens and nothing in it can be reached.
    const away = (e: MouseEvent) => {
      const t = e.target as Node
      if (box.current?.contains(t)) return
      if (t instanceof Element && t.closest('.sheet')) return
      setOpen(false)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [open])

  const inMore = MORE.some(m => path.startsWith(m.href))
  const here = (href: string) => (href === '/' ? path === '/' : path.startsWith(href))

  const grouped = GROUPS.map(g => (
    <div key={g} className="menugroup">
      <div className="label">{g}</div>
      <div className="menucard">
        {MORE.filter(m => m.group === g).map(m => (
          <Link key={m.href} href={m.href} className="menuitem" role="menuitem">
            <span className="menuicon" aria-hidden="true"><m.Icon size={18} stroke={1.8} /></span>
            <span className="menutext"><span className="name">{m.label}</span><span className="who">{m.hint}</span></span>
            <span className="chev" aria-hidden="true">›</span>
          </Link>
        ))}
      </div>
    </div>
  ))
  const moreList = <div className="menu" role="menu">{grouped}</div>

  return (
    <>
      <nav className="nav">
        <Link href="/" className="brand"><Mark />Household</Link>

        <div className="toptabs">
          {TABS.map(t => (
            <Link key={t.href} href={t.href} className="tab" aria-current={here(t.href) ? 'page' : undefined}>
              {t.label}
              {t.href === '/review' && reviewCount > 0 && <span className="pip">{reviewCount}</span>}
            </Link>
          ))}
          <div className="menuwrap" ref={box}>
            <button className={`theme${inMore ? ' on' : ''}`} onClick={() => setOpen(o => !o)}
              aria-expanded={open} aria-haspopup="menu" aria-label="More">⋯</button>
            {open && moreList}
          </div>
        </div>

        <ThemeToggle />
      </nav>

      <nav className="bottomnav" aria-label="Main">
        {TABS.map(t => (
          <Link key={t.href} href={t.href} className="btab" aria-current={here(t.href) ? 'page' : undefined} aria-label={t.label}>
            <span className="bicon">
              <t.Icon size={26} />
              {t.href === '/review' && reviewCount > 0 && <span className="bdot">{reviewCount}</span>}
            </span>
            <span className="blabel">{t.label}</span>
          </Link>
        ))}
        <button className={`btab${inMore ? ' on' : ''}`} onClick={() => setOpen(o => !o)}
          aria-expanded={open} aria-label="More">
          <span className="bicon"><IconMore size={26} /></span>
          <span className="blabel">More</span>
        </button>
      </nav>

      {open && (
        <div className="sheetback" onClick={() => setOpen(false)}>
          <div className="sheet" onClick={e => e.stopPropagation()} role="menu">
            <div className="grabber" />
            {grouped}
          </div>
        </div>
      )}
    </>
  )
}
