import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import ProtectedRoute from './auth/ProtectedRoute'
import { useAuth } from './auth/AuthProvider'
import { getDefaultPath } from './auth/permissions'
import Layout from './components/Layout'
import ColetarDetailPage from './pages/ColetarDetailPage'
import ColetarPage from './pages/ColetarPage'
import EmbalarPage from './pages/EmbalarPage'
import HistoricoPage from './pages/HistoricoPage'
import InventarioDetalhePage from './pages/InventarioDetalhePage'
import InventarioPage from './pages/InventarioPage'
import LoginPage from './pages/LoginPage'
import ManifestarPage from './pages/ManifestarPage'
import ManifestarDetailPage from './pages/ManifestarDetailPage'
import PedidoDetalhePage from './pages/PedidoDetalhePage'
import ReceberPage from './pages/ReceberPage'
import AjustarPage from './pages/AjustarPage'

const ProtectedLayout = () => (
  <ProtectedRoute>
    <Layout>
      <Outlet />
    </Layout>
  </ProtectedRoute>
)

const TitleUpdater = () => {
  const location = useLocation()

  useEffect(() => {
    const path = location.pathname
    const baseTitle = 'Expedição MELI'

    const titleMap: Array<{ match: (pathname: string) => boolean; title: string }> = [
      { match: (pathname) => pathname === '/login', title: `Login - ${baseTitle}` },
      { match: (pathname) => pathname.startsWith('/pedidos/historico'), title: `Histórico de pedidos - ${baseTitle}` },
      { match: (pathname) => pathname.startsWith('/pedidos/coletar'), title: `Coletar - ${baseTitle}` },
      { match: (pathname) => pathname.startsWith('/pedidos/embalar'), title: `Embalar - ${baseTitle}` },
      { match: (pathname) => pathname.startsWith('/pedidos/manifestar'), title: `Manifestar - ${baseTitle}` },
      { match: (pathname) => pathname.startsWith('/inventario/todo'), title: `Todo o inventário - ${baseTitle}` },
      { match: (pathname) => pathname.startsWith('/inventario/receber'), title: `Receber - ${baseTitle}` },
      { match: (pathname) => pathname.startsWith('/inventario/ajustar'), title: `Ajustar - ${baseTitle}` },
      { match: (pathname) => pathname.startsWith('/inventario/'), title: `Inventário - ${baseTitle}` },
    ]

    const match = titleMap.find((item) => item.match(path))
    document.title = match?.title ?? baseTitle
  }, [location.pathname])

  return null
}

const HomeRedirect = () => {
  const { permissions, permissionsLoading } = useAuth()

  if (permissionsLoading) {
    return <div className="p-6 text-sm text-[var(--ink-muted)]">Carregando permissões...</div>
  }

  const target = getDefaultPath(permissions)
  if (target === '/') {
    return (
      <div className="p-6">
        <h2 className="text-lg font-semibold text-[var(--ink)]">Sem permissão</h2>
        <p className="mt-2 text-sm text-[var(--ink-muted)]">
          Você não tem acesso a nenhuma página. Fale com o administrador.
        </p>
      </div>
    )
  }

  return <Navigate to={target} replace />
}

export default function App() {
  return (
    <>
      <TitleUpdater />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedLayout />}>
          <Route path="/" element={<HomeRedirect />} />
          <Route
            path="/pedidos/historico"
            element={
              <ProtectedRoute permission="pedidos_historico">
                <HistoricoPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/pedidos/historico/:id"
            element={
              <ProtectedRoute permission="pedidos_historico">
                <PedidoDetalhePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/pedidos/coletar"
            element={
              <ProtectedRoute permission="pedidos_coletar">
                <ColetarPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/pedidos/coletar/:id"
            element={
              <ProtectedRoute permission="pedidos_coletar">
                <ColetarDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/pedidos/embalar"
            element={
              <ProtectedRoute permission="pedidos_embalar">
                <EmbalarPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/pedidos/manifestar"
            element={
              <ProtectedRoute permission="pedidos_manifestar">
                <ManifestarPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/pedidos/manifestar/:id"
            element={
              <ProtectedRoute permission="pedidos_manifestar">
                <ManifestarDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/inventario/todo"
            element={
              <ProtectedRoute permission="inventario_todo">
                <InventarioPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/inventario/:id"
            element={
              <ProtectedRoute permission="inventario_todo">
                <InventarioDetalhePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/inventario/receber"
            element={
              <ProtectedRoute permission="inventario_receber">
                <ReceberPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/inventario/ajustar"
            element={
              <ProtectedRoute permission="inventario_ajustar">
                <AjustarPage />
              </ProtectedRoute>
            }
          />
        </Route>
      </Routes>
    </>
  )
}
