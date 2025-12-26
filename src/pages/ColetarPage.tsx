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
  const navigate = useNavigate()

  useEffect(() => {
    if (!supabaseUrl) {
      setError('VITE_SUPABASE_URL não configurado.')
      return
    }

    const controller = new AbortController()

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const now = new Date()
        const startOfToday = new Date(now)
        startOfToday.setHours(0, 0, 0, 0)
        const endOfToday = new Date(now)
        endOfToday.setHours(23, 59, 59, 999)

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

        const usable = orders
          .filter(isPaidAndAuthorized)
          .filter((order: any) => !isShipped(order))
          .filter((order: any) => !isLabelPrinted(order))
          .filter((order: any) => !assignedOrders.has(String(order.pack_id ?? order.id ?? '')))

        const grouped = new Map<
          string,
          { cutoffAt: string; label: string; relative: string; isToday: boolean; isFuture: boolean; orders: any[] }
        >()

        for (const order of usable) {
          const cutoffRaw = order?.shipping_sla?.expected_date
          const cutoffDate = formatDateTime(cutoffRaw)
          if (!cutoffDate) {
            continue
          }
          cutoffDate.setHours(11, 30, 0, 0)
          const isToday = cutoffDate >= startOfToday && cutoffDate <= endOfToday
          const isFuture = cutoffDate > endOfToday
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
    if (!activeGroup || activeGroup.isFuture || !supabaseUrl) return

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
                disabled={group.isFuture}
                className={`rounded border px-4 py-3 text-left text-sm transition ${
                  selectedGroup === group.key
                    ? 'border-blue-700 bg-white shadow-sm'
                    : 'border-black/10 bg-white'
                } ${group.isFuture ? 'cursor-not-allowed opacity-50' : 'hover:bg-black/5'}`}
                onClick={() => setSelectedGroup(group.key)}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{group.label}</p>
                  {group.isToday ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                      PARA HOJE
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
                  selectedCount && activeGroup && !activeGroup.isFuture
                    ? 'bg-blue-700 text-white'
                    : 'bg-gray-200 text-gray-500'
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
                      selectedCount && !activeGroup.isFuture
                        ? 'bg-blue-700 text-white'
                        : 'bg-gray-200 text-gray-500'
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
