import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { hasPermission, type Permission } from '../auth/permissions'

type MenuItem = { label: string; to: string; permission: Permission }

const menuItems: { pedidos: MenuItem[]; inventario: MenuItem[] } = {
  pedidos: [
    { label: 'Histórico de pedidos', to: '/pedidos/historico', permission: 'pedidos_historico' },
    { label: 'Coletar', to: '/pedidos/coletar', permission: 'pedidos_coletar' },
    { label: 'Embalar', to: '/pedidos/embalar', permission: 'pedidos_embalar' },
    { label: 'Manifestar', to: '/pedidos/manifestar', permission: 'pedidos_manifestar' },
  ],
  inventario: [
    { label: 'Todo o inventário', to: '/inventario/todo', permission: 'inventario_todo' },
    { label: 'Etiquetas', to: '/inventario/etiquetas', permission: 'inventario_todo' },
    { label: 'Receber', to: '/inventario/receber', permission: 'inventario_receber' },
    { label: 'Ajustar', to: '/inventario/ajustar', permission: 'inventario_ajustar' },
  ],
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { permissions, session, signOut } = useAuth()

  const filterMenu = (items: MenuItem[]) => items.filter((item) => hasPermission(permissions, item.permission))

  return (
    <div className="min-h-screen text-[var(--ink)]">
      <div className="relative flex min-h-screen">
        <aside className="fixed inset-y-0 left-0 hidden w-72 flex-col gap-6 bg-[var(--nav)] px-6 py-8 text-white lg:flex">
          <div className="flex items-center gap-3">
            <img src="/ml_logo.png" alt="Tiny ERP" className="h-8 w-auto" />
          </div>
          <div className="rounded-lg bg-white/10 px-3 py-2 text-xs text-white/80">
            <p className="font-semibold text-white">{session?.user?.email ?? 'Usuário'}</p>
            <button
              className="mt-2 text-[11px] uppercase tracking-wide text-white/70 hover:text-white"
              onClick={() => signOut()}
            >
              Sair
            </button>
          </div>

          <nav className="flex flex-col gap-4 text-sm">
            <div>
              <p className="mb-2 text-xs uppercase text-[var(--nav-muted)]">Pedidos</p>
              <ul className="flex flex-col gap-1">
                {filterMenu(menuItems.pedidos).map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      className={({ isActive }) =>
                        `block rounded px-3 py-2 ${
                          isActive
                            ? 'bg-white/10 text-white'
                            : 'text-[var(--nav-muted)] hover:bg-white/10 hover:text-white'
                        }`
                      }
                    >
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-2 text-xs uppercase text-[var(--nav-muted)]">Inventário</p>
              <ul className="flex flex-col gap-1">
                {filterMenu(menuItems.inventario).map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      className={({ isActive }) =>
                        `block rounded px-3 py-2 ${
                          isActive
                            ? 'bg-white/10 text-white'
                            : 'text-[var(--nav-muted)] hover:bg-white/10 hover:text-white'
                        }`
                      }
                    >
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          </nav>
        </aside>

        <div
          className={`fixed inset-0 z-40 bg-black/40 transition-opacity lg:hidden ${
            mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          onClick={() => setMobileOpen(false)}
        />
        <aside
          className={`fixed inset-y-0 left-0 z-50 w-72 -translate-x-full flex-col gap-6 bg-[var(--nav)] px-6 py-8 text-white transition-transform lg:hidden ${
            mobileOpen ? 'translate-x-0' : ''
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <img src="/ml_logo.png" alt="Tiny ERP" className="h-8 w-auto" />
            <button
              className="rounded border border-white/20 px-2 py-1 text-xs"
              onClick={() => setMobileOpen(false)}
            >
              Fechar
            </button>
          </div>

          <nav className="flex flex-col gap-4 text-sm">
            <div>
              <p className="mb-2 text-xs uppercase text-[var(--nav-muted)]">Pedidos</p>
              <ul className="flex flex-col gap-1">
                {filterMenu(menuItems.pedidos).map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      onClick={() => setMobileOpen(false)}
                      className={({ isActive }) =>
                        `block rounded px-3 py-2 ${
                          isActive
                            ? 'bg-white/10 text-white'
                            : 'text-[var(--nav-muted)] hover:bg-white/10 hover:text-white'
                        }`
                      }
                    >
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-2 text-xs uppercase text-[var(--nav-muted)]">Inventário</p>
              <ul className="flex flex-col gap-1">
                {filterMenu(menuItems.inventario).map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      onClick={() => setMobileOpen(false)}
                      className={({ isActive }) =>
                        `block rounded px-3 py-2 ${
                          isActive
                            ? 'bg-white/10 text-white'
                            : 'text-[var(--nav-muted)] hover:bg-white/10 hover:text-white'
                        }`
                      }
                    >
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          </nav>
        </aside>

        <main className="flex-1 pb-16 lg:ml-72">
          <div className="px-4 pt-4 sm:px-8 lg:hidden">
            <div className="flex items-center justify-between gap-4">
              <button
                className="rounded border border-black/10 bg-white px-3 py-2 text-sm"
                onClick={() => setMobileOpen(true)}
              >
                Menu
              </button>
              <button
                className="text-xs font-semibold uppercase text-[var(--ink-muted)]"
                onClick={() => signOut()}
              >
                Sair
              </button>
            </div>
          </div>
          {children}
        </main>
      </div>
    </div>
  )
}
