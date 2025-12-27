import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'

type LocationState = {
  from?: {
    pathname?: string
  }
}

export default function LoginPage() {
  const { session, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as LocationState | null
  const nextPath = state?.from?.pathname || '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (session) {
    return <Navigate to={nextPath} replace />
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await signIn(email.trim(), password)
      navigate(nextPath, { replace: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao entrar'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen bg-[var(--bg)] px-6 py-12"
      style={{
        backgroundImage: "linear-gradient(180deg, rgba(17, 24, 39, 0.65), rgba(17, 24, 39, 0.65)), url('/img-login.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="mx-auto w-full max-w-sm rounded-2xl bg-white/95 p-6 shadow-sm backdrop-blur">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src="/mercado-livre-2.svg" alt="Tiny ERP" className="h-16 w-auto" />
          <h1 className="mt-4 text-lg font-semibold text-[var(--ink)]">Entrar</h1>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">Acesse com seu usuário autorizado</p>
        </div>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="text-xs font-semibold uppercase text-[var(--ink-muted)]">Email</label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase text-[var(--ink-muted)]">Senha</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  event.currentTarget.form?.requestSubmit()
                }
              }}
              className="mt-2 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
              required
            />
          </div>
          {error ? <p className="text-xs text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-black/90 disabled:opacity-60"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
