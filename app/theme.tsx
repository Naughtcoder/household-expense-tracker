'use client'
import { useEffect, useState } from 'react'

type Mode = 'dark' | 'black' | 'light' | 'system'

export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>('system')

  useEffect(() => {
    setMode((localStorage.getItem('theme') as Mode) ?? 'system')
  }, [])

  function cycle() {
    // system, dark, true black, light, then back. The device setting is a
    // legitimate answer and most apps forget it.
    const next: Mode = mode === 'system' ? 'dark' : mode === 'dark' ? 'black' : mode === 'black' ? 'light' : 'system'
    setMode(next)
    if (next === 'system') {
      localStorage.removeItem('theme')
      document.documentElement.removeAttribute('data-theme')
    } else {
      localStorage.setItem('theme', next)
      document.documentElement.setAttribute('data-theme', next)
    }
  }

  const label = mode === 'system' ? 'Following your device' : mode === 'dark' ? 'Dark' : mode === 'black' ? 'True black' : 'Light'
  return (
    <button className="theme" onClick={cycle} title={label} aria-label={`Theme: ${label}. Tap to change.`}>
      {mode === 'system' ? '◐' : mode === 'dark' ? '☾' : mode === 'black' ? '●' : '☀'}
    </button>
  )
}

/** Runs before paint so a light-mode user never sees a dark flash. */
export const themeScript = `(function(){try{var t=localStorage.getItem('theme');if(t)document.documentElement.setAttribute('data-theme',t)}catch(e){}})()`
