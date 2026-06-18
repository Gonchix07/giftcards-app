import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function ProtectedRoute({ children, requireAdmin = false }) {
  const { session, isAdmin, loading } = useAuth()

  if (loading) {
    return <div className="min-h-screen grid place-items-center text-slate-500">Cargando…</div>
  }
  if (!session) return <Navigate to="/login" replace />
  if (requireAdmin && !isAdmin) return <Navigate to="/cajero" replace />

  return children
}
