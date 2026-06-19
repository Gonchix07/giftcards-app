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

export default function App() {
  const { session, isAdmin, role, loading } = useAuth()

  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Admin */}
      <Route
        element={
          <ProtectedRoute requireAdmin>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/admin" element={<AdminHome />} />
        <Route path="/admin/empresas" element={<Empresas />} />
        <Route path="/admin/clientes" element={<Clientes />} />
        <Route path="/admin/giftcards" element={<GiftCards />} />
        <Route path="/admin/reportes" element={<Reportes />} />
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

      {/* Raíz: redirige según rol */}
      <Route
        path="/"
        element={
          loading ? (
            <div className="min-h-screen grid place-items-center text-slate-500">Cargando…</div>
          ) : !session ? (
            <Navigate to="/login" replace />
          ) : isAdmin ? (
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
