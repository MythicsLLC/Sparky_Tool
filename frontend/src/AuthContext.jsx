import { createContext, useContext, useEffect, useState } from 'react'
import { useAuth as useClerkAuth, useClerk } from '@clerk/clerk-react'
import { getMe, patchMe, setTokenGetter } from './api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const { isLoaded, isSignedIn, getToken } = useClerkAuth()
  const clerk = useClerk()
  const [token, setToken] = useState('')
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Register Clerk's getToken with the Axios interceptor so every request
  // automatically carries a fresh JWT — no component ever holds a stale token.
  useEffect(() => {
    setTokenGetter(isSignedIn ? getToken : null)
  }, [isSignedIn, getToken])

  useEffect(() => {
    if (!isLoaded) return
    if (!isSignedIn) {
      setUser(null)
      setToken('')
      setError(null)
      setLoading(false)
      return
    }

    const loadUser = async () => {
      setLoading(true)
      try {
        const authToken = await getToken()
        setToken(authToken)
        const response = await getMe(authToken)
        setUser(response.data)
        setError(null)
      } catch (err) {
        setUser(null)
        setToken('')
        setError('Unable to authenticate with Clerk.')
      } finally {
        setLoading(false)
      }
    }

    loadUser()
  }, [isLoaded, isSignedIn, getToken])

  const signOut = async () => {
    try {
      await clerk?.signOut()
    } catch {
      // ignore
    }
    setToken('')
    setUser(null)
    setError(null)
  }

  const markOnboarded = async () => {
    if (!user || !token) return
    try {
      await patchMe({ onboarded: true }, token)
      setUser((prev) => prev && { ...prev, onboarded: true })
    } catch {
      /* ignore */
    }
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, error, signOut, markOnboarded, getToken }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider')
  }
  return context
}
