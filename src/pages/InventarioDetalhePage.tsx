import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import LoadingOverlay from '../components/LoadingOverlay'
import { tinyAccountId, supabaseUrl } from '../config'
import { tinyFetch } from '../lib/tinyFetch'
import { formatOrderDate } from '../utils/date'

export default function InventarioDetalhePage() {
  const { id } = useParams()
  const [data, setData] = useState<any | null>(null)
  const [adjustments, setAdjustments] = useState<any[]>([])
  const [receipts, setReceipts] = useState<any[]>([])
  const [stock, setStock] = useState<any | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabaseUrl || !id) {
      setError('Produto não encontrado.')
      return
    }
    const controller = new AbortController()

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const [productResponse, adjustmentsResponse, receiptsResponse, stockResponse] = await Promise.all([
          tinyFetch(
            `${supabaseUrl}/functions/v1/tiny-user-product?account_id=${tinyAccountId}&user_product_id=${id}`,
            {
              signal: controller.signal,
            },
          ),
          tinyFetch(`${supabaseUrl}/functions/v1/tiny-adjustments`, {
            signal: controller.signal,
          }),
          tinyFetch(`${supabaseUrl}/functions/v1/tiny-bins`, {
            signal: controller.signal,
          }),
          tinyFetch(
            `${supabaseUrl}/functions/v1/tiny-inventory?account_id=${tinyAccountId}&mode=stock&product_id=${id}`,
            {
              signal: controller.signal,
            },
          ),
        ])
        if (!productResponse.ok) {
          throw new Error(`Erro ao carregar produto: ${productResponse.status}`)
        }
        const payload = await productResponse.json()
        setData(payload)
        if (adjustmentsResponse.ok) {
          const adjustmentsPayload = await adjustmentsResponse.json()
          setAdjustments(Array.isArray(adjustmentsPayload) ? adjustmentsPayload : [])
        }
        if (receiptsResponse.ok) {
          const receiptsPayload = await receiptsResponse.json()
          setReceipts(Array.isArray(receiptsPayload) ? receiptsPayload : [])
        }
        if (stockResponse.ok) {
          const stockPayload = await stockResponse.json()
          setStock(stockPayload)
        } else {
          setStock(null)
        }
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          setError(err instanceof Error ? err.message : 'Falha ao carregar produto.')
        }
      } finally {
        setLoading(false)
      }
    }

    load()

    return () => controller.abort()
  }, [id])

  const items = Array.isArray(data?.items) ? data.items : []
  const mainItem = items[0]
  const mainAttributes = Array.isArray(mainItem?.attributes) ? mainItem.attributes : []
  const skuAttr = mainAttributes.find((attr: any) => attr?.id === 'SELLER_SKU')
  const gtinAttr =
    mainAttributes.find((attr: any) => attr?.id === 'GTIN') ||
    mainAttributes.find((attr: any) => attr?.id === 'EAN')
  const skuValue = skuAttr?.value_name || mainItem?.seller_sku || mainItem?.id || '-'
  const gtinValue = gtinAttr?.value_name ?? '-'
  const adIds = items.map((item: any) => item?.id).filter(Boolean)
  const skuCandidates = new Set(
    [skuValue, mainItem?.seller_sku, mainItem?.id].filter((value) => value && value !== '-').map(String),
  )
  const filteredAdjustments = adjustments.filter((entry) => skuCandidates.has(String(entry?.sku)))
  const filteredReceipts = receipts.filter((entry) => skuCandidates.has(String(entry?.sku)))
  const stockDeposits = Array.isArray(stock?.depositos) ? stock.depositos : []
  const normalizedDeposits = stockDeposits.map((entry: any) => {
    const deposit = entry?.deposito ?? entry
    return {
      nome: deposit?.nome ?? '-',
      desconsiderar: deposit?.desconsiderar ?? null,
      saldo: Number(deposit?.saldo ?? 0),
      reservado: Number(deposit?.reservado ?? deposit?.saldoReservado ?? 0),
      disponivel: Number(deposit?.disponivel ?? 0),
    }
  })
  const inventoryHistory = [
    ...filteredReceipts.map((entry) => ({
      id: `receipt-${entry.id}`,
      created_at: entry.created_at,
      sku: entry.sku,
      action: 'receber',
      quantity: entry.quantity,
      from_bin: null,
      to_bin: entry.bin,
    })),
    ...filteredAdjustments.map((entry) => ({
      id: `adjust-${entry.id}`,
      created_at: entry.created_at,
      sku: entry.sku,
      action: entry.action,
      quantity: entry.quantity,
      from_bin: entry.from_bin,
      to_bin: entry.to_bin,
    })),
  ].sort((a, b) => {
    const aDate = a.created_at ? new Date(a.created_at).getTime() : 0
    const bDate = b.created_at ? new Date(b.created_at).getTime() : 0
    return bDate - aDate
  })

  return (
    <>
      {loading ? <LoadingOverlay label="Carregando produto..." /> : null}
      <section className="px-4 pt-6 sm:px-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Detalhes do produto</h1>
            <div className="mt-2 text-sm text-[var(--ink-muted)]">
              <Link className="text-blue-700" to="/inventario/todo">
                Todo o inventário
              </Link>{' '}
              &gt; Produto {id}
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 pt-6 sm:px-8">
        {loading ? <div className="text-sm text-[var(--ink-muted)]">Carregando produto...</div> : null}
        {error ? <div className="text-sm text-red-600">{error}</div> : null}
      </section>

      {mainItem ? (
        <>
          <section className="px-4 pt-6 sm:px-8">
            <div className="grid gap-4 rounded border border-black/10 bg-white p-4 sm:grid-cols-[120px_1fr]">
              <div className="flex h-24 w-24 items-center justify-center rounded border border-black/10 bg-white text-xs text-[var(--ink-muted)]">
                {mainItem.thumbnail ? (
                  <img src={mainItem.thumbnail} alt={mainItem.title} className="h-full w-full object-contain" />
                ) : (
                  'Thumb'
                )}
              </div>
              <div className="text-sm">
                <div className="text-[var(--ink-muted)]">Título</div>
                <div className="mt-1 text-lg font-semibold">{mainItem.title}</div>
                <div className="mt-2 text-[var(--ink-muted)]">SKU: {skuValue}</div>
                <div className="mt-1 text-[var(--ink-muted)]">GTIN/EAN: {gtinValue}</div>
                <div className="mt-2 text-[var(--ink-muted)]">
                  IDs dos anúncios: {adIds.length ? adIds.join(', ') : '-'}
                </div>
              </div>
            </div>
          </section>

          {stock ? (
            <section className="px-4 pt-6 sm:px-8">
              <div className="rounded border border-black/10 bg-white p-4">
                <h2 className="text-lg font-semibold">Estoque no Tiny</h2>
                <div className="mt-3 grid gap-4 text-sm sm:grid-cols-3">
                  <div>
                    <div className="text-[var(--ink-muted)]">Saldo</div>
                    <div className="mt-1 text-lg font-semibold">{stock?.saldo ?? 0}</div>
                  </div>
                  <div>
                    <div className="text-[var(--ink-muted)]">Reservado</div>
                    <div className="mt-1 text-lg font-semibold">
                      {stock?.reservado ?? stock?.saldoReservado ?? 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-[var(--ink-muted)]">Disponível</div>
                    <div className="mt-1 text-lg font-semibold">{stock?.disponivel ?? 0}</div>
                  </div>
                </div>

                {normalizedDeposits.length ? (
                  <>
                    <div className="mt-6 grid grid-cols-[1.4fr_1fr_1fr_1fr_1fr] gap-4 border-b border-black/10 pb-2 text-xs font-semibold text-[var(--ink-muted)]">
                      <span>Depósito</span>
                      <span>Saldo</span>
                      <span>Reservado</span>
                      <span>Disponível</span>
                      <span>Desconsiderar</span>
                    </div>
                    <div className="mt-2 flex flex-col gap-2">
                      {normalizedDeposits.map((deposit: any, index: number) => (
                        <div
                          key={`${deposit.nome}-${index}`}
                          className="grid grid-cols-[1.4fr_1fr_1fr_1fr_1fr] gap-4 border-b border-black/10 py-2 text-sm"
                        >
                          <div>{deposit.nome ?? '-'}</div>
                          <div>{deposit.saldo ?? 0}</div>
                          <div>{deposit.reservado ?? 0}</div>
                          <div>{deposit.disponivel ?? 0}</div>
                          <div>{deposit.desconsiderar ? 'Sim' : 'Não'}</div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="mt-3 text-sm text-[var(--ink-muted)]">Sem depósitos cadastrados.</div>
                )}
              </div>
            </section>
          ) : null}

          <section className="px-4 pt-6 pb-10 sm:px-8">
            <div className="rounded border border-black/10 bg-white p-4">
              <h2 className="text-lg font-semibold">Histórico de ajustes de inventário</h2>
              {inventoryHistory.length ? (
                <>
                  <div className="mt-3 grid grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr_1fr_1fr] gap-4 border-b border-black/10 pb-2 text-xs font-semibold text-[var(--ink-muted)]">
                    <span>Data/Hora</span>
                    <span>SKU</span>
                    <span>Ação</span>
                    <span>Quantidade</span>
                    <span>Origem</span>
                    <span>Destino</span>
                  </div>
                  <div className="mt-2 flex flex-col gap-2">
                    {inventoryHistory.map((row) => (
                      <div
                        key={row.id}
                        className="grid grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr_1fr_1fr] gap-4 border-b border-black/10 py-2 text-sm"
                      >
                        <div>{formatOrderDate(row.created_at)}</div>
                        <div>{row.sku}</div>
                        <div>{row.action}</div>
                        <div>{row.quantity}</div>
                        <div>{row.from_bin ?? '-'}</div>
                        <div>{row.to_bin ?? '-'}</div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="mt-3 text-sm text-[var(--ink-muted)]">Sem dados disponíveis.</div>
              )}
            </div>
          </section>
        </>
      ) : null}
    </>
  )
}
