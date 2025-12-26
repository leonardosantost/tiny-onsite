import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import LoadingOverlay from '../components/LoadingOverlay'
import { mlAccountId, supabaseUrl } from '../config'
import { formatCutoffDisplay, formatDateTime } from '../utils/date'
import { isLabelPrinted, isPaidAndAuthorized, isShipped } from '../utils/orders'

export default function ColetarPage() {
  const [tab, setTab] = useState('Criar')
  const [groups, setGroups] = useState<
    {
      key: string
      cutoffAt: string
      label: string
      relative: string
      isToday: boolean
      isFuture: boolean
      orders: any[]
    }[]
  >([])
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
  const [lists, setLists] = useState<any[]>([])
  const [searchId, setSearchId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [debugInfo, setDebugInfo] = useState<{
    total: number
    included: number
    unpaid: number
    shipped: number
    labelPrinted: number
    assigned: number
    invalidCutoff: number
  } | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!supabaseUrl) {
      setError('VITE_SUPABASE_URL não configurado.')
      return
    }

    const parseCutoffDate = (value?: string) => {
      if (!value) return null
      const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      if (dateOnlyMatch) {
        const [, year, month, day] = dateOnlyMatch
        return new Date(Number(year), Number(month) - 1, Number(day))
      }
      return formatDateTime(value)
    }

    const getDateKeyFromValue = (value?: string) => {
      if (!value) return null
      const match = value.match(/(\d{4})-(\d{2})-(\d{2})/)
      if (!match) return null
      const [, year, month, day] = match
      return Number(year) * 10000 + Number(month) * 100 + Number(day)
    }

    const controller = new AbortController()

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const debugEnabled =
          typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1'
        const now = new Date()
        const todayKey = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate()

        const [ordersResponse, listsResponse] = await Promise.all([
          fetch(`${supabaseUrl}/functions/v1/ml-orders?account_id=${mlAccountId}&details=1`, {
            signal: controller.signal,
          }),
          fetch(`${supabaseUrl}/functions/v1/ml-picklists?include_items=1`, { signal: controller.signal }),
        ])

        if (!ordersResponse.ok) {
          throw new Error(`Erro ao carregar pedidos: ${ordersResponse.status}`)
        }
        if (!listsResponse.ok) {
          throw new Error(`Erro ao carregar listas: ${listsResponse.status}`)
        }

        const ordersData = await ordersResponse.json()
        const listsData = await listsResponse.json()

        const assignedOrders = new Set<string>()
        if (Array.isArray(listsData)) {
          for (const list of listsData) {
            if (Array.isArray(list.orders)) {
              list.orders.forEach((orderId: string) => assignedOrders.add(String(orderId)))
            }
          }
        }

        const orders = Array.isArray(ordersData?.results) ? ordersData.results : []
        if (debugEnabled) {
          const debugCounts = {
            total: orders.length,
            included: 0,
            unpaid: 0,
            shipped: 0,
            labelPrinted: 0,
            assigned: 0,
            invalidCutoff: 0,
          }
          for (const order of orders) {
            const reasons: string[] = []
            if (!isPaidAndAuthorized(order)) reasons.push('unpaid')
            if (isShipped(order)) reasons.push('shipped')
            if (isLabelPrinted(order)) reasons.push('labelPrinted')
            if (assignedOrders.has(String(order.pack_id ?? order.id ?? ''))) reasons.push('assigned')
            const cutoffRaw = order?.shipping_sla?.expected_date
            if (!parseCutoffDate(cutoffRaw)) reasons.push('invalidCutoff')
            if (reasons.length === 0) {
              debugCounts.included += 1
            } else {
              for (const reason of reasons) {
                if (reason === 'unpaid') debugCounts.unpaid += 1
                if (reason === 'shipped') debugCounts.shipped += 1
                if (reason === 'labelPrinted') debugCounts.labelPrinted += 1
                if (reason === 'assigned') debugCounts.assigned += 1
                if (reason === 'invalidCutoff') debugCounts.invalidCutoff += 1
              }
            }
          }
          setDebugInfo(debugCounts)
        } else {
          setDebugInfo(null)
        }

        const usable = orders
          .filter(isPaidAndAuthorized)
          .filter((order: any) => !isShipped(order))
          .filter((order: any) => !assignedOrders.has(String(order.pack_id ?? order.id ?? '')))

        const grouped = new Map<
          string,
          { cutoffAt: string; label: string; relative: string; isToday: boolean; isFuture: boolean; orders: any[] }
        >()

        for (const order of usable) {
          const cutoffRaw = order?.shipping_sla?.expected_date
          const cutoffDate = parseCutoffDate(cutoffRaw)
          if (!cutoffDate) {
            continue
          }
          const cutoffKey = getDateKeyFromValue(cutoffRaw)
          if (cutoffKey) {
            const year = Math.floor(cutoffKey / 10000)
            const month = Math.floor((cutoffKey % 10000) / 100)
            const day = cutoffKey % 100
            cutoffDate.setFullYear(year, month - 1, day)
          }
          cutoffDate.setHours(11, 30, 0, 0)
          const normalizedCutoffKey =
            cutoffKey ??
            cutoffDate.getFullYear() * 10000 + (cutoffDate.getMonth() + 1) * 100 + cutoffDate.getDate()
          const isToday = normalizedCutoffKey === todayKey
          const isFuture = normalizedCutoffKey > todayKey
          const cutoffAt = cutoffDate.toISOString()
          const display = formatCutoffDisplay(cutoffAt)
          const key = cutoffAt
          const existing = grouped.get(key)
          if (existing) {
            existing.orders.push(order)
          } else {
            grouped.set(key, {
              cutoffAt,
              label: display.label,
              relative: display.relative,
              isToday,
              isFuture,
              orders: [order],
            })
          }
        }

        const sortedGroups = Array.from(grouped.entries())
          .map(([key, value]) => ({ key, ...value }))
          .sort((a, b) => new Date(a.cutoffAt).getTime() - new Date(b.cutoffAt).getTime())

        setGroups(sortedGroups)
        const firstSelectable = sortedGroups.find((group) => !group.isFuture)
        setSelectedGroup(firstSelectable?.key ?? null)
        setLists(Array.isArray(listsData) ? listsData : [])
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          setError(err instanceof Error ? err.message : 'Falha ao carregar listas.')
        }
      } finally {
        setLoading(false)
      }
    }

    load()

    return () => controller.abort()
  }, [])

  const activeGroup = groups.find((group) => group.key === selectedGroup)
  const selectedCount = activeGroup ? 1 : 0
  const activeLists = lists.filter(
    (list) => list.status === 'active' && !list?.pick_list_items?.every((item: any) => item?.packed_at),
  )
  const completedLists = lists.filter(
    (list) => list.status === 'completed' || list?.pick_list_items?.every((item: any) => item?.packed_at),
  )

  const handleActivate = async () => {
    if (!activeGroup || !supabaseUrl) return

    const items = activeGroup.orders.flatMap((order: any) => {
      const orderItems = Array.isArray(order.order_items) ? order.order_items : []
      const shipmentId = order?.shipping_details?.id ?? order?.shipping?.id ?? null
      const orderId = String(order.pack_id ?? order.id ?? '')
      return orderItems.map((item: any) => ({
        order_id: orderId,
        item_id: item?.item?.id ?? null,
        title: item?.item?.title ?? null,
        sku: item?.item?.seller_sku ?? item?.item?.id ?? null,
        quantity: item?.quantity ?? 0,
        shipment_id: shipmentId ? String(shipmentId) : null,
      }))
    })

    const payload = {
      cutoff_at: activeGroup.cutoffAt,
      orders: activeGroup.orders.map((order: any) => String(order.pack_id ?? order.id ?? '')),
      items,
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/ml-picklists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      setError(`Falha ao criar lista: ${response.status}`)
      return
    }

    const data = await response.json()
    navigate(`/pedidos/coletar/${data.list_code}`)
  }

  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = searchId.trim()
    if (trimmed) {
      navigate(`/pedidos/coletar/${trimmed}`)
    }
  }

  return (
    <>
      {loading ? <LoadingOverlay label="Carregando listas..." /> : null}
      <section className="px-4 pt-6 sm:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Selecionar</h1>
          </div>
        </div>
        <form className="mt-4 flex flex-wrap items-center gap-3" onSubmit={handleSearch}>
          <input
            className="w-full rounded border border-black/10 bg-white px-4 py-2 text-sm sm:w-[280px]"
            placeholder="Buscar ID da lista de coleta"
            value={searchId}
            onChange={(event) => setSearchId(event.target.value)}
          />
          <button className="rounded border border-black/10 bg-white px-4 py-2 text-sm" type="submit">
            Buscar
          </button>
        </form>
        {loading ? <div className="mt-3 text-sm text-[var(--ink-muted)]">Carregando...</div> : null}
        {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
        {debugInfo ? (
          <div className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <p className="font-semibold">Debug filtros (use ?debug=1)</p>
            <p>Total: {debugInfo.total}</p>
            <p>Incluídos: {debugInfo.included}</p>
            <p>Não pagos/autorizados: {debugInfo.unpaid}</p>
            <p>Enviados: {debugInfo.shipped}</p>
            <p>Etiqueta impressa: {debugInfo.labelPrinted}</p>
            <p>Já em lista: {debugInfo.assigned}</p>
            <p>Data de corte inválida: {debugInfo.invalidCutoff}</p>
          </div>
        ) : null}
      </section>

      <section className="px-4 pt-4 pb-10 sm:px-8">
        <div className="border-b border-black/10">
          <div className="flex flex-wrap items-center gap-6 text-sm">
            {['Criar', 'Listas de coleta ativas', 'Concluído'].map((item) => (
              <button
                key={item}
                className={`border-b-2 px-2 py-3 ${
                  item === tab ? 'border-blue-700 text-blue-700' : 'border-transparent text-[var(--ink-muted)]'
                }`}
                onClick={() => setTab(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {tab === 'Listas de coleta ativas' ? (
          <div className="mt-4">
            {loading ? (
              <div className="rounded border border-black/10 bg-white px-4 py-3 text-sm text-[var(--ink-muted)]">
                Carregando listas...
              </div>
            ) : null}
            {activeLists.length === 0 && !loading ? (
              <div className="rounded border border-black/10 bg-white px-4 py-3 text-sm text-[var(--ink-muted)]">
                Nenhuma lista ativa no momento.
              </div>
            ) : null}
            <div className="mt-3 grid gap-3">
              {activeLists.map((list) => (
                <button
                  key={list.list_code}
                  className="flex flex-col rounded border border-black/10 bg-white px-4 py-3 text-left text-sm hover:bg-black/5"
                  onClick={() => navigate(`/pedidos/coletar/${list.list_code}`)}
                >
                  <span className="font-semibold">Lista {list.list_code}</span>
                  <span className="text-[var(--ink-muted)]">
                    Corte: {list.cutoff_at ? formatCutoffDisplay(list.cutoff_at).label : '-'}
                  </span>
                  <span className="text-[var(--ink-muted)]">
                    Pedidos: {Array.isArray(list.orders) ? list.orders.length : 0}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : tab === 'Concluído' ? (
          <div className="mt-4">
            {loading ? (
              <div className="rounded border border-black/10 bg-white px-4 py-3 text-sm text-[var(--ink-muted)]">
                Carregando listas...
              </div>
            ) : null}
            {completedLists.length === 0 && !loading ? (
              <div className="rounded border border-black/10 bg-white px-4 py-3 text-sm text-[var(--ink-muted)]">
                Nenhuma lista concluída.
              </div>
            ) : null}
            <div className="mt-3 grid gap-3">
              {completedLists.map((list) => (
                <button
                  key={list.list_code}
                  className="flex flex-col rounded border border-black/10 bg-white px-4 py-3 text-left text-sm hover:bg-black/5"
                  onClick={() => navigate(`/pedidos/coletar/${list.list_code}`)}
                >
                  <span className="font-semibold">Lista {list.list_code}</span>
                  <span className="text-[var(--ink-muted)]">
                    Corte: {list.cutoff_at ? formatCutoffDisplay(list.cutoff_at).label : '-'}
                  </span>
                  <span className="text-[var(--ink-muted)]">
                    Pedidos: {Array.isArray(list.orders) ? list.orders.length : 0}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap gap-4">
            {loading ? (
              <div className="rounded border border-black/10 bg-white px-4 py-3 text-sm text-[var(--ink-muted)]">
                Carregando listas...
              </div>
            ) : null}
            {groups.map((group) => (
              <button
                key={group.key}
                className={`rounded border px-4 py-3 text-left text-sm transition ${
                  selectedGroup === group.key
                    ? 'border-blue-700 bg-white shadow-sm'
                    : 'border-black/10 bg-white'
                } hover:bg-black/5`}
                onClick={() => setSelectedGroup(group.key)}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{group.label}</p>
                  {group.isToday ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                      PARA HOJE
                    </span>
                  ) : group.isFuture ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                      FUTURO
                    </span>
                  ) : null}
                </div>
                <p className="text-[var(--ink-muted)]">{group.orders.length} pedidos para coletar</p>
              </button>
            ))}
          </div>
        )}

        {tab === 'Criar' ? (
          <div className="mt-6 text-sm">
            {activeGroup ? (
              <>
                <p className="flex flex-wrap items-center gap-2">
                  1 horário de retirada da transportadora para {activeGroup.label}
                  {activeGroup.isToday ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                      PARA HOJE
                    </span>
                  ) : null}
                </p>
                <p className="mt-2 font-semibold">11:30 AM</p>
                <p className="text-[var(--ink-muted)]">{activeGroup.orders.length} pedidos para coletar</p>
              </>
            ) : (
              <p className="text-[var(--ink-muted)]">Nenhum pedido disponível para coleta.</p>
            )}
          </div>
        ) : null}

        {tab === 'Criar' ? (
          <div className="mt-4 border-t border-black/10 pt-4 text-sm">
            {activeGroup
              ? `${activeGroup.orders.length} pedidos aguardando criação da lista de coleta`
              : 'Sem pedidos pendentes.'}
          </div>
        ) : null}

        {tab === 'Criar' ? (
          <div className="mt-4 rounded border border-black/10 bg-[var(--surface)] p-4">
            <div className="flex items-center justify-between border-b border-black/10 pb-2 text-xs font-semibold text-[var(--ink-muted)]">
              <div className="grid flex-1 grid-cols-[0.4fr_0.8fr_1fr_1.6fr_1fr] gap-4">
                <span> </span>
                <span>Prioridade</span>
                <span>Pedidos</span>
                <span>Data/Horário de corte</span>
                <span>Canal</span>
              </div>
              <button
                className={`rounded px-4 py-2 text-sm ${
                  selectedCount ? 'bg-blue-700 text-white' : 'bg-gray-200 text-gray-500'
                }`}
                onClick={handleActivate}
              >
                Ativar {selectedCount} selecionados
              </button>
            </div>
            {activeGroup ? (
              <div className="mt-2 grid grid-cols-[0.4fr_0.8fr_1fr_1.6fr_1fr_1.4fr] gap-4 border-b border-black/10 py-3 text-sm">
                <div className="flex items-center">
                  <input type="checkbox" className="h-4 w-4" checked readOnly />
                </div>
                <div>1</div>
                <div>{activeGroup.orders.length}</div>
                <div>{activeGroup.label}</div>
                <div>Mercado Livre</div>
                <div className="flex items-center justify-end">
                  <button
                    className={`rounded px-4 py-2 ${
                      selectedCount ? 'bg-blue-700 text-white' : 'bg-gray-200 text-gray-500'
                    }`}
                    onClick={handleActivate}
                  >
                    Ativar lista de coleta
                  </button>
                </div>
              </div>
            ) : null}
            <div className="mt-3 text-sm">Total: {activeGroup ? activeGroup.orders.length : 0}</div>
          </div>
        ) : null}
      </section>
    </>
  )
}
