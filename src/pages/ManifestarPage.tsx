import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import LoadingOverlay from '../components/LoadingOverlay'
import { mlAccountId, supabaseUrl } from '../config'
import { formatCutoffDisplay, formatOrderDate } from '../utils/date'
import { getCutoff, isPaidAndAuthorized, isShipped } from '../utils/orders'

type ManifestGroup = {
  key: string
  carrier: string
  cutoff: string
  orders: any[]
}

export default function ManifestarPage() {
  const [tab, setTab] = useState('Manifestar')
  const [groups, setGroups] = useState<ManifestGroup[]>([])
  const [manifests, setManifests] = useState<any[]>([])
  const [reportStart, setReportStart] = useState('')
  const [reportEnd, setReportEnd] = useState('')
  const [loading, setLoading] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)
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
        const [ordersResponse, manifestsResponse, listsResponse] = await Promise.all([
          fetch(`${supabaseUrl}/functions/v1/ml-orders?account_id=${mlAccountId}&details=1`, {
            signal: controller.signal,
          }),
          fetch(`${supabaseUrl}/functions/v1/ml-manifests?include_items=1`, {
            signal: controller.signal,
          }),
          fetch(`${supabaseUrl}/functions/v1/ml-picklists?include_items=1`, {
            signal: controller.signal,
          }),
        ])
        if (!ordersResponse.ok) {
          throw new Error(`Erro ao carregar pedidos: ${ordersResponse.status}`)
        }
        if (!manifestsResponse.ok) {
          throw new Error(`Erro ao carregar manifestos: ${manifestsResponse.status}`)
        }
        if (!listsResponse.ok) {
          throw new Error(`Erro ao carregar listas: ${listsResponse.status}`)
        }

        const ordersData = await ordersResponse.json()
        const manifestsData = await manifestsResponse.json()
        const listsData = await listsResponse.json()
        const manifestArray = Array.isArray(manifestsData) ? manifestsData : []
        const listArray = Array.isArray(listsData) ? listsData : []

        const manifestedOrders = new Set<string>()
        for (const manifest of manifestArray) {
          if (!Array.isArray(manifest.manifest_items)) continue
          for (const item of manifest.manifest_items) {
            const packId = item?.pack_id ? String(item.pack_id) : ''
            if (packId) manifestedOrders.add(packId)
          }
        }

        const packedOrders = new Set<string>()
        for (const list of listArray) {
          if (!Array.isArray(list.pick_list_items)) continue
          for (const item of list.pick_list_items) {
            const packId = item?.order_id ? String(item.order_id) : ''
            if (packId && item?.packed_at) {
              packedOrders.add(packId)
            }
          }
        }

        const orders = Array.isArray(ordersData?.results) ? ordersData.results : []
        const usable = orders
          .filter(isPaidAndAuthorized)
          .filter((order: any) => !isShipped(order))
          .filter((order: any) => !manifestedOrders.has(String(order.pack_id ?? order.id ?? '')))
          .filter((order: any) => packedOrders.has(String(order.pack_id ?? order.id ?? '')))

        const grouped = new Map<string, ManifestGroup>()
        for (const order of usable) {
          const logisticType =
            order?.shipping_details?.logistic_type || order?.shipping?.logistic_type || 'outro'
          const carrier = logisticType === 'xd_drop_off' ? 'Levar na Agência' : logisticType
          const cutoff = getCutoff(order)
          const key = logisticType
          const existing = grouped.get(key)
          if (existing) {
            existing.orders.push(order)
            if (cutoff && cutoff < existing.cutoff) {
              existing.cutoff = cutoff
            }
          } else {
            grouped.set(key, { key, carrier, cutoff: cutoff || '', orders: [order] })
          }
        }

        setGroups(Array.from(grouped.values()))
        setManifests(manifestArray)
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          setError(err instanceof Error ? err.message : 'Falha ao carregar manifestos.')
        }
      } finally {
        setLoading(false)
        setHasLoaded(true)
      }
    }

    load()

    return () => controller.abort()
  }, [])

  const filteredManifests = useMemo(() => {
    const startDate = reportStart ? new Date(`${reportStart}T00:00:00`) : null
    const endDate = reportEnd ? new Date(`${reportEnd}T23:59:59`) : null

    return manifests
      .filter((manifest) => {
        if (!manifest?.created_at) {
          return !startDate && !endDate
        }
        const created = new Date(manifest.created_at)
        if (Number.isNaN(created.getTime())) {
          return !startDate && !endDate
        }
        if (startDate && created < startDate) return false
        if (endDate && created > endDate) return false
        return true
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [manifests, reportStart, reportEnd])

  const handleManifest = async (group: ManifestGroup) => {
    if (!supabaseUrl) return
    const payload = {
      logistic_type: group.key,
      carrier_name: group.carrier,
      cutoff_at: group.cutoff || null,
      orders: group.orders.map((order) => ({
        pack_id: String(order.pack_id ?? order.id ?? ''),
        order_id: String(order.id ?? ''),
        buyer_name: order?.buyer?.nickname ?? '-',
        items: (order?.order_items ?? []).map((item: any) => {
          const attrs = item?.item?.variation_attributes ?? []
          const color = attrs.find((attr: any) => attr?.id === 'COLOR')?.value_name ?? ''
          const fabric = attrs.find((attr: any) => attr?.id === 'FABRIC_DESIGN')?.value_name ?? ''
          return {
            item_id: item?.item?.id ?? '',
            title: item?.item?.title ?? '',
            sku: item?.item?.seller_sku ?? item?.item?.id ?? '',
            quantity: item?.quantity ?? 0,
            color,
            fabric_design: fabric,
          }
        }),
      })),
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/ml-manifests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      setError(`Falha ao manifestar: ${response.status}`)
      return
    }

    const data = await response.json()
    navigate(`/pedidos/manifestar/${data.id}`)
  }

  return (
    <>
      {loading ? <LoadingOverlay label="Carregando manifestos..." /> : null}
      <section className="px-4 pt-6 sm:px-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Manifestar</h1>
          </div>
        </div>
        <div className="mt-4 border-b border-black/10">
          <div className="flex flex-wrap items-center gap-6 text-sm">
            {['Manifestar', 'Relatórios de Entrega'].map((item) => (
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
        {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
      </section>

      <section className="px-4 pt-6 pb-10 sm:px-8">
        {tab === 'Manifestar' ? (
          <div className="rounded border border-black/10 bg-[var(--surface)] p-4">
            <div className="grid grid-cols-[1.4fr_1.4fr_0.8fr_0.8fr_0.6fr] gap-4 border-b border-black/10 pb-2 text-xs font-semibold text-[var(--ink-muted)]">
              <span>Transportadora</span>
              <span>Data/Horário de corte</span>
              <span>Pedidos</span>
              <span>Ações</span>
              <span>Entregue</span>
            </div>
            <div className="mt-2 flex flex-col gap-2">
              {!hasLoaded || loading ? (
                <div className="border-b border-black/10 px-1 py-6 text-sm text-[var(--ink-muted)]">
                  Carregando pedidos...
                </div>
              ) : null}
              {groups.length === 0 && hasLoaded && !loading ? (
                <div className="border-b border-black/10 px-1 py-6 text-sm text-[var(--ink-muted)]">
                  Nenhum pedido disponível para manifestar.
                </div>
              ) : null}
              {groups.map((group) => {
                const deliveredCount = group.orders.filter(
                  (order) => order?.shipping_details?.status === 'delivered',
                ).length
                const deliveredLabel =
                  deliveredCount > 0 && deliveredCount === group.orders.length ? 'Sim' : 'Não'
                const cutoffLabel = group.cutoff ? formatCutoffDisplay(group.cutoff).label : '-'
                return (
                  <div
                    key={group.key}
                    className="grid grid-cols-[1.4fr_1.4fr_0.8fr_0.8fr_0.6fr] items-center gap-4 border-b border-black/10 px-1 py-3 text-sm"
                  >
                    <div>{group.carrier}</div>
                    <div>{cutoffLabel}</div>
                    <div>{group.orders.length}</div>
                    <div>
                      <button
                        className="rounded border border-blue-700 px-3 py-1 text-sm text-blue-700"
                        onClick={() => handleManifest(group)}
                      >
                        Manifestar
                      </button>
                    </div>
                    <div>{deliveredLabel}</div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="rounded border border-black/10 bg-[var(--surface)] p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="text-xs font-semibold text-[var(--ink-muted)]">De</label>
                <input
                  type="date"
                  className="mt-1 block rounded border border-black/10 bg-white px-3 py-2 text-sm"
                  value={reportStart}
                  onChange={(event) => setReportStart(event.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[var(--ink-muted)]">Até</label>
                <input
                  type="date"
                  className="mt-1 block rounded border border-black/10 bg-white px-3 py-2 text-sm"
                  value={reportEnd}
                  onChange={(event) => setReportEnd(event.target.value)}
                />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-[1.2fr_1.2fr_0.8fr_0.8fr_0.8fr] gap-4 border-b border-black/10 pb-2 text-xs font-semibold text-[var(--ink-muted)]">
              <span>Data</span>
              <span>Transportadora</span>
              <span>Pedidos</span>
              <span>Status</span>
              <span>Ações</span>
            </div>
            <div className="mt-2 flex flex-col gap-2">
              {!hasLoaded || loading ? (
                <div className="border-b border-black/10 px-1 py-6 text-sm text-[var(--ink-muted)]">
                  Carregando manifestos...
                </div>
              ) : null}
              {filteredManifests.length === 0 && hasLoaded && !loading ? (
                <div className="border-b border-black/10 px-1 py-6 text-sm text-[var(--ink-muted)]">
                  Nenhum manifesto encontrado.
                </div>
              ) : null}
              {filteredManifests.map((manifest) => {
                const itemCount = Array.isArray(manifest.manifest_items) ? manifest.manifest_items.length : 0
                return (
                  <div
                    key={manifest.id}
                    className="grid grid-cols-[1.2fr_1.2fr_0.8fr_0.8fr_0.8fr] items-center gap-4 border-b border-black/10 px-1 py-3 text-sm"
                  >
                    <div>{formatOrderDate(manifest.created_at)}</div>
                    <div>{manifest.carrier_name ?? '-'}</div>
                    <div>{itemCount}</div>
                    <div>{manifest.status ?? '-'}</div>
                    <div>
                      <button
                        className="rounded border border-blue-700 px-3 py-1 text-sm text-blue-700"
                        onClick={() => navigate(`/pedidos/manifestar/${manifest.id}`)}
                      >
                        Ver detalhes
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </section>
    </>
  )
}
