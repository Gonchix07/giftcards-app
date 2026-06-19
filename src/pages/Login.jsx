import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Button, Input, Card } from '../components/ui'

export default function Login() {
  const { signIn, session, loading: authLoading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  if (!authLoading && session) {
    navigate('/', { replace: true })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn(email, password)
    setLoading(false)
    if (error) {
      // Muestra el mensaje real de Supabase para poder diagnosticar
      setError(error.message || 'Email o contraseña incorrectos.')
      console.error('Login error:', error)
      return
    }
    navigate('/', { replace: true })
  }

  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-br from-indigo-600 to-indigo-900 px-4">
      <Card className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">
            <span className="gift-anim">🎁</span>
          </div>
          <h1 className="text-xl font-bold text-slate-800">Gestión de Gift Cards</h1>
          <p className="text-sm text-slate-500">Iniciá sesión para continuar</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <Input
            label="Contraseña"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Ingresando…' : 'Ingresar'}
          </Button>
        </form>

        <div className="mt-6 pt-4 border-t text-center text-xs text-slate-400 leading-relaxed">
          <p className="font-medium text-slate-500">Departamento de Sistemas</p>
          <p>HERGO | MENOR COSTE</p>
          <p>ver.1.6.0</p>
        </div>
      </Card>
    </div>
  )
}
