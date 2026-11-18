'use client'
import { useState } from 'react'

/** Whether money spent on a trip (meals, cabs, medicines while away) counts
 *  under Travel or stays in its own category. Both breakdowns are already on
 *  the page, so this only swaps which one shows; the address is updated so a
 *  reload or a link keeps the choice. */
export function TripsSwitch({ on: initial, amount }: { on: boolean; amount: string }) {
  const [on, setOn] = useState(initial)
  const flip = () => {
    const next = !on
    setOn(next)
    document.querySelectorAll<HTMLElement>('.tripsview').forEach(el => { el.dataset.trips = next ? 'travel' : 'own' })
    const u = new URL(window.location.href)
    if (next) u.searchParams.delete('trips'); else u.searchParams.set('trips', 'own')
    window.history.replaceState(window.history.state, '', u.toString())
  }
  return (
    <button type="button" role="switch" aria-checked={on} className="tripsswitch" onClick={flip}>
      <span className="txt">
        <b>Count trips as Travel</b>
        <span>{on
          ? `On: the ${amount} spent on trips (meals, cabs, medicines) shows under Travel.`
          : `Off: the ${amount} spent on trips stays in Food, Transportation, Health and so on.`}</span>
      </span>
      <span className={`knob${on ? ' yes' : ''}`} />
    </button>
  )
}
