'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { retryUnparsed, dismissUnparsed } from './actions'

export function UnparsedCard({ row }: { row: { id: string; raw_text: string; created_at: string } }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [note, setNote] = useState<string | null>(null)

  return (
    <section className="card">
      <div className="label">
        {new Date(row.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
      </div>
      <div className="raw" style={{ marginTop: 8 }}>{row.raw_text}</div>
      <button className="chip" style={{ marginTop: 12 }} disabled={pending}
        onClick={() => start(async () => {
          const res = await retryUnparsed(row.id, row.raw_text)
          setNote(res.error ?? 'Read and filed.')
          if (res.ok && !res.error) router.refresh()
        })}>
        {pending ? 'Trying' : 'Try again'}
      </button>
      <button className="chip" style={{ marginTop: 12, marginLeft: 8 }} disabled={pending}
        onClick={() => start(async () => {
          const res = await dismissUnparsed(row.id)
          if (res.error) setNote(res.error); else router.refresh()
        })}>
        Not a payment, dismiss
      </button>
      {note && <p className="sub" style={{ marginTop: 10, color: note.includes('filed') ? 'var(--credit)' : 'var(--warn)' }}>{note}</p>}
    </section>
  )
}
