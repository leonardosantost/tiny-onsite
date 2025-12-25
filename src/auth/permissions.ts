export type Permission =
  | 'pedidos'
  | 'pedidos_historico'
  | 'pedidos_coletar'
  | 'pedidos_embalar'
  | 'pedidos_manifestar'
  | 'inventario'
  | 'inventario_todo'
  | 'inventario_receber'
  | 'inventario_ajustar'
  | 'all'

const permissionValues: Permission[] = [
  'pedidos',
  'pedidos_historico',
  'pedidos_coletar',
  'pedidos_embalar',
  'pedidos_manifestar',
  'inventario',
  'inventario_todo',
  'inventario_receber',
  'inventario_ajustar',
  'all',
]

export const normalizePermission = (value: unknown): Permission | null => {
  if (typeof value !== 'string') return null
  const normalized = value.toLowerCase().replace(/[\s-]+/g, '_') as Permission
  return permissionValues.includes(normalized) ? normalized : null
}

export const normalizePermissionList = (value: unknown): Permission[] => {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizePermission(entry)).filter((entry): entry is Permission => Boolean(entry))
  }

  if (typeof value !== 'string') return []
  return value
    .split(',')
    .map((entry) => normalizePermission(entry.trim()))
    .filter((entry): entry is Permission => Boolean(entry))
}

const isPedidosPermission = (permission: Permission) => permission.startsWith('pedidos_')
const isInventarioPermission = (permission: Permission) => permission.startsWith('inventario_')

export const hasPermission = (permissions: Permission[], required?: Permission | Permission[]) => {
  if (!required) return true
  if (permissions.includes('all')) return true

  const requiredList = Array.isArray(required) ? required : [required]
  return requiredList.some((permission) => {
    if (permissions.includes(permission)) return true
    if (isPedidosPermission(permission) && permissions.includes('pedidos')) return true
    if (isInventarioPermission(permission) && permissions.includes('inventario')) return true
    return false
  })
}

const defaultRoutes: Array<{ path: string; permission: Permission }> = [
  { path: '/pedidos/historico', permission: 'pedidos_historico' },
  { path: '/pedidos/coletar', permission: 'pedidos_coletar' },
  { path: '/pedidos/embalar', permission: 'pedidos_embalar' },
  { path: '/pedidos/manifestar', permission: 'pedidos_manifestar' },
  { path: '/inventario/todo', permission: 'inventario_todo' },
  { path: '/inventario/receber', permission: 'inventario_receber' },
  { path: '/inventario/ajustar', permission: 'inventario_ajustar' },
]

export const getDefaultPath = (permissions: Permission[]) => {
  if (permissions.includes('all')) {
    return defaultRoutes[0]?.path ?? '/'
  }
  const match = defaultRoutes.find((route) => hasPermission(permissions, route.permission))
  return match?.path ?? '/'
}
