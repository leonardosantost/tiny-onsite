import { useEffect, useMemo, useState } from 'react'
import LoadingOverlay from '../components/LoadingOverlay'
import { tinyAccountId, supabaseUrl } from '../config'
import { tinyFetch } from '../lib/tinyFetch'

type ProductListItem = {
  id: string | null
  nome: string | null
  codigo: string | null
  sku: string | null
  unidade: string | null
  gtin?: string | null
  variacao?: string | null
}

type Paging = {
  limit: number
  offset: number
  total: number
}

type StockDeposit = {
  nome: string
  desconsiderar: string | null
  saldo: number
  reservado: number
  disponivel: number
}

type StockData = {
  saldo: number
  reservado: number
  disponivel: number
  depositos: StockDeposit[]
}

const DEFAULT_LIMIT = 100

export default function InventarioEtiquetasPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [committedSearch, setCommittedSearch] = useState('')
  const [searchBy, setSearchBy] = useState<'auto' | 'sku' | 'gtin' | 'titulo'>('auto')
  const [items, setItems] = useState<ProductListItem[]>([])
  const [paging, setPaging] = useState<Paging | null>(null)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [selectedProduct, setSelectedProduct] = useState<ProductListItem | null>(null)
  const [stock, setStock] = useState<StockData | null>(null)
  const [stockLoading, setStockLoading] = useState(false)
  const [manualQuantity, setManualQuantity] = useState(1)
  const [manualLocation, setManualLocation] = useState('')
  const [depositSelections, setDepositSelections] = useState<Record<number, { checked: boolean; quantity: number }>>(
    {},
  )
  const [printError, setPrintError] = useState<string | null>(null)

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
        const params = new URLSearchParams({
          account_id: tinyAccountId,
          mode: 'list',
          limit: String(DEFAULT_LIMIT),
          offset: String(offset),
        })
        if (committedSearch) {
          params.set('search', committedSearch)
          if (searchBy !== 'auto') {
            params.set('search_by', searchBy)
          }
        }
        const response = await tinyFetch(`${supabaseUrl}/functions/v1/tiny-inventory?${params.toString()}`, {
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error(`Erro ao carregar produtos: ${response.status}`)
        }
        const data = await response.json()
        const results = Array.isArray(data?.results) ? data.results : []
        const normalized = results.map((entry: any) => {
          const attrs = Array.isArray(entry?.attributes) ? entry.attributes : []
          const gtinAttr =
            attrs.find((attr: any) => attr?.id === 'GTIN') ||
            attrs.find((attr: any) => attr?.id === 'EAN')
          const skuAttr = attrs.find((attr: any) => attr?.id === 'SELLER_SKU')

          return {
            id: entry?.id != null ? String(entry.id) : null,
            nome: entry?.nome ?? entry?.title ?? entry?.descricao ?? null,
            codigo: entry?.codigo ?? entry?.seller_custom_field ?? entry?.seller_sku ?? entry?.sku ?? null,
            sku: entry?.sku ?? entry?.seller_sku ?? skuAttr?.value_name ?? null,
            unidade: entry?.unidade ?? null,
            gtin: entry?.gtin ?? gtinAttr?.value_name ?? null,
            variacao: entry?.variacao ?? entry?.tipoVariacao ?? null,
          } as ProductListItem
        })
        setItems(normalized)
        if (data?.paging) {
          setPaging({
            limit: Number(data.paging.limit ?? DEFAULT_LIMIT),
            offset: Number(data.paging.offset ?? offset),
            total: Number(data.paging.total ?? results.length),
          })
        } else {
          setPaging({ limit: DEFAULT_LIMIT, offset, total: results.length })
        }
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          setError(err instanceof Error ? err.message : 'Falha ao carregar produtos.')
        }
      } finally {
        setLoading(false)
      }
    }

    load()

    return () => controller.abort()
  }, [committedSearch, offset, searchBy])

  const total = paging?.total ?? items.length
  const limit = paging?.limit ?? DEFAULT_LIMIT
  const currentPage = Math.floor((paging?.offset ?? offset) / limit) + 1
  const totalPages = Math.max(1, Math.ceil(total / limit))

  const parseStock = (payload: any): StockData | null => {
    const product = payload?.retorno?.produto ?? payload?.produto ?? payload ?? null
    if (!product) return null
    const depositEntries = Array.isArray(product?.depositos) ? product.depositos : []
    const normalizedDeposits = depositEntries.map((entry: any) => {
      const deposito = entry?.deposito ?? entry
      return {
        nome: String(deposito?.nome ?? '-'),
        desconsiderar: deposito?.desconsiderar ?? null,
        saldo: Number(deposito?.saldo ?? 0),
        reservado: Number(deposito?.reservado ?? deposito?.saldoReservado ?? 0),
        disponivel: Number(deposito?.disponivel ?? 0),
      }
    })
    return {
      saldo: Number(product?.saldo ?? 0),
      reservado: Number(product?.reservado ?? product?.saldoReservado ?? 0),
      disponivel: Number(product?.disponivel ?? 0),
      depositos: normalizedDeposits,
    }
  }

  const handleSelectProduct = async (product: ProductListItem) => {
    if (!supabaseUrl || !product?.id) return
    setSelectedProduct(product)
    setStock(null)
    setPrintError(null)
    setDepositSelections({})
    setManualQuantity(1)
    setManualLocation('')
    setStockLoading(true)
    try {
      const response = await tinyFetch(
        `${supabaseUrl}/functions/v1/tiny-inventory?account_id=${tinyAccountId}&mode=stock&product_id=${product.id}`,
        { cache: 'no-store' },
      )
      if (!response.ok) {
        throw new Error(`Erro ao buscar estoque: ${response.status}`)
      }
      const payload = await response.json()
      const parsed = parseStock(payload)
      setStock(parsed)
      if (parsed?.depositos?.length) {
        setManualLocation(parsed.depositos[0].nome)
        const selections: Record<number, { checked: boolean; quantity: number }> = {}
        parsed.depositos.forEach((deposito, index) => {
          selections[index] = { checked: false, quantity: Number(deposito.saldo ?? 0) }
        })
        setDepositSelections(selections)
      }
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : 'Falha ao buscar estoque.')
    } finally {
      setStockLoading(false)
    }
  }

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCommittedSearch(searchTerm.trim())
    setOffset(0)
  }

  const hasSelectedDeposits = useMemo(
    () => Object.values(depositSelections).some((entry) => entry.checked),
    [depositSelections],
  )

  const handleGenerateLabels = () => {
    if (!selectedProduct) {
      setPrintError('Selecione um produto para imprimir etiquetas.')
      return
    }

    const codeValue = selectedProduct.gtin || selectedProduct.sku || selectedProduct.codigo || ''
    const skuValue = selectedProduct.sku || selectedProduct.codigo || codeValue
    if (!codeValue) {
      setPrintError('Produto sem SKU/GTIN para gerar etiqueta.')
      return
    }

    const labels: Array<{
      title: string
      variation: string
      location: string
      code: string
      codeLabel: string
    }> = []

    if (hasSelectedDeposits && stock?.depositos?.length) {
      stock.depositos.forEach((deposito, index) => {
        const selection = depositSelections[index]
        if (!selection?.checked) return
        const qty = Math.max(0, Math.floor(selection.quantity || 0))
        for (let i = 0; i < qty; i += 1) {
          labels.push({
            title: selectedProduct.nome ?? '-',
            variation: selectedProduct.variacao ?? '-',
            location: deposito.nome ?? '-',
            code: codeValue,
            codeLabel: selectedProduct.gtin ? 'GTIN' : 'SKU',
            sku: skuValue,
          })
        }
      })
    } else {
      const qty = Math.max(0, Math.floor(manualQuantity || 0))
      if (!qty) {
        setPrintError('Informe uma quantidade válida para imprimir.')
        return
      }
      for (let i = 0; i < qty; i += 1) {
        labels.push({
          title: selectedProduct.nome ?? '-',
          variation: selectedProduct.variacao ?? '-',
          location: manualLocation || '-',
          code: codeValue,
          codeLabel: selectedProduct.gtin ? 'GTIN' : 'SKU',
          sku: skuValue,
        })
      }
    }

    if (!labels.length) {
      setPrintError('Nenhuma etiqueta gerada. Verifique as quantidades selecionadas.')
      return
    }

    sessionStorage.setItem('inventory-labels', JSON.stringify({ labels }))
    window.open('/inventario/etiquetas/print', '_blank')
  }

  return (
    <>
      {loading ? <LoadingOverlay label="Carregando produtos..." /> : null}
      <section className="px-4 pt-6 sm:px-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Etiquetas</h1>
            <p className="mt-2 text-sm text-[var(--ink-muted)]">
              Pesquise por SKU, GTIN ou título e gere etiquetas por depósito.
            </p>
          </div>
        </div>
      </section>

      <section className="px-4 pt-6 pb-10 sm:px-8">
        <div className="rounded border border-black/10 bg-[var(--surface)] p-4">
          <form
            className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"
            onSubmit={handleSearchSubmit}
          >
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <input
                className="w-full rounded border border-black/10 bg-white px-3 py-2 text-sm lg:w-[320px]"
                placeholder="Pesquisar por SKU, GTIN ou título"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
              <select
                className="rounded border border-black/10 bg-white px-3 py-2 text-sm"
                value={searchBy}
                onChange={(event) => setSearchBy(event.target.value as typeof searchBy)}
              >
                <option value="auto">Busca automática</option>
                <option value="sku">SKU/Código</option>
                <option value="gtin">GTIN</option>
                <option value="titulo">Título</option>
              </select>
              <button
                className="rounded border border-blue-700 px-3 py-2 text-sm text-blue-700"
                type="submit"
              >
                Pesquisar
              </button>
            </div>
          </form>
          {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}

          <div className="mt-4 overflow-x-auto">
            <div className="min-w-[820px]">
              <div className="grid grid-cols-[2fr_1fr_1fr_0.8fr_0.7fr] gap-4 border-b border-black/10 pb-2 text-xs font-semibold text-[var(--ink-muted)]">
                <span>Produto</span>
                <span>Código</span>
                <span>SKU</span>
                <span>Unidade</span>
                <span>Ação</span>
              </div>
              <div className="mt-2 flex flex-col gap-2">
                {items.map((item, index) => (
                  <div
                    key={`${item.id ?? item.sku ?? `row-${index}`}`}
                    className="grid grid-cols-[2fr_1fr_1fr_0.8fr_0.7fr] items-center gap-4 border-b border-black/10 px-1 py-3 text-sm"
                  >
                    <div className="text-blue-700">{item.nome ?? '-'}</div>
                    <div>{item.codigo ?? '-'}</div>
                    <div>{item.sku ?? '-'}</div>
                    <div>{item.unidade ?? '-'}</div>
                    <div>
                      <button
                        className="rounded border border-blue-700 px-3 py-1 text-xs text-blue-700"
                        onClick={() => handleSelectProduct(item)}
                      >
                        Selecionar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 text-sm text-[var(--ink-muted)]">
                <span>
                  {items.length} resultados | Página {currentPage} de {totalPages}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    className="rounded border border-black/10 px-3 py-1 text-sm text-black disabled:opacity-50"
                    onClick={() => setOffset(Math.max(0, offset - limit))}
                    disabled={offset === 0}
                  >
                    Anterior
                  </button>
                  <button
                    className="rounded border border-black/10 px-3 py-1 text-sm text-black disabled:opacity-50"
                    onClick={() => setOffset(offset + limit)}
                    disabled={offset + limit >= total}
                  >
                    Próxima
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded border border-black/10 bg-white p-4">
          <h2 className="text-lg font-semibold">Etiqueta do produto</h2>
          {!selectedProduct ? (
            <div className="mt-2 text-sm text-[var(--ink-muted)]">
              Selecione um produto acima para visualizar o estoque.
            </div>
          ) : (
            <>
              <div className="mt-3 grid gap-3 text-sm sm:grid-cols-[2fr_1fr_1fr]">
                <div>
                  <div className="text-[var(--ink-muted)]">Produto</div>
                  <div className="mt-1 text-base font-semibold">{selectedProduct.nome ?? '-'}</div>
                </div>
                <div>
                  <div className="text-[var(--ink-muted)]">SKU</div>
                  <div className="mt-1">{selectedProduct.sku ?? selectedProduct.codigo ?? '-'}</div>
                </div>
                <div>
                  <div className="text-[var(--ink-muted)]">GTIN</div>
                  <div className="mt-1">{selectedProduct.gtin ?? '-'}</div>
                </div>
              </div>

              {stockLoading ? (
                <div className="mt-4 text-sm text-[var(--ink-muted)]">Carregando estoque...</div>
              ) : stock ? (
                <>
                  <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                    <div>
                      <div className="text-[var(--ink-muted)]">Saldo</div>
                      <div className="mt-1 text-base font-semibold">{stock.saldo}</div>
                    </div>
                    <div>
                      <div className="text-[var(--ink-muted)]">Reservado</div>
                      <div className="mt-1 text-base font-semibold">{stock.reservado}</div>
                    </div>
                    <div>
                      <div className="text-[var(--ink-muted)]">Disponível</div>
                      <div className="mt-1 text-base font-semibold">{stock.disponivel}</div>
                    </div>
                  </div>

                  <div className="mt-6 rounded border border-black/10 bg-[var(--surface)] p-3">
                    <div className="text-sm font-semibold">Quantidade manual</div>
                    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                      <input
                        className="w-full rounded border border-black/10 bg-white px-3 py-2 text-sm sm:w-[120px]"
                        type="number"
                        min={1}
                        value={manualQuantity}
                        onChange={(event) => setManualQuantity(Number(event.target.value))}
                      />
                      <select
                        className="rounded border border-black/10 bg-white px-3 py-2 text-sm"
                        value={manualLocation}
                        onChange={(event) => setManualLocation(event.target.value)}
                      >
                        <option value="">Sem localização</option>
                        {stock.depositos.map((deposito, index) => (
                          <option key={`${deposito.nome}-${index}`} value={deposito.nome}>
                            {deposito.nome}
                          </option>
                        ))}
                      </select>
                      <span className="text-xs text-[var(--ink-muted)]">
                        Use quantidade manual quando não selecionar depósitos.
                      </span>
                    </div>
                  </div>

                  <div className="mt-6">
                    <div className="text-sm font-semibold">Imprimir por depósito</div>
                    <div className="mt-3 grid grid-cols-[0.3fr_1.4fr_0.8fr_0.8fr_0.8fr] gap-4 border-b border-black/10 pb-2 text-xs font-semibold text-[var(--ink-muted)]">
                      <span>Usar</span>
                      <span>Depósito</span>
                      <span>Saldo</span>
                      <span>Reservado</span>
                      <span>Etiquetas</span>
                    </div>
                    <div className="mt-2 flex flex-col gap-2">
                      {stock.depositos.map((deposito, index) => (
                        <div
                          key={`${deposito.nome}-${index}`}
                          className="grid grid-cols-[0.3fr_1.4fr_0.8fr_0.8fr_0.8fr] items-center gap-4 border-b border-black/10 py-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={depositSelections[index]?.checked ?? false}
                            onChange={(event) =>
                              setDepositSelections((prev) => ({
                                ...prev,
                                [index]: {
                                  checked: event.target.checked,
                                  quantity: prev[index]?.quantity ?? Number(deposito.saldo ?? 0),
                                },
                              }))
                            }
                          />
                          <div>{deposito.nome}</div>
                          <div>{deposito.saldo}</div>
                          <div>{deposito.reservado}</div>
                          <input
                            className="w-full rounded border border-black/10 bg-white px-2 py-1 text-sm"
                            type="number"
                            min={0}
                            value={depositSelections[index]?.quantity ?? Number(deposito.saldo ?? 0)}
                            onChange={(event) =>
                              setDepositSelections((prev) => ({
                                ...prev,
                                [index]: {
                                  checked: prev[index]?.checked ?? false,
                                  quantity: Number(event.target.value),
                                },
                              }))
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="mt-4 text-sm text-[var(--ink-muted)]">Sem estoque disponível.</div>
              )}
            </>
          )}

          {printError ? <div className="mt-4 text-sm text-red-600">{printError}</div> : null}

          <div className="mt-5">
            <button
              className="rounded border border-blue-700 px-4 py-2 text-sm text-blue-700"
              onClick={handleGenerateLabels}
              disabled={!selectedProduct}
            >
              Imprimir etiquetas
            </button>
          </div>
        </div>
      </section>
    </>
  )
}
