import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import AdminHome from './pages/AdminHome'
import Empresas from './pages/Empresas'
import Clientes from './pages/Clientes'
import GiftCards from './pages/GiftCards'
import Reportes from './pages/Reportes'
import Usuarios from './pages/Usuarios'
import Mails from './pages/Mails'
import Cajero from './pages/Cajero'
import Atencion from './pages/Atencion'
import Ayuda from './pages/Ayuda'

export default function App() {
  const { session, isAdmin, role, loading } = useAuth()

  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Inicio, Reportes y Gift Cards: admin y tesorería */}
      <Route
        element={
          <ProtectedRoute roles={['tesoreria']}>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/admin" element={<AdminHome />} />
        <Route path="/admin/reportes" element={<Reportes />} />
        <Route path="/admin/giftcards" element={<GiftCards />} />
      </Route>

      {/* Resto del admin: solo administrador */}
      <Route
        element={
          <ProtectedRoute requireAdmin>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/admin/empresas" element={<Empresas />} />
        <Route path="/admin/clientes" element={<Clientes />} />
        <Route path="/admin/usuarios" element={<Usuarios />} />
        <Route path="/admin/mails" element={<Mails />} />
      </Route>

      {/* Cajero (también accesible por admin) */}
      <Route
        element={
          <ProtectedRoute roles={['cajero']}>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/cajero" element={<Cajero />} />
      </Route>

      {/* Atención al Cliente (también accesible por admin) */}
      <Route
        element={
          <ProtectedRoute roles={['atencion']}>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/atencion" element={<Atencion />} />
      </Route>

      {/* Ayuda: disponible para cualquier usuario logueado */}
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/ayuda" element={<Ayuda />} />
      </Route>

      {/* Raíz: redirige según rol */}
      <Route
        path="/"
        element={
          loading ? (
            <div className="min-h-screen grid place-items-center text-slate-500">Cargando…</div>
          ) : !session ? (
            <Navigate to="/login" replace />
          ) : isAdmin || role === 'tesoreria' ? (
            <Navigate to="/admin" replace />
          ) : role === 'atencion' ? (
            <Navigate to="/atencion" replace />
          ) : (
            <Navigate to="/cajero" replace />
          )
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
