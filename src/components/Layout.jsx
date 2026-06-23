import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Button } from './ui'

export default function Layout() {
  const { profile, isAdmin, role, signOut } = useAuth()
  const navigate = useNavigate()

  const adminLinks = [
    { to: '/admin', label: 'Inicio', end: true },
    { to: '/admin/empresas', label: 'Empresas' },
    { to: '/admin/clientes', label: 'Clientes' },
    { to: '/admin/giftcards', label: 'Gift Cards' },
    { to: '/admin/reportes', label: 'Reportes' },
    { to: '/admin/usuarios', label: 'Usuarios' },
    { to: '/admin/mails', label: 'Mails' },
  ]
  const cajeroLinks = [{ to: '/cajero', label: 'Cobrar', end: true }]
  const atencionLinks = [{ to: '/atencion', label: 'Atención al cliente', end: true }]
  const tesoreriaLinks = [
    { to: '/admin', label: 'Inicio', end: true },
    { to: '/admin/reportes', label: 'Reportes' },
  ]
  const links = isAdmin
    ? adminLinks
    : role === 'tesoreria'
    ? tesoreriaLinks
    : role === 'atencion'
    ? atencionLinks
    : cajeroLinks

  async function handleLogout() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-indigo-700 text-white">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <span className="font-bold text-lg">🎁 Gift Cards</span>
            <nav className="hidden sm:flex gap-1">
              {links.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  end={l.end}
                  className={({ isActive }) =>
                    `px-3 py-1.5 rounded-lg text-sm font-medium ${
                      isActive ? 'bg-white/20' : 'hover:bg-white/10'
                    }`
                  }
                >
                  {l.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden md:inline opacity-90">{profile?.email}</span>
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                isAdmin
                  ? 'bg-amber-300 text-amber-900'
                  : role === 'tesoreria'
                  ? 'bg-violet-200 text-violet-800'
                  : role === 'atencion'
                  ? 'bg-sky-200 text-sky-800'
                  : 'bg-white text-emerald-700'
              }`}
              title={`Rol: ${
                isAdmin
                  ? 'Administrador'
                  : role === 'tesoreria'
                  ? 'Tesorería'
                  : role === 'atencion'
                  ? 'Atención al Cliente'
                  : 'Cajero'
              }`}
            >
              {isAdmin
                ? '👑 Administrador'
                : role === 'tesoreria'
                ? '💰 Tesorería'
                : role === 'atencion'
                ? '🎧 Atención al Cliente'
                : '🧾 Cajero'}
            </span>
            <a
              href="/ayuda"
              target="_blank"
              rel="noopener noreferrer"
              title="Ayuda (se abre en una pestaña nueva)"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-sm font-medium hover:bg-white/10"
            >
              <span className="grid place-items-center h-5 w-5 rounded-full bg-white/20 text-xs font-bold">?</span>
              <span className="hidden sm:inline">Ayuda</span>
            </a>
            <Button variant="ghost" className="text-white hover:bg-white/10" onClick={handleLogout}>
              Salir
            </Button>
          </div>
        </div>
        {/* nav mobile */}
        <nav className="sm:hidden flex gap-1 px-4 pb-2 overflow-x-auto">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-sm whitespace-nowrap ${
                  isActive ? 'bg-white/20' : 'hover:bg-white/10'
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
