import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { API_AUTH_MODE, API_BASE_URL, AUTH_REQUIRED_EVENT, getApiLoginUrl } from '../config'
import { Button } from './common/button'

export function ApiSession({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(API_AUTH_MODE === 'public')
  const [problem, setProblem] = useState(false)
  const [checking, setChecking] = useState(API_AUTH_MODE !== 'public')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (API_AUTH_MODE === 'public') return
    const controller = new AbortController()
    async function check() {
      try {
        if (API_AUTH_MODE !== 'private') throw new Error('Invalid authentication mode')
        const response = await fetch(`${API_BASE_URL}/auth/session`, {
          credentials: 'include', redirect: 'error', cache: 'no-store', signal: controller.signal,
        })
        if (!response.ok || (await response.json()).mode !== 'private') throw new Error('Session unavailable')
        if (!controller.signal.aborted) { setReady(true); setProblem(false) }
      } catch {
        if (!controller.signal.aborted) setProblem(true)
      } finally {
        if (!controller.signal.aborted) setChecking(false)
      }
    }
    void check()
    return () => controller.abort()
  }, [attempt])

  useEffect(() => {
    const onAuthRequired = () => setProblem(true)
    window.addEventListener(AUTH_REQUIRED_EVENT, onAuthRequired)
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, onAuthRequired)
  }, [])

  const retry = () => { setChecking(true); setAttempt(value => value + 1) }

  return <>
    {/* Keep the routed app mounted after startup so failed saves retain drafts. */}
    {ready && children}
    {!ready && !problem && <div role="status" className="flex min-h-dvh items-center justify-center bg-background p-6 text-foreground">Checking your session…</div>}
    {problem && <div className={ready ? 'fixed inset-x-0 top-0 z-[110] p-4' : 'flex min-h-dvh items-center justify-center bg-background p-4'}>
      <div role="alert" className="mx-auto w-full max-w-lg rounded-xl border border-border bg-card p-5 text-card-foreground shadow-lg">
        <h1 className="text-lg font-semibold">Connect to Finance Manager</h1>
        <p className="mt-2 text-sm text-muted-foreground">Your session may have expired, or the API is unavailable. Sign in with Cloudflare, then retry.</p>
        {ready && <p className="mt-2 text-sm text-muted-foreground">Sign in in another tab to keep your unsaved changes here.</p>}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {API_AUTH_MODE === 'private' && <a href={getApiLoginUrl()} target={ready ? '_blank' : undefined} rel="noopener noreferrer" className="inline-flex min-h-10 items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Sign in</a>}
          <Button variant="outline" onClick={retry} disabled={checking}>{checking ? 'Checking…' : 'Retry connection'}</Button>
        </div>
      </div>
    </div>}
  </>
}
