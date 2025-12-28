import { useCallback, useEffect, useMemo, useState } from 'react'
import LoadingOverlay from '../components/LoadingOverlay'
import { tinyAccountId, supabaseUrl } from '../config'
import { tinyFetch } from '../lib/tinyFetch'
import { extractTinyProductEntries, getTinyProductGtin, getTinyProductSku, getTinyProductTitle } from '../lib/tinyProducts'

type ProductDetail = Record<string, any>

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

export default function InventarioEtiquetasPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [selectedProduct, setSelectedProduct] = useState<ProductDetail | null>(null)
  const [parentSlug, setParentSlug] = useState<string | null>(null)
  const [stock, setStock] = useState<StockData | null>(null)
  const [stockLoading, setStockLoading] = useState(false)
  const [manualQuantity, setManualQuantity] = useState(1)
  const [selectedDeposit, setSelectedDeposit] = useState('')
  const [includePrice, setIncludePrice] = useState(true)
  const [includeInstallments, setIncludeInstallments] = useState(true)
  const [useStockQuantity, setUseStockQuantity] = useState(false)
  const [printError, setPrintError] = useState<string | null>(null)
  const [priceListPrice, setPriceListPrice] = useState<number | string | null>(null)
  const [priceListLoading, setPriceListLoading] = useState(false)

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

  const resolveSearchBy = (value: string) => {
    const trimmed = value.trim()
    if (/^[0-9]+$/.test(trimmed)) return 'gtin'
    return 'sku'
  }

  const resolvePriceFromList = useCallback(async (product: ProductDetail) => {
    if (!supabaseUrl || !product?.id) return null
    const params = new URLSearchParams({
      account_id: tinyAccountId,
      mode: 'price-list',
      price_list_id: '272',
    })
    const response = await tinyFetch(`${supabaseUrl}/functions/v1/tiny-inventory?${params.toString()}`)
    if (!response.ok) {
      throw new Error(`Erro ao buscar lista de preços: ${response.status}`)
    }
    const data = await response.json()
    const rawExceptions = data?.excecoes ?? []
    const exceptions = Array.isArray(rawExceptions) ? rawExceptions : [rawExceptions]
    const skuValue = product?.sku ?? product?.codigo ?? getTinyProductSku(product) ?? null
    const normalizedSku = skuValue ? String(skuValue).trim().toLowerCase() : ''
    const match = exceptions.find(
      (entry: any) =>
        (product?.id != null && Number(entry?.idProduto) === Number(product.id)) ||
        (normalizedSku &&
          String(entry?.codigo ?? '')
            .trim()
            .toLowerCase() === normalizedSku),
    )
    if (!match) return null
    const promo = Number(match?.precoPromocional ?? 0)
    if (Number.isFinite(promo) && promo > 0) return promo
    const price = match?.preco ?? null
    return price != null ? Number(price) : null
  }, [supabaseUrl])

  const getPrintDateCode = () => {
    const now = new Date()
    const day = String(now.getDate()).padStart(2, '0')
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const year = String(now.getFullYear()).slice(-2)
    return `${day}${month}${year}`
  }

  const handleSearchSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabaseUrl) return
    const trimmed = searchTerm.trim()
    if (!trimmed) {
      setError('Informe um SKU ou GTIN para buscar.')
      return
    }
    setLoading(true)
    setError(null)
    setSelectedProduct(null)
    setStock(null)
    setPrintError(null)
    setManualQuantity(1)
    setParentSlug(null)
    setPriceListPrice(null)
    setStockLoading(true)
    try {
      const params = new URLSearchParams({
        account_id: tinyAccountId,
        search: trimmed,
        search_by: resolveSearchBy(trimmed),
        limit: '1',
        offset: '0',
      })
      const listResponse = await tinyFetch(
        `${supabaseUrl}/functions/v1/tiny-inventory?${params.toString()}`,
      )
      if (!listResponse.ok) {
        throw new Error(`Erro ao buscar produto: ${listResponse.status}`)
      }
      const listData = await listResponse.json()
      const entries = extractTinyProductEntries(listData)
      const first = entries[0]
      if (!first?.id) {
        throw new Error('Produto não encontrado.')
      }
      const productResponse = await tinyFetch(
        `${supabaseUrl}/functions/v1/tiny-inventory?account_id=${tinyAccountId}&product_id=${first.id}`,
      )
      if (!productResponse.ok) {
        throw new Error(`Erro ao buscar detalhes do produto: ${productResponse.status}`)
      }
      const productData = await productResponse.json()
      setSelectedProduct(productData)
      const parentId = productData?.produtoPai?.id
      if (parentId && !productData?.seo?.slug) {
        try {
          const parentResponse = await tinyFetch(
            `${supabaseUrl}/functions/v1/tiny-inventory?account_id=${tinyAccountId}&product_id=${parentId}`,
          )
          if (parentResponse.ok) {
            const parentData = await parentResponse.json()
            const slug = parentData?.seo?.slug ? String(parentData.seo.slug) : null
            setParentSlug(slug)
          }
        } catch {
          setParentSlug(null)
        }
      } else {
        setParentSlug(null)
      }
      const stockResponse = await tinyFetch(
        `${supabaseUrl}/functions/v1/tiny-inventory?account_id=${tinyAccountId}&mode=stock&product_id=${first.id}`,
        { cache: 'no-store' },
      )
      if (!stockResponse.ok) {
        throw new Error(`Erro ao buscar estoque: ${stockResponse.status}`)
      }
      const stockPayload = await stockResponse.json()
      const parsed = parseStock(stockPayload)
      setStock(parsed)
      if (parsed?.depositos?.length) {
        const preferred =
          parsed.depositos.find((deposito) => deposito.nome === 'Teixeira de Freitas / BA') ??
          parsed.depositos[0]
        setSelectedDeposit(preferred?.nome ?? '')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao buscar produto.')
    } finally {
      setLoading(false)
      setStockLoading(false)
    }
  }

  const productTitle = selectedProduct ? getTinyProductTitle(selectedProduct) : '-'
  const productSku = selectedProduct ? getTinyProductSku(selectedProduct) : null
  const productGtin = selectedProduct ? getTinyProductGtin(selectedProduct) : null
  const productBrand = selectedProduct?.marca?.nome ? String(selectedProduct.marca.nome) : null
  const productLocation = selectedProduct?.estoque?.localizacao ?? null
  const productEntryDate = getPrintDateCode()
  const productSlug = selectedProduct?.seo?.slug ? String(selectedProduct.seo.slug) : null
  const resolvedSlug = productSlug ?? parentSlug
  const productUrl = resolvedSlug ? `https://teixeiramilitar.com.br/products/${resolvedSlug}` : null
  const productPrice = selectedProduct?.precos?.precoPromocional ?? selectedProduct?.precos?.preco ?? null
  const displayPrice = includePrice ? priceListPrice ?? null : productPrice
  const productThumb =
    Array.isArray(selectedProduct?.anexos) && selectedProduct.anexos.length
      ? selectedProduct.anexos.find((entry: any) => entry?.url)?.url ?? null
      : null

  const selectedDepositData = useMemo(() => {
    if (!stock?.depositos?.length || !selectedDeposit) return null
    return stock.depositos.find((deposito) => deposito.nome === selectedDeposit) ?? null
  }, [selectedDeposit, stock?.depositos])

  useEffect(() => {
    if (!useStockQuantity) return
    if (selectedDepositData) {
      setManualQuantity(Number(selectedDepositData.saldo ?? 0))
    }
  }, [selectedDepositData, useStockQuantity])
  const formatPriceBRL = (value: number | string | null) => {
    if (value == null) return null
    const numeric = typeof value === 'number' ? value : Number(String(value).replace(',', '.'))
    if (!Number.isFinite(numeric)) return null
    return `R$ ${numeric.toFixed(2).replace('.', ',')}`
  }

  useEffect(() => {
    if (!includePrice || !selectedProduct?.id) {
      setPriceListPrice(null)
      setPriceListLoading(false)
      return
    }
    let isActive = true
    setPriceListLoading(true)
    resolvePriceFromList(selectedProduct)
      .then((value) => {
        if (isActive) setPriceListPrice(value)
      })
      .catch(() => {
        if (isActive) setPriceListPrice(null)
      })
      .finally(() => {
        if (isActive) setPriceListLoading(false)
      })
    return () => {
      isActive = false
    }
  }, [includePrice, resolvePriceFromList, selectedProduct?.id])

  const handleGenerateLabels = async () => {
    if (!selectedProduct) {
      setPrintError('Selecione um produto para imprimir etiquetas.')
      return
    }

    const skuValue = getTinyProductSku(selectedProduct)
    const gtinValueRaw = getTinyProductGtin(selectedProduct)
    const gtinValue =
      gtinValueRaw && !String(gtinValueRaw).toLowerCase().includes('sem gtin') ? gtinValueRaw : null
    const codeValue = gtinValue || skuValue || ''
    if (!codeValue) {
      setPrintError('Produto sem SKU/GTIN para gerar etiqueta.')
      return
    }

    let rawPrice = priceListPrice
    if (includePrice && selectedProduct?.id) {
      try {
        if (rawPrice == null) {
          rawPrice = await resolvePriceFromList(selectedProduct)
        }
      } catch (err) {
        setPrintError(err instanceof Error ? err.message : 'Falha ao buscar preço do produto.')
        return
      }
    }

    const priceValue = formatPriceBRL(rawPrice)
    if (includePrice && !priceValue) {
      setPrintError('Produto sem preço para inserir na etiqueta.')
      return
    }

    const labels: Array<{
      title: string
      sku: string | null
      gtin: string | null
      brand: string | null
      location: string | null
      entryDate: string | null
      productUrl: string | null
      code: string
      codeLabel: string
      price: string | null
      showInstallments: boolean
    }> = []

    const title = getTinyProductTitle(selectedProduct)
    const brand = selectedProduct?.marca?.nome ? String(selectedProduct.marca.nome) : null
    const location = selectedProduct?.estoque?.localizacao || null
    const entryDate = getPrintDateCode()
    const slug = selectedProduct?.seo?.slug ? String(selectedProduct.seo.slug) : parentSlug
    const productUrl = slug ? `https://teixeiramilitar.com.br/products/${slug}` : null

    const qty = Math.max(0, Math.floor(manualQuantity || 0))
    if (!qty) {
      setPrintError('Informe uma quantidade válida para imprimir.')
      return
    }
    for (let i = 0; i < qty; i += 1) {
      labels.push({
        title,
        sku: skuValue,
        gtin: gtinValue,
        brand,
        location,
        entryDate,
        productUrl,
        code: codeValue,
        codeLabel: gtinValue ? 'GTIN' : 'SKU',
        price: includePrice ? priceValue : null,
        showInstallments: includeInstallments,
      })
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
      {loading ? <LoadingOverlay label="Buscando produto..." /> : null}
      <section className="px-4 pt-6 sm:px-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Etiquetas</h1>
            <p className="mt-2 text-sm text-[var(--ink-muted)]">
              Insira SKU ou GTIN e gere etiquetas com os dados completos do produto.
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
                placeholder="Digite o SKU ou GTIN do produto"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
              <button
                className="rounded border border-blue-700 px-3 py-2 text-sm text-blue-700"
                type="submit"
              >
                Buscar
              </button>
            </div>
          </form>
          {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
          {!selectedProduct ? (
            <div className="mt-3 text-sm text-[var(--ink-muted)]">
              Informe um SKU ou GTIN e pressione Enter para buscar o produto.
            </div>
          ) : (
            <div className="mt-3 text-sm text-[var(--ink-muted)]">
              Produto carregado: <span className="font-semibold text-[var(--ink)]">{productTitle}</span>
            </div>
          )}
        </div>

        <div className="mt-6 rounded border border-black/10 bg-white p-4">
          <h2 className="text-lg font-semibold">Etiqueta do produto</h2>
          {!selectedProduct ? (
            <div className="mt-2 text-sm text-[var(--ink-muted)]">
              Busque um SKU ou GTIN para visualizar os dados da etiqueta.
            </div>
          ) : (
            <>
              <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-24 w-24 items-center justify-center rounded border border-black/10 bg-white text-xs text-[var(--ink-muted)]">
                    {productThumb ? (
                      <img src={productThumb} alt={productTitle} className="h-full w-full object-contain" />
                    ) : (
                      'Thumb'
                    )}
                  </div>
                  <div>
                    <div className="text-[var(--ink-muted)]">Produto</div>
                    <div className="mt-1 text-base font-semibold">{productTitle}</div>
                  </div>
                </div>
                <div>
                  <div className="text-[var(--ink-muted)]">SKU</div>
                  <div className="mt-1">{productSku ?? '-'}</div>
                </div>
                <div>
                  <div className="text-[var(--ink-muted)]">GTIN</div>
                  <div className="mt-1">{productGtin ?? '-'}</div>
                </div>
                <div>
                  <div className="text-[var(--ink-muted)]">Marca</div>
                  <div className="mt-1">{productBrand ?? '-'}</div>
                </div>
                <div>
                  <div className="text-[var(--ink-muted)]">Localização</div>
                  <div className="mt-1">{productLocation ?? manualLocation ?? '-'}</div>
                </div>
                <div>
                  <div className="text-[var(--ink-muted)]">Entrada (lote)</div>
                  <div className="mt-1">{productEntryDate ?? '-'}</div>
                </div>
                <div className="sm:col-span-3">
                  <div className="text-[var(--ink-muted)]">URL do produto</div>
                  <div className="mt-1 break-all text-blue-700">{productUrl ?? '-'}</div>
                </div>
                <div>
                  <div className="text-[var(--ink-muted)]">Preço</div>
                  <div className="mt-1">
                    {priceListLoading && includePrice
                      ? 'Carregando...'
                      : formatPriceBRL(displayPrice) ?? '-'}
                  </div>
                </div>
              </div>

              {stockLoading ? (
                <div className="mt-4 text-sm text-[var(--ink-muted)]">Carregando estoque...</div>
              ) : stock ? (
                <>
                  <div className="mt-4 rounded border border-black/10 bg-[var(--surface)] p-3">
                    <div className="text-sm font-semibold">Depósito</div>
                    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                      <select
                        className="rounded border border-black/10 bg-white px-3 py-2 text-sm"
                        value={selectedDeposit}
                        onChange={(event) => setSelectedDeposit(event.target.value)}
                      >
                        <option value="">Entrada manual (sem depósito)</option>
                        {stock.depositos.map((deposito, index) => (
                          <option key={`${deposito.nome}-${index}`} value={deposito.nome}>
                            {deposito.nome}
                          </option>
                        ))}
                      </select>
                      <span className="text-xs text-[var(--ink-muted)]">
                        Selecione apenas quando quiser usar um depósito específico.
                      </span>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                    <div>
                      <div className="text-[var(--ink-muted)]">Saldo</div>
                      <div className="mt-1 text-base font-semibold">
                        {selectedDepositData ? selectedDepositData.saldo : '-'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[var(--ink-muted)]">Reservado</div>
                      <div className="mt-1 text-base font-semibold">
                        {selectedDepositData ? selectedDepositData.reservado : '-'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[var(--ink-muted)]">Disponível</div>
                      <div className="mt-1 text-base font-semibold">
                        {selectedDepositData ? selectedDepositData.disponivel : '-'}
                      </div>
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
                      <label className="flex items-center gap-2 text-xs text-[var(--ink-muted)]">
                        <input
                          type="checkbox"
                          checked={useStockQuantity}
                          onChange={(event) => {
                            const checked = event.target.checked
                            setUseStockQuantity(checked)
                            if (checked && selectedDepositData) {
                              setManualQuantity(Number(selectedDepositData.saldo ?? 0))
                            }
                          }}
                          disabled={!selectedDepositData}
                        />
                        Usar saldo do depósito selecionado
                      </label>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-2 text-sm">
                    <input
                      id="include-price"
                      type="checkbox"
                      checked={includePrice}
                      onChange={(event) => setIncludePrice(event.target.checked)}
                    />
                    <label htmlFor="include-price">Inserir preço na etiqueta</label>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    <input
                      id="include-installments"
                      type="checkbox"
                      checked={includeInstallments}
                      onChange={(event) => setIncludeInstallments(event.target.checked)}
                      disabled={!includePrice}
                    />
                    <label htmlFor="include-installments">Mostrar parcelamento</label>
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
              onClick={() => void handleGenerateLabels()}
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
