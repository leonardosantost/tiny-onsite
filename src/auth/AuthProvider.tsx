import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import { normalizePermissionList, type Permission } from './permissions'

type AuthContextValue = {
  session: Session | null
  permissions: Permission[]
  permissionsLoading: boolean
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const fetchPermissions = async (userId: string): Promise<Permission[]> => {
  const { data, error } = await supabase
    .from('user_permissions')
    .select('permission')
    .eq('user_id', userId)

  if (error || !data) {
    console.error('Failed to load permissions', error)
    return []
  }

  return data.flatMap((row) => normalizePermissionList(row.permission))
}

const fetchPermissionsWithTimeout = async (userId: string, timeoutMs: number) => {
  const timeout = new Promise<Permission[]>((resolve) => {
    setTimeout(() => resolve([]), timeoutMs)
  })

  const result = await Promise.race([fetchPermissions(userId), timeout])
  if (result.length === 0) {
    console.warn('Permissions fetch timed out or empty')
  }
  return result
}

const permissionsStorageKey = 'tiny-onsite-permissions'

const readCachedPermissions = (userId: string): Permission[] | null => {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(permissionsStorageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { userId?: string; permissions?: Permission[] }
    if (parsed.userId !== userId || !Array.isArray(parsed.permissions)) return null
    return parsed.permissions
  } catch {
    return null
  }
}

const writeCachedPermissions = (userId: string, next: Permission[]) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      permissionsStorageKey,
      JSON.stringify({ userId, permissions: next, updatedAt: Date.now() }),
    )
  } catch {
    // Ignore storage failures.
  }
}

const clearCachedPermissions = () => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(permissionsStorageKey)
  } catch {
    // Ignore storage failures.
  }
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null)
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [permissionsLoading, setPermissionsLoading] = useState(true)
  const [loading, setLoading] = useState(true)
  const lastUserIdRef = useRef<string | null>(null)

  const refreshPermissions = useCallback(async (activeSession: Session | null) => {
    setPermissionsLoading(true)
    if (!activeSession?.user?.id) {
      setPermissions([])
      clearCachedPermissions()
      setPermissionsLoading(false)
      return
    }

    try {
      const cached = readCachedPermissions(activeSession.user.id)
      if (cached) {
        setPermissions(cached)
        setPermissionsLoading(false)
        lastUserIdRef.current = activeSession.user.id
        return
      }
      const nextPermissions = await fetchPermissionsWithTimeout(activeSession.user.id, 2000)
      setPermissions(nextPermissions)
      writeCachedPermissions(activeSession.user.id, nextPermissions)
      lastUserIdRef.current = activeSession.user.id
    } catch (error) {
      console.error('Failed to refresh permissions', error)
      setPermissions([])
    } finally {
      setPermissionsLoading(false)
    }
  }, [])

  const syncPermissionsOnLogin = useCallback(
    async (nextSession: Session | null) => {
      if (!nextSession?.user?.id) {
        lastUserIdRef.current = null
        setPermissions([])
        setPermissionsLoading(false)
        clearCachedPermissions()
        return
      }

      if (lastUserIdRef.current === nextSession.user.id && permissions.length > 0) {
        return
      }

      await refreshPermissions(nextSession)
    },
    [permissions.length, refreshPermissions],
  )

  useEffect(() => {
    let isMounted = true
    const loadingTimeout = setTimeout(() => {
      if (!isMounted) return
      setLoading(false)
    }, 2500)

    const bootstrap = async () => {
      try {
        const { data } = await supabase.auth.getSession()
        const currentSession = data.session ?? null
        if (!isMounted) return
        setSession(currentSession)
        await syncPermissionsOnLogin(currentSession)
      } catch (error) {
        console.error('Failed to bootstrap auth session', error)
        if (!isMounted) return
        setSession(null)
        setPermissions([])
        setPermissionsLoading(false)
      } finally {
        if (!isMounted) return
        clearTimeout(loadingTimeout)
        setLoading(false)
      }
    }

    bootstrap()

    const { data: subscription } = supabase.auth.onAuthStateChange(
      async (_event, nextSession) => {
        try {
          setSession(nextSession)
          await syncPermissionsOnLogin(nextSession)
        } catch (error) {
          console.error('Failed to refresh auth session', error)
          setPermissions([])
          setPermissionsLoading(false)
        } finally {
          clearTimeout(loadingTimeout)
          setLoading(false)
        }
      },
    )

    return () => {
      isMounted = false
      clearTimeout(loadingTimeout)
      subscription.subscription.unsubscribe()
    }
  }, [refreshPermissions])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }, [])

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ session, permissions, permissionsLoading, loading, signIn, signOut }),
    [session, permissions, permissionsLoading, loading, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
