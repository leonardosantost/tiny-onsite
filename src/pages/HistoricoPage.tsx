import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import LoadingOverlay from '../components/LoadingOverlay'
import { tinyAccountId, supabaseUrl } from '../config'
import { tinyFetch } from '../lib/tinyFetch'
import { extractTinyProductEntries, getTinyProductSku, getTinyProductThumb } from '../lib/tinyProducts'
import { formatCutoffDisplay, formatOrderDate } from '../utils/date'
import { getOrderStatus, getCutoff, isPaidAndAuthorized, sortOrders } from '../utils/orders'

type OrderRow = {
  id: string
  orderIdRaw: string
  shipmentId: string
  status: string
  cutoff: string
  channel: string
  items: string
  itemsCount: number
  qty: number
  cutoffTs: number
  orderDate: string
}

export default function HistoricoPage() {
  const [rows, setRows] = useState<OrderRow[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
        const [ordersResponse, listsResponse, inventoryResponse, manifestsResponse] = await Promise.all([
          tinyFetch(`${supabaseUrl}/functions/v1/tiny-orders?account_id=${tinyAccountId}&details=1`, {
            signal: controller.signal,
          }),
          tinyFetch(`${supabaseUrl}/functions/v1/tiny-picklists?include_items=1`, {
            signal: controller.signal,
          }),
          tinyFetch(`${supabaseUrl}/functions/v1/tiny-inventory?account_id=${tinyAccountId}&details=1`, {
            signal: controller.signal,
          }),
          tinyFetch(`${supabaseUrl}/functions/v1/tiny-manifests?include_items=1`, {
            signal: controller.signal,
          }),
        ])
        if (!ordersResponse.ok) {
          throw new Error(`Erro ao carregar pedidos: ${ordersResponse.status}`)
        }
        if (!listsResponse.ok) {
          throw new Error(`Erro ao carregar listas: ${listsResponse.status}`)
        }
        if (!inventoryResponse.ok) {
          throw new Error(`Erro ao carregar inventário: ${inventoryResponse.status}`)
        }
        if (!manifestsResponse.ok) {
          throw new Error(`Erro ao carregar manifestos: ${manifestsResponse.status}`)
        }
        const data = await ordersResponse.json()
        const listsData = await listsResponse.json()
        const inventoryData = await inventoryResponse.json()
        const manifestsData = await manifestsResponse.json()
        const listArray = Array.isArray(listsData) ? listsData : []

        const collectingOrders = new Set<string>()
        const packedOrders = new Set<string>()
        for (const list of listArray) {
          if (!Array.isArray(list.pick_list_items)) {
            continue
          }
          for (const item of list.pick_list_items) {
            const orderId = String(item.order_id ?? '')
            if (!orderId) continue
            if (list.status === 'active') {
              collectingOrders.add(orderId)
            }
            if (item.packed_at) {
              packedOrders.add(orderId)
            }
          }
        }

        if (!Array.isArray(data?.results)) {
          throw new Error('Resposta inesperada da API de pedidos.')
        }

        const inventoryItems = extractTinyProductEntries(inventoryData)
        const thumbByItemId = new Map<string, string>()
        const thumbBySku = new Map<string, string>()
        for (const item of inventoryItems) {
          const thumb = getTinyProductThumb(item)
          if (!thumb) continue
          if (item?.id) {
            thumbByItemId.set(String(item.id), thumb)
          }
          const sku = getTinyProductSku(item)
          if (sku) {
            thumbBySku.set(String(sku), thumb)
          }
        }

        const manifestedOrders = new Set<string>()
        const manifestArray = Array.isArray(manifestsData) ? manifestsData : []
        for (const manifest of manifestArray) {
          if (!Array.isArray(manifest.manifest_items)) continue
          for (const item of manifest.manifest_items) {
            const packId = item?.pack_id ? String(item.pack_id) : ''
            if (packId) manifestedOrders.add(packId)
          }
        }

        const mapped = data.results
          .filter(isPaidAndAuthorized)
          .map((order: any) => {
            const items = Array.isArray(order.order_items) ? order.order_items : []
            const totalQty = items.reduce((acc: number, item: any) => acc + (item.quantity ?? 0), 0)
            const firstItem = items[0]?.item ?? null
            const itemId = firstItem?.id ? String(firstItem.id) : ''
            const sku = firstItem?.seller_sku ? String(firstItem.seller_sku) : ''
            const thumb = itemId ? thumbByItemId.get(itemId) : sku ? thumbBySku.get(sku) : null
            const orderId = String(order.pack_id ?? order.id ?? '')
            const legacyOrderId = String(order.id ?? '')
            const status = getOrderStatus(order, {
              collecting: collectingOrders.has(orderId) || collectingOrders.has(legacyOrderId),
              packed: packedOrders.has(orderId) || packedOrders.has(legacyOrderId),
              manifested: manifestedOrders.has(orderId) || manifestedOrders.has(legacyOrderId),
            })
            const cutoff = getCutoff(order)
            const cutoffTs = cutoff ? new Date(cutoff).getTime() : Number.NaN

            return {
              id: String(order.pack_id ?? order.id ?? '-'),
              orderIdRaw: String(order.id ?? ''),
              shipmentId: order?.shipping_details?.id
                ? String(order.shipping_details.id)
                : order.shipping?.id
                  ? String(order.shipping.id)
                  : '-',
              status,
              cutoff,
              channel: 'Tiny ERP',
              items: thumb ?? '',
              itemsCount: items.length,
              qty: totalQty,
              cutoffTs,
              orderDate: order?.date_created ?? '',
            }
          })

        setRows(sortOrders(mapped))
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          setError(err instanceof Error ? err.message : 'Falha ao carregar pedidos.')
        }
      } finally {
        setLoading(false)
      }
    }

    load()

    return () => controller.abort()
  }, [])

  const normalizedSearch = searchTerm.trim().toLowerCase()
  const filteredRows = normalizedSearch
    ? rows.filter((order) => {
        const haystack = [order.id, order.orderIdRaw, order.shipmentId].join(' ').toLowerCase()
        return haystack.includes(normalizedSearch)
      })
    : rows

  return (
    <>
      <section className="px-4 pt-6 sm:px-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Histórico de pedidos</h1>
          </div>
          <div />
        </div>
        {loading ? <LoadingOverlay label="Carregando pedidos..." /> : null}
        {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
      </section>

      <section className="px-4 pt-6 pb-10 sm:px-8">
        <div className="rounded border border-black/10 bg-[var(--surface)] p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <input
                className="w-full rounded border border-black/10 bg-white px-3 py-2 text-sm lg:w-[280px]"
                placeholder="Envio, rastreio, ID do pedido"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <div className="min-w-[720px]">
              <div className="grid grid-cols-[1.7fr_1fr_1fr_1fr_1.2fr] gap-4 border-b border-black/10 pb-2 text-xs font-semibold text-[var(--ink-muted)]">
                <span>ID do pedido</span>
                <span>Status</span>
                <span>Data de corte</span>
                <span>Canal</span>
                <span>Conteúdo</span>
              </div>
              <div className="mt-2 flex flex-col gap-2">
                {loading ? (
                  <div className="border-b border-black/10 px-1 py-6 text-sm text-[var(--ink-muted)]">
                    Carregando pedidos...
                  </div>
                ) : null}
                {filteredRows.map((order) => (
                  <div
                    key={order.id}
                    className="grid grid-cols-[1.7fr_1fr_1fr_1fr_1.2fr] gap-4 border-b border-black/10 px-1 py-3 text-sm"
                  >
                    <div>
                      <Link className="font-semibold text-blue-600" to={`/pedidos/historico/${order.orderIdRaw}`}>
                        {order.id}
                      </Link>
                      <p className="mt-1 text-xs text-[var(--ink-muted)]">ID da remessa: {order.shipmentId}</p>
                      <p className="mt-1 text-xs text-[var(--ink-muted)]">{formatOrderDate(order.orderDate)}</p>
                    </div>
                    <div className={order.status === 'Pronto para coletar' ? 'font-semibold' : ''}>{order.status}</div>
                    <div className="text-sm">
                      {order.status === 'Enviado' ? (
                        <div>-</div>
                      ) : (
                        <>
                          <div className="font-semibold">{formatCutoffDisplay(order.cutoff).relative}</div>
                          <div>{formatCutoffDisplay(order.cutoff).label}</div>
                        </>
                      )}
                    </div>
                    <div className="text-sm">{order.channel}</div>
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded border border-black/10 bg-white text-[10px] text-[var(--ink-muted)]">
                        {order.items ? (
                          <img src={order.items} alt="Produto" className="h-full w-full object-contain" />
                        ) : (
                          'Img'
                        )}
                      </div>
                      <span className="text-xs text-[var(--ink-muted)]">x{order.itemsCount}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
