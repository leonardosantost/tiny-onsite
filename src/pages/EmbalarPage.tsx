import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import LoadingOverlay from '../components/LoadingOverlay'
import { tinyAccountId, supabaseUrl } from '../config'
import { tinyFetch } from '../lib/tinyFetch'
import { formatCutoffDisplay } from '../utils/date'

export default function EmbalarPage() {
  const [pickListId, setPickListId] = useState('')
  const [pickListReady, setPickListReady] = useState(false)
  const [productCode, setProductCode] = useState('')
  const [labelCode, setLabelCode] = useState('')
  const [currentIndex, setCurrentIndex] = useState<number | null>(null)
  const [printMessage, setPrintMessage] = useState('')
  const [done, setDone] = useState(false)
  const [list, setList] = useState<any | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [packedItems, setPackedItems] = useState<number[]>([])
  const [successMessage, setSuccessMessage] = useState('')
  const [labelError, setLabelError] = useState(false)
  const [thumbByItemId, setThumbByItemId] = useState<Record<string, string>>({})
  const [gtinByItemId, setGtinByItemId] = useState<Record<string, string>>({})
  const [canPackToday, setCanPackToday] = useState(true)
  const [cutoffLabel, setCutoffLabel] = useState<string | null>(null)
  const skuInputRef = useRef<HTMLInputElement | null>(null)
  const listInputRef = useRef<HTMLInputElement | null>(null)
  const labelInputRef = useRef<HTMLInputElement | null>(null)

  const items = Array.isArray(list?.pick_list_items) ? list.pick_list_items : []
  const currentProduct = currentIndex !== null ? items[currentIndex] : null
  const packedCount = packedItems.length
  const totalCount = items.length
  const progressPercent = totalCount ? Math.round((packedCount / totalCount) * 100) : 0

  const getDateKeyFromValue = (value?: string) => {
    if (!value) return null
    const match = value.match(/(\d{4})-(\d{2})-(\d{2})/)
    if (!match) return null
    const [, year, month, day] = match
    return Number(year) * 10000 + Number(month) * 100 + Number(day)
  }

  useEffect(() => {
    if (pickListReady) {
      skuInputRef.current?.focus()
    }
  }, [pickListReady])

  useEffect(() => {
    if (!pickListReady) {
      listInputRef.current?.focus()
    }
  }, [pickListReady])

  const handlePickListSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = pickListId.trim()
    if (!trimmed || !supabaseUrl) return
    setLoading(true)
    setError(null)
    setPickListReady(false)
    setList(null)
    setDone(false)
    setCurrentIndex(null)
    setPackedItems([])
    setSuccessMessage('')
    setPrintMessage('')
    setThumbByItemId({})
    setGtinByItemId({})
    setCanPackToday(true)
    setCutoffLabel(null)
    try {
      const response = await tinyFetch(`${supabaseUrl}/functions/v1/tiny-picklists?id=${trimmed}`)
      if (!response.ok) {
        throw new Error(`Lista não encontrada: ${response.status}`)
      }
      const data = await response.json()
      setList(data)
      const cutoffRaw = data?.cutoff_at
      if (cutoffRaw) {
        const now = new Date()
        const todayKey = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate()
        const cutoffKey = getDateKeyFromValue(cutoffRaw)
        setCanPackToday(!cutoffKey || cutoffKey === todayKey)
        setCutoffLabel(formatCutoffDisplay(cutoffRaw).label)
      } else {
        setCanPackToday(true)
        setCutoffLabel(null)
      }
      if (Array.isArray(data?.pick_list_items)) {
        const packed = data.pick_list_items
          .map((item: any, index: number) => (item?.packed_at ? index : null))
          .filter((value: number | null) => value !== null) as number[]
        setPackedItems(packed)
        if (packed.length === data.pick_list_items.length && data.pick_list_items.length > 0) {
          setDone(true)
        }
      } else {
        setPackedItems([])
      }
      setSuccessMessage('')
      setPickListReady(true)
      try {
        const inventoryResponse = await tinyFetch(
          `${supabaseUrl}/functions/v1/tiny-inventory?account_id=${tinyAccountId}&details=1`,
        )
        if (inventoryResponse.ok) {
          const inventoryData = await inventoryResponse.json()
          const inventoryItems = Array.isArray(inventoryData?.results) ? inventoryData.results : []
          const map: Record<string, string> = {}
          const gtinMap: Record<string, string> = {}
          for (const item of inventoryItems) {
            const thumb =
              item?.thumbnail || item?.pictures?.[0]?.secure_url || item?.pictures?.[0]?.url || null
            if (!thumb) continue
            if (item?.id) {
              map[String(item.id)] = thumb
            }
            if (item?.seller_sku) {
              map[String(item.seller_sku)] = thumb
            }
            const attrs = Array.isArray(item?.attributes) ? item.attributes : []
            const attrSku = attrs.find((attr: any) => attr?.id === 'SELLER_SKU')
            if (attrSku?.value_name) {
              map[String(attrSku.value_name)] = thumb
            }
            const attrGtin =
              attrs.find((attr: any) => attr?.id === 'GTIN') ||
              attrs.find((attr: any) => attr?.id === 'EAN')
            if (attrGtin?.value_name) {
              const value = String(attrGtin.value_name)
              if (item?.id) {
                gtinMap[String(item.id)] = value
              }
              if (item?.seller_sku) {
                gtinMap[String(item.seller_sku)] = value
              }
              if (attrSku?.value_name) {
                gtinMap[String(attrSku.value_name)] = value
              }
            }
          }
          setThumbByItemId(map)
          setGtinByItemId(gtinMap)
        }
      } catch {
        setThumbByItemId({})
        setGtinByItemId({})
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar lista.')
    } finally {
      setLoading(false)
    }
  }

  const handleCancelPacking = () => {
    setPickListId('')
    setPickListReady(false)
    setList(null)
    setProductCode('')
    setLabelCode('')
    setCurrentIndex(null)
    setPackedItems([])
    setSuccessMessage('')
    setPrintMessage('')
    setDone(false)
    setThumbByItemId({})
    setGtinByItemId({})
    setError(null)
    setCanPackToday(true)
    setCutoffLabel(null)
  }

  const processProductCode = (code: string) => {
    if (!canPackToday) {
      setError(
        `Embalar somente no dia da coleta${cutoffLabel ? ` (corte: ${cutoffLabel})` : ''}.`,
      )
      return
    }
    const normalized = code.trim()
    if (!normalized) return
    const index = items.findIndex((item: any, idx: number) => {
      if (packedItems.includes(idx)) return false
      const sku = String(item?.sku ?? '')
      const itemId = String(item?.item_id ?? '')
      const gtin = sku ? gtinByItemId[sku] : itemId ? gtinByItemId[itemId] : ''
      const codes = [sku, itemId, String(gtin ?? '')]
        .flatMap((code) => code.split(','))
        .map((code) => code.trim().toLowerCase())
        .filter(Boolean)
      return codes.includes(normalized.toLowerCase())
    })
    if (index === -1) {
      setError('Item não encontrado na lista de coleta.')
      return
    }
    if (packedItems.includes(index)) {
      setError('Item já embalado nesta lista.')
      return
    }
    setError(null)
    setSuccessMessage('')
    setCurrentIndex(index)
    setPrintMessage(
      'Imprimindo automaticamente: etiqueta de endereço, nota fiscal. Embale a caixa e escaneie a etiqueta de endereço',
    )
    setProductCode('')
    const selectedItem = items[index]
    handlePrintLabel(selectedItem?.shipment_id)
    setTimeout(() => labelInputRef.current?.focus(), 0)
  }

  const handleProductSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    processProductCode(productCode)
  }

  const handleLabelSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canPackToday) {
      setError(
        `Embalar somente no dia da coleta${cutoffLabel ? ` (corte: ${cutoffLabel})` : ''}.`,
      )
      return
    }
    if (!labelCode.trim()) return
    let hasMismatch = false
    if (currentProduct?.shipment_id) {
      const expected = String(currentProduct.shipment_id)
      if (!labelCode.includes(expected)) {
        hasMismatch = true
      }
    }
    setLabelError(hasMismatch)
    setLabelCode('')
    setPrintMessage('')
    setError(hasMismatch ? 'Etiqueta não corresponde ao envio deste item. Verifique o pacote.' : null)
    if (currentIndex === null) return
    const updatedPacked = packedItems.includes(currentIndex)
      ? packedItems
      : [...packedItems, currentIndex]
    setPackedItems(updatedPacked)
    setSuccessMessage('Etiqueta validada. Próximo item liberado.')

    const item = items[currentIndex]
    if (supabaseUrl && list?.list_code && item?.id) {
      tinyFetch(`${supabaseUrl}/functions/v1/tiny-picklists`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          list_code: list.list_code,
          item_id: item.id,
          packed_at: new Date().toISOString(),
        }),
      }).catch(() => null)
    }

    const nextIndex = items.findIndex((_: any, idx: number) => !updatedPacked.includes(idx))
    if (nextIndex === -1) {
      setDone(true)
      setCurrentIndex(null)
      return
    }
    setCurrentIndex(null)
    setProductCode('')
    setTimeout(() => skuInputRef.current?.focus(), 0)
  }

  const handlePrintLabel = async (shipmentId?: string | number | null) => {
    const resolvedShipmentId = shipmentId ?? currentProduct?.shipment_id
    if (!resolvedShipmentId || !supabaseUrl) {
      setError('Envio não encontrado para impressão.')
      return
    }
    setError(null)
    const response = await tinyFetch(
      `${supabaseUrl}/functions/v1/tiny-print-label?account_id=${tinyAccountId}&shipment_id=${resolvedShipmentId}`,
    )
    if (!response.ok) {
      setError(`Falha ao imprimir etiqueta: ${response.status}`)
      return
    }
    const data = await response.json()
    const url = Array.isArray(data?.urls) ? data.urls[0] : null
    if (!url) {
      setError('Etiqueta não encontrada.')
      return
    }
    window.open(url, '_blank')
  }

  return (
    <>
      {loading ? <LoadingOverlay label="Carregando lista..." /> : null}
      <section className="px-4 pt-6 sm:px-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Embalar</h1>
          </div>
        </div>
      </section>

      <section className="px-4 pt-6 pb-10 sm:px-8">
        <div className="rounded border border-black/10 bg-white p-4">
          {done ? (
            <div className="mb-4 rounded border border-green-300 bg-green-50 px-4 py-2 text-sm text-green-700">
              Ótimo! Todos os pedidos foram embalados para esta lista de coleta
            </div>
          ) : null}
          {!pickListReady ? (
            <form onSubmit={handlePickListSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                className="w-full rounded border border-blue-500 px-3 py-2 text-sm"
                placeholder="Escanear ou inserir ID da lista de coleta"
                value={pickListId}
                onChange={(event) => setPickListId(event.target.value)}
                ref={listInputRef}
              />
            </form>
          ) : null}
          {loading ? <div className="mt-3 text-sm text-[var(--ink-muted)]">Carregando lista...</div> : null}
          {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}

          {pickListReady ? (
            <div className="mt-6 border-t border-black/10 pt-6">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="text-sm">
                  <div className="text-[var(--ink-muted)]">ID da lista de seleção</div>
                  <div className="mt-1 text-lg font-semibold">{list?.list_code ?? '-'}</div>
                  <Link className="mt-1 text-sm text-blue-700" to={`/pedidos/coletar/${list?.list_code ?? ''}`}>
                    Visualizar detalhes
                  </Link>
                </div>
                <button className="text-sm text-blue-700" onClick={handleCancelPacking}>
                  Cancelar o empacotamento
                </button>
              </div>
              {!canPackToday ? (
                <div className="mt-4 rounded border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
                  Esta lista é para {cutoffLabel ?? 'data futura'}. Deixe os itens separados e embale somente no dia da coleta.
                </div>
              ) : null}

              <form onSubmit={handleProductSubmit} className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  className="w-full rounded border border-blue-500 px-3 py-2 text-sm"
                  placeholder="Digitalizar ou inserir código SKU, GTIN/EAN ou ID do item"
                  value={productCode}
                  onChange={(event) => setProductCode(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      processProductCode(event.currentTarget.value)
                    }
                  }}
                  disabled={!canPackToday}
                  ref={skuInputRef}
                />
              </form>

              {successMessage ? (
                <div className="mt-3 rounded border border-green-300 bg-green-50 px-4 py-2 text-sm text-green-700">
                  {successMessage}
                </div>
              ) : null}

              {totalCount ? (
                <div className="mt-4 flex items-center justify-between text-sm text-[var(--ink-muted)]">
                  <div className="mr-4 flex-1 rounded bg-gray-200">
                    <div className="h-1 rounded bg-blue-600" style={{ width: `${progressPercent}%` }} />
                  </div>
                  <div>
                    {packedCount} / {totalCount} itens
                  </div>
                </div>
              ) : null}

              {currentProduct ? (
                <>
                  <div className="mt-6 grid gap-6 border border-black/10 bg-[var(--surface)] p-4 sm:grid-cols-[120px_1fr]">
                    <div className="flex h-24 w-24 items-center justify-center rounded border border-black/10 bg-white text-xs text-[var(--ink-muted)]">
                      {(() => {
                        const sku = currentProduct?.sku ?? ''
                        const itemId = currentProduct?.item_id ?? ''
                        const thumb = sku ? thumbByItemId[String(sku)] : itemId ? thumbByItemId[String(itemId)] : null
                        if (thumb) {
                          return (
                            <img src={thumb} alt={currentProduct?.title ?? 'Produto'} className="h-full w-full object-contain" />
                          )
                        }
                        return 'Imagem'
                      })()}
                    </div>
                    <div className="text-sm">
                      <div className="flex flex-wrap items-center gap-6">
                        <div>
                          <div className="text-xs text-[var(--ink-muted)]">ID do Pedido</div>
                          <div className="font-semibold">{currentProduct?.order_id ?? '-'}</div>
                        </div>
                        <span className="rounded border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-700">
                          Tiny ERP
                        </span>
                      </div>
                      <p className="mt-4 font-semibold text-blue-700">{currentProduct?.title ?? '-'}</p>
                      <div className="mt-2 text-[var(--ink-muted)]">SKU: {currentProduct?.sku ?? '-'}</div>
                      <div className="mt-1 text-[var(--ink-muted)]">
                        GTIN/EAN:{' '}
                        {(() => {
                          const sku = currentProduct?.sku ?? ''
                          const itemId = currentProduct?.item_id ?? ''
                          return sku
                            ? gtinByItemId[String(sku)] ?? '-'
                            : itemId
                              ? gtinByItemId[String(itemId)] ?? '-'
                              : '-'
                        })()}
                      </div>
                      <div className="mt-1 text-[var(--ink-muted)]">
                        Qtd: {currentProduct?.quantity ?? 0} de {currentProduct?.quantity ?? 0}
                      </div>
                    </div>
                  </div>

                  {printMessage ? (
                    <div className="mt-4 rounded border border-green-300 bg-green-50 px-4 py-2 text-sm text-green-700">
                      Imprimindo automaticamente... Embale o pedido e escaneie a etiqueta
                      de endereço.
                    </div>
                  ) : null}

                  <form
                    onSubmit={handleLabelSubmit}
                    className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center"
                  >
                    <input
                      className={`w-full rounded border px-3 py-2 text-sm ${
                        labelError ? 'border-red-500' : 'border-blue-500'
                      }`}
                      placeholder="Escanear ou inserir etiqueta de endereço"
                      value={labelCode}
                      onChange={(event) => setLabelCode(event.target.value)}
                      disabled={!canPackToday}
                      ref={labelInputRef}
                    />
                    {labelError ? (
                      <span className="text-sm text-red-600">Etiqueta inválida para este envio.</span>
                    ) : null}
                  </form>

                  <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-blue-700">
                    <button onClick={() => handlePrintLabel(currentProduct?.shipment_id)}>
                      Imprimir etiquetas novamente
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
    </>
  )
}
