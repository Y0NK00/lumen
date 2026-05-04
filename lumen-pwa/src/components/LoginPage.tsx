import { useState, useRef, useEffect } from 'react'
import { login } from '../lib/api'
import { useAuthStore } from '../stores/authStore'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const setAuth = useAuthStore((s) => s.setAuth)
  const emailRef = useRef<HTMLInputElement>(null)

  useEffect(() => { emailRef.current?.focus() }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    setError(null)
    setLoading(true)
    try {
      const { token, user } = await login(email.trim(), password)
      setAuth(token, user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-full w-full flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-[360px]">
        {/* Logo mark */}
        <div className="flex items-center gap-2.5 mb-8 justify-center">
          <div className="w-8 h-8 rounded-xl bg-accent/20 border border-accent/30 flex items-center justify-center text-accent">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 2L14 5.5V10.5L8 14L2 10.5V5.5L8 2Z"
                stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              <circle cx="8" cy="8" r="2" fill="currentColor" />
            </svg>
          </div>
          <span className="text-[18px] font-semibold text-text-primary tracking-tight">Lumen</span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-[12px] font-medium text-text-secondary mb-1.5">
              Email
            </label>
            <input
              ref={emailRef}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-surface
                         text-[14px] text-text-primary placeholder:text-text-muted
                         focus:outline-none focus:border-accent/50
                         focus:shadow-[0_0_0_3px_rgba(139,92,246,0.12)]
                         transition-all"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-[12px] font-medium text-text-secondary mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-surface
                         text-[14px] text-text-primary placeholder:text-text-muted
                         focus:outline-none focus:border-accent/50
                         focus:shadow-[0_0_0_3px_rgba(139,92,246,0.12)]
                         transition-all"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-[12.5px] text-error px-1">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full py-2.5 rounded-xl bg-accent text-white text-[14px] font-medium
                       hover:bg-accent-hover active:scale-[0.98]
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all mt-1"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-center text-[11.5px] text-text-muted">
          Self-hosted — your data stays on your server.
        </p>
      </div>
    </div>
  )
}
