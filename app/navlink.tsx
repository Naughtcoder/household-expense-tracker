'use client'
import Link, { useLinkStatus } from 'next/link'

/** Lights up the moment it is tapped, while the next page is fetched, so a
 *  tap never looks ignored. */
function Status() {
  const { pending } = useLinkStatus()
  return pending ? <span className="tapdot" aria-hidden /> : null
}

export function NavLink({ className, children, ...rest }: React.ComponentProps<typeof Link>) {
  return (
    <Link {...rest} className={className}>
      {children}
      <Status />
    </Link>
  )
}
