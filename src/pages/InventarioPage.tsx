import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { mlAccountId, supabaseUrl } from '../config'
import LoadingOverlay from '../components/LoadingOverlay'

export default function InventarioPage() {
  const [inventoryTab, setInventoryTab] = useState('Visualizar por bin')
  const [items, setItems] = useState<any[]>([])
  const [binBySku, setBinBySku] = useState<Record<string, { bins: Record<string, number>; total: number }>>({})
  const [binByItemId, setBinByItemId] = useState<Record<string, { bins: Record<string, number>; total: number }>>({})
  const [pendingBySku, setPendingBySku] = useState<Record<string, number>>({})
  const [searchTerm, setSearchTerm] = useState('')
  const [binFilter, setBinFilter] = useState('Todos')
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
        const [inventoryResponse, binsResponse, ordersResponse] = await Promise.all([
          fetch(`${supabaseUrl}/functions/v1/ml-inventory?account_id=${mlAccountId}&details=1`, {
            signal: controller.signal,
          }),
          fetch(`${supabaseUrl}/functions/v1/ml-bins`, { signal: controller.signal }),
          fetch(`${supabaseUrl}/functions/v1/ml-orders?account_id=${mlAccountId}&details=1`, {
            signal: controller.signal,
          }),
        ])

        if (!inventoryResponse.ok) {
          throw new Error(`Erro ao carregar inventário: ${inventoryResponse.status}`)
        }
        if (!binsResponse.ok) {
          throw new Error(`Erro ao carregar bins: ${binsResponse.status}`)
        }
        if (!ordersResponse.ok) {
          throw new Error(`Erro ao carregar pedidos: ${ordersResponse.status}`)
        }

        const inventoryData = await inventoryResponse.json()
        if (!Array.isArray(inventoryData?.results)) {
          throw new Error('Resposta inesperada da API de inventário.')
        }
        const binsData = await binsResponse.json()
        const ordersData = await ordersResponse.json()

        const bySku: Record<string, { bins: Record<string, number>; total: number }> = {}
        const byItem: Record<string, { bins: Record<string, number>; total: number }> = {}
        const itemIdToSku: Record<string, string> = {}

        const addToMap = (
          map: Record<string, { bins: Record<string, number>; total: number }>,
          key: string,
          bin: string,
          qty: number,
        ) => {
          if (!map[key]) {
            map[key] = { bins: {}, total: 0 }
          }
          map[key].bins[bin] = (map[key].bins[bin] ?? 0) + qty
          map[key].total += qty
        }

        for (const entry of Array.isArray(binsData) ? binsData : []) {
          const bin = entry?.bin
          const qty = Number(entry?.quantity ?? 0)
          if (!bin || !Number.isFinite(qty)) continue
          if (entry?.sku) {
            addToMap(bySku, String(entry.sku), bin, qty)
          }
          if (entry?.item_id) {
            addToMap(byItem, String(entry.item_id), bin, qty)
          }
        }

        for (const item of inventoryData.results) {
          const attrs = Array.isArray(item?.attributes) ? item.attributes : []
          const attrSku = attrs.find((attr: any) => attr?.id === 'SELLER_SKU')
          const skuValue =
            attrSku?.value_name || item?.seller_sku || item?.seller_custom_field || item?.inventory_id || item?.id
          if (item?.id && skuValue) {
            itemIdToSku[String(item.id)] = String(skuValue)
          }
        }

        const pending: Record<string, number> = {}
        const orders = Array.isArray(ordersData?.results) ? ordersData.results : []
        for (const order of orders) {
          const isPaid = order?.status === 'paid' || order?.status === 'authorized'
          const shippingStatus = order?.shipping_details?.status || order?.shipping?.status
          const isShipped = ['shipped', 'delivered', 'handling'].includes(shippingStatus)
          if (!isPaid || isShipped) {
            continue
          }
          const orderItems = Array.isArray(order?.order_items) ? order.order_items : []
          for (const item of orderItems) {
            const itemId = item?.item?.id
            const sku =
              item?.item?.seller_sku || (itemId ? itemIdToSku[String(itemId)] : null) || itemId
            if (!sku) continue
            const qty = Number(item?.quantity ?? 0)
            if (!Number.isFinite(qty)) continue
            pending[String(sku)] = (pending[String(sku)] ?? 0) + qty
            if (itemId) {
              pending[String(itemId)] = (pending[String(itemId)] ?? 0) + qty
            }
          }
        }

        setItems(inventoryData.results)
        setBinBySku(bySku)
        setBinByItemId(byItem)
        setPendingBySku(pending)
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          setError(err instanceof Error ? err.message : 'Falha ao carregar inventário.')
        }
      } finally {
        setLoading(false)
      }
    }

    load()

    return () => controller.abort()
  }, [])

  const rows = useMemo(() => {
    const getSkuValue = (item: any, fallback = '-') => {
      const attrs = Array.isArray(item?.attributes) ? item.attributes : []
      const attrSku = attrs.find((attr: any) => attr?.id === 'SELLER_SKU')
      return (
        attrSku?.value_name ||
        item?.seller_sku ||
        item?.seller_custom_field ||
        item?.inventory_id ||
        item?.id ||
        fallback
      )
    }

    const getThumb = (item: any) =>
      item?.thumbnail || item?.pictures?.[0]?.secure_url || item?.pictures?.[0]?.url || null

    const getBinInfo = (item: any) => {
      const skuKey = getSkuValue(item, '')
      const idKey = item?.id ?? ''
      return (skuKey && binBySku[String(skuKey)]) || (idKey && binByItemId[String(idKey)]) || null
    }

    const getPendingQty = (item: any) => {
      const skuKey = getSkuValue(item, '')
      const idKey = item?.id ?? ''
      return (skuKey && pendingBySku[String(skuKey)]) || (idKey && pendingBySku[String(idKey)]) || 0
    }

    const normalizedSearch = searchTerm.trim().toLowerCase()
    const matchesSearch = (item: any) => {
      if (!normalizedSearch) return true
      const title = String(item?.title ?? '').toLowerCase()
      const skuValue = String(getSkuValue(item, '') ?? '').toLowerCase()
      return title.includes(normalizedSearch) || skuValue.includes(normalizedSearch)
    }

    const buildSkuRows = (source: any[]) => {
      const grouped = new Map<
        string,
        {
          groupId: string
          name: string
          thumb: string | null
          skuDisplay: string
          available: number
          pending: number
          binNames: Set<string>
          count: number
        }
      >()

      for (const item of source.filter(matchesSearch)) {
        const groupId =
          item?.user_product_id || item?.inventory_id || item?.seller_custom_field || item?.id || '-'
        const key = String(groupId)
        const current = grouped.get(key)
        const title = item?.title ?? `Item ${item?.id ?? '-'}`
        const available = item?.available_quantity ?? 0
        const displaySku = getSkuValue(item, key)
        const thumb = getThumb(item)
        const binInfo = getBinInfo(item)
        const binNames = new Set<string>(Object.keys(binInfo?.bins ?? {}))
        const pendingQty = getPendingQty(item)

        if (!current) {
          grouped.set(key, {
            groupId: key,
            name: title,
            thumb,
            skuDisplay: String(displaySku),
            available,
            pending: pendingQty,
            binNames,
            count: 1,
          })
        } else {
          current.count += 1
          current.available = Math.max(current.available, available)
          current.pending = Math.max(current.pending, pendingQty)
          binNames.forEach((name) => current.binNames.add(name))
          if (!current.skuDisplay && displaySku) {
            current.skuDisplay = String(displaySku)
          }
          if (!current.thumb && thumb) {
            current.thumb = thumb
          }
        }
      }

      return Array.from(grouped.values()).map((group) => {
        const binList = Array.from(group.binNames)
        const binLabel = binList.length > 1 ? 'Vários' : binList[0] ?? '-'
        return {
          bin: binLabel,
          name: group.name,
          thumb: group.thumb,
          sku: group.skuDisplay,
          groupId: group.groupId,
          sellable: group.available,
          unsellable: group.pending,
          expiry: '-',
        }
      })
    }

    const buildBinRows = (source: any[]) => {
      const grouped = new Map<
        string,
        {
          groupId: string
          name: string
          thumb: string | null
          skuDisplay: string
          bin: string
          available: number
          pending: number
        }
      >()

      for (const item of source.filter(matchesSearch)) {
        const groupId =
          item?.user_product_id || item?.inventory_id || item?.seller_custom_field || item?.id || '-'
        const keyBase = String(groupId)
        const title = item?.title ?? `Item ${item?.id ?? '-'}`
        const displaySku = getSkuValue(item, keyBase)
        const available = item?.available_quantity ?? 0
        const thumb = getThumb(item)
        const binInfo = getBinInfo(item)
        const binEntries = Object.entries(binInfo?.bins ?? {}).filter(([, qty]) => Number(qty ?? 0) > 0)
        const pendingQty = getPendingQty(item)

        if (binEntries.length) {
          for (const [bin, qty] of binEntries) {
            const mapKey = `${keyBase}-${bin}`
            if (!grouped.has(mapKey)) {
              grouped.set(mapKey, {
                groupId: keyBase,
                name: title,
                thumb,
                skuDisplay: String(displaySku),
                bin,
                available: Number(qty ?? 0),
                pending: pendingQty,
              })
            }
          }
          const totalInBins = binInfo?.total ?? 0
          if (available > totalInBins) {
            const mapKey = `${keyBase}-sem-bin`
            grouped.set(mapKey, {
              groupId: keyBase,
              name: title,
              thumb,
              skuDisplay: String(displaySku),
              bin: 'Sem bin',
              available: available - totalInBins,
              pending: pendingQty,
            })
          }
        } else if (available > 0) {
          const mapKey = `${keyBase}-sem-bin`
          grouped.set(mapKey, {
            groupId: keyBase,
            name: title,
            thumb,
            skuDisplay: String(displaySku),
            bin: 'Sem bin',
            available,
            pending: pendingQty,
          })
        }
      }

      const orderPriority: Record<string, number> = { A1: 1, A2: 2, A3: 3 }
      return Array.from(grouped.values())
        .filter((group) => (binFilter === 'Todos' ? true : group.bin === binFilter))
        .sort((a, b) => {
          const aOrder = orderPriority[a.bin] ?? (a.bin === 'Sem bin' ? 99 : 50)
          const bOrder = orderPriority[b.bin] ?? (b.bin === 'Sem bin' ? 99 : 50)
          if (aOrder !== bOrder) return aOrder - bOrder
          return a.name.localeCompare(b.name)
        })
        .map((group) => ({
          bin: group.bin,
          name: group.name,
          thumb: group.thumb,
          sku: group.skuDisplay,
          groupId: group.groupId,
          sellable: group.available,
          unsellable: group.pending,
          expiry: '-',
        }))
    }

    if (inventoryTab === 'Sem estoque') {
      return buildSkuRows(items.filter((item) => (item?.available_quantity ?? 0) === 0))
    }
    if (inventoryTab === 'Visualizar por SKU') {
      return buildSkuRows(items)
    }
    return buildBinRows(items)
  }, [inventoryTab, items, binBySku, binByItemId, pendingBySku, searchTerm, binFilter])

  const showBinColumn = inventoryTab !== 'Visualizar por SKU'
  const gridColumns = showBinColumn
    ? 'grid-cols-[0.4fr_0.5fr_2fr_1.2fr_1fr_1.2fr]'
    : 'grid-cols-[0.4fr_2fr_1.2fr_1fr_1.2fr]'

  return (
    <>
      {loading ? <LoadingOverlay label="Carregando inventário..." /> : null}
      <section className="px-4 pt-6 sm:px-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Todo o inventário</h1>
          </div>
        </div>
      </section>

      <section className="px-4 pt-6 pb-10 sm:px-8">
        <div className="border-b border-black/10">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            {['Sem estoque', 'Visualizar por SKU', 'Visualizar por bin'].map((tab) => (
              <button
                key={tab}
                className={`border-b-2 px-2 py-3 ${
                  tab === inventoryTab
                    ? 'border-blue-700 text-blue-700'
                    : 'border-transparent text-[var(--ink-muted)]'
                }`}
                onClick={() => setInventoryTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
          <div className="mt-4 rounded border border-black/10 bg-[var(--surface)] p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-1 flex-wrap items-center gap-2">
                <input
                  className="w-full rounded border border-black/10 bg-white px-3 py-2 text-sm lg:w-[220px]"
                  placeholder="Pesquisar"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
                {inventoryTab === 'Visualizar por bin' ? (
                  <select
                    className="rounded border border-black/10 bg-white px-3 py-2 text-sm"
                    value={binFilter}
                    onChange={(event) => setBinFilter(event.target.value)}
                  >
                    <option value="Todos">Todos os bins</option>
                    <option value="A1">A1</option>
                    <option value="A2">A2</option>
                    <option value="A3">A3</option>
                  </select>
                ) : null}
              </div>
            </div>
          {loading ? <div className="mt-3 text-sm text-[var(--ink-muted)]">Carregando inventário...</div> : null}
          {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}

          <div className="mt-4 overflow-x-auto">
            <div className="min-w-[820px]">
              <div className={`grid ${gridColumns} gap-4 border-b border-black/10 pb-2 text-xs font-semibold text-[var(--ink-muted)]`}>
                <span> </span>
                {showBinColumn ? <span>Bin</span> : null}
                <span>Nome do produto</span>
                <span>SKU</span>
                <span>Comercializável</span>
                <span>Não comercializável</span>
              </div>
              <div className="mt-2 flex flex-col gap-2">
                {loading ? (
                  <div className="border-b border-black/10 px-1 py-6 text-sm text-[var(--ink-muted)]">
                    Carregando inventário...
                  </div>
                ) : null}
                {rows.map((row) => (
                  <div
                    key={`${row.sku}-${row.bin}`}
                    className={`grid ${gridColumns} items-center gap-4 border-b border-black/10 px-1 py-3 text-sm`}
                  >
                    <div className="flex items-center">
                      <input type="checkbox" className="h-4 w-4" />
                    </div>
                    {showBinColumn ? <div>{row.bin === 'Sem bin' ? '-' : row.bin}</div> : null}
                    <div className="flex items-center gap-3 text-blue-600">
                      <div className="flex h-10 w-10 items-center justify-center rounded border border-black/10 bg-white text-[10px] text-[var(--ink-muted)]">
                        {row.thumb ? (
                          <img src={row.thumb} alt={row.name} className="h-full w-full object-contain" />
                        ) : (
                          'Img'
                        )}
                      </div>
                      <Link to={`/inventario/${row.groupId}`}>{row.name}</Link>
                    </div>
                    <div>{row.sku}</div>
                    <div className="flex items-center gap-2">
                      {row.sellable === 0 ? (
                        <span className="flex items-center gap-1 rounded border border-red-500 px-2 py-1 text-xs text-red-600">
                          <span className="h-2 w-2 rounded-full bg-red-500" />
                          Fora de estoque
                        </span>
                      ) : (
                        <span>{row.sellable}</span>
                      )}
                    </div>
                    <div>{row.unsellable}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-end gap-2 text-sm text-[var(--ink-muted)]">
                <span>{rows.length} resultados</span>
                <span className="text-black">1</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
