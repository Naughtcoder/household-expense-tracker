'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { previewStatement, importStatement, importBulk, type Preview, type ImportResult } from './actions'
import { inr, dayLabel } from '../../lib/format'

export function ImportForm() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [text, setText] = useState<string | null>(null)
  const [name, setName] = useState<string>('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [done, setDone] = useState<ImportResult | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)

  // Anything large goes in chunks, so one slow request cannot time out and lose
  // the lot. Each chunk is safe to repeat.
  async function runBulk(body: string) {
    let offset = 0, saved = 0, dupes = 0
    for (;;) {
      const res = await importBulk(body, offset)
      if (res.error) { setProblem(res.error); return }
      saved += res.saved ?? 0
      dupes += res.duplicates ?? 0
      setProgress(`${Math.min(offset + 800, res.total ?? 0).toLocaleString('en-IN')} of ${(res.total ?? 0).toLocaleString('en-IN')} read, ${saved.toLocaleString('en-IN')} added`)
      if (res.done || res.next === undefined) break
      offset = res.next
    }
    setProgress(null)
    setDone({ saved, duplicates: dupes, message: `${saved.toLocaleString('en-IN')} added, ${dupes.toLocaleString('en-IN')} already there.` })
    router.refresh()
  }

  function pick(file: File) {
    setProblem(null); setPreview(null); setDone(null)
    setName(file.name)
    const reader = new FileReader()
    reader.onload = () => {
      const body = String(reader.result ?? '')
      setText(body)
      start(async () => {
        const res = await previewStatement(body)
        if ('error' in res) setProblem(res.error)
        else setPreview(res)
      })
    }
    reader.readAsText(file)
  }

  return (
    <>
      <section className="card grid" style={{ gap: 12 }}>
        <div>
          <h2>Pick a file</h2>
          <p className="sub" style={{ marginTop: 6 }}>
            An BankA credit card statement, downloaded as CSV from the card portal.
          </p>
        </div>
        <input className="input" type="file" accept=".csv,text/csv,text/plain"
          onChange={e => { const f = e.target.files?.[0]; if (f) pick(f) }} />
        {name && <p className="sub">{name}</p>}
        {problem && <div className="raw" style={{ color: 'var(--caution)' }}>{problem}</div>}
      </section>

      {preview && !done && (
        <section className="card grid" style={{ gap: 12 }}>
          <div>
            <h2>What is in it</h2>
            <p className="sub" style={{ marginTop: 6 }}>Read as a {preview.format}. Nothing is saved yet.</p>
          </div>

          <div className="rows">
            <div className="row"><div className="name">Transactions</div><div className="amt num">{preview.total}</div></div>
            <div className="row"><div className="name">Spending</div><div className="amt num">{inr(preview.debits)}</div></div>
            {preview.credits > 0 && (
              <div className="row"><div className="name">Credits and payments</div><div className="amt num credit">{inr(preview.credits)}</div></div>
            )}
            <div className="row">
              <div className="name">Period</div>
              <div className="amt">{preview.from ? dayLabel(preview.from) : '?'} to {preview.to ? dayLabel(preview.to) : '?'}</div>
            </div>
            <div className="row">
              <div><div className="name">Merchants already known</div>
                <div className="who">the rest will wait in Review</div></div>
              <div className="amt num">{preview.recognised}</div>
            </div>
          </div>

          {preview.unknownMerchants.length > 0 && (
            <>
              <div className="label">New to the app</div>
              <div className="chips">
                {preview.unknownMerchants.map(m => <span className="chip" key={m}>{m}</span>)}
              </div>
            </>
          )}

          <p className="sub">
            Card bill payments and GST lines are left out, since neither is spending.
            Anything that looks like something already here goes to Review rather than
            being refused.
          </p>

          <button className="btn" disabled={pending}
            onClick={() => start(async () => {
              if (preview.total > 400) { await runBulk(text!); return }
              const res = await importStatement(text!)
              if (res.error) setProblem(res.error)
              else { setDone(res); router.refresh() }
            })}>
            {pending ? (progress ?? 'Importing') : `Import ${preview.total.toLocaleString('en-IN')} transactions`}
          </button>
        </section>
      )}

      {done && (
        <section className="card">
          <h2>Done</h2>
          <p className="sub" style={{ marginTop: 8 }}>{done.message}</p>
        </section>
      )}
    </>
  )
}
