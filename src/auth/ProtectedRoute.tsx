import { Navigate, useLocation } from 'react-router-dom'
import type { Permission } from './permissions'
import { hasPermission } from './permissions'
import { useAuth } from './AuthProvider'

type ProtectedRouteProps = {
  permission?: Permission | Permission[]
  children: React.ReactNode
}

export default function ProtectedRoute({ permission, children }: ProtectedRouteProps) {
  const { session, permissions, permissionsLoading, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <div className="p-6 text-sm text-[var(--ink-muted)]">Carregando sessão...</div>
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (permissionsLoading && permissions.length === 0) {
    return <div className="p-6 text-sm text-[var(--ink-muted)]">Carregando permissões...</div>
  }

  if (!hasPermission(permissions, permission)) {
    return (
      <div className="p-6">
        <h2 className="text-lg font-semibold text-[var(--ink)]">Sem permissão</h2>
        <p className="mt-2 text-sm text-[var(--ink-muted)]">
          Você não tem acesso a esta página. Fale com o administrador.
        </p>
      </div>
    )
  }

  return <>{children}</>
}
