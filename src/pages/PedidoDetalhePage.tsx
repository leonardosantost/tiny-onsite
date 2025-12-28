import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import LoadingOverlay from '../components/LoadingOverlay'
import { tinyAccountId, supabaseUrl } from '../config'
import { tinyFetch } from '../lib/tinyFetch'
import { extractTinyProductEntries, getTinyProductSku, getTinyProductThumb } from '../lib/tinyProducts'
import { formatCutoffDisplay, formatOrderDate } from '../utils/date'
import { getCutoff, isShipped } from '../utils/orders'

export default function PedidoDetalhePage() {
  const { id } = useParams()
  const [order, setOrder] = useState<any | null>(null)
  const [lists, setLists] = useState<any[]>([])
  const [inventoryItems, setInventoryItems] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabaseUrl || !id) {
      setError('Pedido não encontrado.')
      return
    }

    const controller = new AbortController()

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await tinyFetch(
          `${supabaseUrl}/functions/v1/tiny-orders?account_id=${tinyAccountId}&details=1&order_id=${id}`,
          { signal: controller.signal },
        )
        if (!response.ok) {
          throw new Error(`Erro ao carregar pedido: ${response.status}`)
        }
        const data = await response.json()
        setOrder(data)

        try {
          const listsResponse = await tinyFetch(`${supabaseUrl}/functions/v1/tiny-picklists?include_items=1`, {
            signal: controller.signal,
          })
          if (listsResponse.ok) {
            const listsData = await listsResponse.json()
            setLists(Array.isArray(listsData) ? listsData : [])
          }
        } catch {
          setLists([])
        }

        try {
          const inventoryResponse = await tinyFetch(
            `${supabaseUrl}/functions/v1/tiny-inventory?account_id=${tinyAccountId}&details=1`,
            { signal: controller.signal },
          )
          if (inventoryResponse.ok) {
            const inventoryData = await inventoryResponse.json()
            setInventoryItems(extractTinyProductEntries(inventoryData))
          }
        } catch {
          setInventoryItems([])
        }
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          setError(err instanceof Error ? err.message : 'Falha ao carregar pedido.')
        }
      } finally {
        setLoading(false)
      }
    }

    load()

    return () => controller.abort()
  }, [id])

  const orderItems = Array.isArray(order?.order_items) ? order.order_items : []
  const shipmentId = order?.shipping_details?.id ?? order?.shipping?.id ?? '-'
  const cutoff = order ? formatCutoffDisplay(getCutoff(order)) : { relative: '-', label: '-' }
  const packId = order?.pack_id ?? order?.id ?? id ?? '-'

  const listAssignment = useMemo(() => {
    if (!order) return null
    const orderKey = String(order?.pack_id ?? order?.id ?? '')
    if (!orderKey) return null
    for (const list of lists) {
      if (!Array.isArray(list?.pick_list_items)) continue
      const matching = list.pick_list_items.filter(
        (item: any) => String(item?.order_id ?? '') === orderKey,
      )
      if (matching.length) {
        return { list, items: matching }
      }
    }
    return null
  }, [lists, order])

  const isCollecting = Boolean(listAssignment)
  const isPacked = listAssignment
    ? listAssignment.items.every((item: any) => Boolean(item?.packed_at))
    : false
  const isManifested = order ? isShipped(order) : false

  const thumbByItemId = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of inventoryItems) {
      const thumb = getTinyProductThumb(item)
      if (!thumb) continue
      if (item?.id) {
        map.set(String(item.id), thumb)
      }
      const sku = getTinyProductSku(item)
      if (sku) {
        map.set(String(sku), thumb)
      }
    }
    return map
  }, [inventoryItems])

  return (
    <>
      {loading ? <LoadingOverlay label="Carregando pedido..." /> : null}
      <section className="px-4 pt-6 sm:px-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">ID do pedido: {packId}</h1>
            <div className="mt-2 text-sm text-[var(--ink-muted)]">
              <Link className="text-blue-700" to="/pedidos/historico">
                Histórico de pedidos
              </Link>{' '}
              &gt; Detalhes dos pedidos
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <button
              className="rounded border border-blue-700 px-4 py-2 text-blue-700"
              onClick={() => window.print()}
            >
              Imprimir nota fiscal
            </button>
          </div>
        </div>
      </section>

      <section className="px-4 pt-6 sm:px-8">
        {loading ? <div className="text-sm text-[var(--ink-muted)]">Carregando pedido...</div> : null}
        {error ? <div className="text-sm text-red-600">{error}</div> : null}
      </section>

      {order ? (
        <>
          <section className="px-4 pt-8 sm:px-8">
            <div className="flex flex-col gap-6 text-sm sm:flex-row sm:items-start">
              {[
                {
                  title: 'Pedido criado',
                  detail: formatOrderDate(order.date_created),
                  sub: 'Pedido realizado',
                  done: true,
                },
                {
                  title: 'Coletar',
                  detail: isCollecting ? 'Lista de coleta atribuída' : '',
                  sub: isCollecting ? formatOrderDate(listAssignment?.list?.created_at) : '',
                  extra: isCollecting ? listAssignment?.list?.list_code : '',
                  done: isCollecting,
                },
                {
                  title: 'Embalar',
                  detail: isPacked ? 'Pacote completo' : '',
                  sub: '',
                  done: isPacked,
                },
                {
                  title: 'Manifestar',
                  detail: cutoff.label,
                  sub: 'Previsto',
                  done: isManifested,
                },
              ].map((step, index, array) => (
                <div key={step.title} className="flex flex-1 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    {step.done ? (
                      <div className="flex h-6 w-6 items-center justify-center rounded-full border border-blue-700 text-xs text-blue-700">
                        ✓
                      </div>
                    ) : (
                      <div className="flex h-6 w-6 items-center justify-center rounded-full border border-black/30 text-xs text-[var(--ink-muted)]">
                        •
                      </div>
                    )}
                    {index < array.length - 1 ? (
                      <div className="hidden h-px flex-1 bg-black/20 sm:block" />
                    ) : null}
                  </div>
                  <span className="font-semibold">{step.title}</span>
                  {step.sub ? <div className="text-[var(--ink-muted)]">{step.sub}</div> : null}
                  {step.detail ? <div className="text-[var(--ink-muted)]">{step.detail}</div> : null}
                  {'extra' in step && step.extra ? (
                    <div className="text-[var(--ink-muted)]">
                      <Link className="text-blue-700" to={`/pedidos/coletar/${step.extra}`}>
                        {step.extra}
                      </Link>
                    </div>
                  ) : null}
                  {index === array.length - 1 ? null : (
                    <div className="hidden h-px bg-transparent sm:block" />
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="px-4 pt-8 sm:px-8">
            <div className="text-sm text-[var(--ink-muted)]">ID da remessa: {shipmentId}</div>
          </section>

          <section className="px-4 pt-4 pb-10 sm:px-8">
            <div className="rounded border border-black/10 bg-white p-4">
              <div className="grid grid-cols-[2fr_1fr_1fr_0.6fr] gap-4 border-b border-black/10 pb-2 text-xs font-semibold text-[var(--ink-muted)]">
                <span>Itens do pedido</span>
                <span>SKU</span>
                <span>Tipo de inventário</span>
                <span>Unidades</span>
              </div>
              <div className="mt-2 flex flex-col gap-2">
                {orderItems.map((item: any) => (
                  <div
                    key={item?.item?.id ?? item?.item?.title}
                    className="grid grid-cols-[2fr_1fr_1fr_0.6fr] gap-4 border-b border-black/10 py-3 text-sm"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded border border-black/10 text-xs text-[var(--ink-muted)]">
                        {(() => {
                          const sku = item?.item?.seller_sku ?? ''
                          const itemId = item?.item?.id ?? ''
                          const thumb = sku ? thumbByItemId.get(String(sku)) : itemId ? thumbByItemId.get(String(itemId)) : null
                          if (thumb) {
                            return <img src={thumb} alt={item?.item?.title ?? 'Produto'} className="h-full w-full object-contain" />
                          }
                          return 'Img'
                        })()}
                      </div>
                      <span className="text-blue-700">{item?.item?.title ?? '-'}</span>
                    </div>
                    <div>{item?.item?.seller_sku ?? item?.item?.id ?? '-'}</div>
                    <div>MLB</div>
                    <div>{item?.quantity ?? 0}</div>
                  </div>
                ))}
                <div className="grid grid-cols-[2fr_1fr_1fr_0.6fr] gap-4 py-3 text-sm font-semibold">
                  <div>Total</div>
                  <div>{orderItems.length} SKU</div>
                  <div />
                  <div>{orderItems.reduce((acc: number, item: any) => acc + (item?.quantity ?? 0), 0)}</div>
                </div>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </>
  )
}
