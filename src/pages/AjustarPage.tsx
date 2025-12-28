import { useEffect, useRef, useState } from 'react'
import LoadingOverlay from '../components/LoadingOverlay'
import { tinyAccountId, supabaseUrl } from '../config'
import { tinyFetch } from '../lib/tinyFetch'
import { extractTinyProductEntries, getTinyProductCodes, getTinyProductSku } from '../lib/tinyProducts'

const bins = ['A1', 'A2', 'A3']
const actions = [
  { value: 'excluir', label: 'Excluir' },
  { value: 'mover', label: 'Mover' },
  { value: 'danos', label: 'Danos' },
  { value: 'perda', label: 'Perda' },
]

export default function AjustarPage() {
  const [action, setAction] = useState('excluir')
  const [sku, setSku] = useState('')
  const [skuConfirmed, setSkuConfirmed] = useState(false)
  const [item, setItem] = useState<any | null>(null)
  const [resolvedSku, setResolvedSku] = useState('')
  const [quantity, setQuantity] = useState('')
  const [fromBin, setFromBin] = useState('')
  const [toBin, setToBin] = useState('')
  const [binTotals, setBinTotals] = useState<Record<string, number>>({})
  const [pageLoading, setPageLoading] = useState(false)
  const [skuLoading, setSkuLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<any[]>([])
  const skuInputRef = useRef<HTMLInputElement | null>(null)
  const qtyInputRef = useRef<HTMLInputElement | null>(null)
  const fromBinInputRef = useRef<HTMLSelectElement | null>(null)
  const binInputRef = useRef<HTMLSelectElement | null>(null)

  useEffect(() => {
    skuInputRef.current?.focus()
  }, [])

  const loadHistory = async (skuValue?: string, showLoading = false) => {
    if (!supabaseUrl) return
    if (showLoading) {
      setPageLoading(true)
    }
    try {
      const response = await tinyFetch(
        `${supabaseUrl}/functions/v1/tiny-adjustments${skuValue ? `?sku=${skuValue}` : ''}`,
      )
      if (!response.ok) return
      const data = await response.json()
      setHistory(Array.isArray(data) ? data : [])
    } finally {
      if (showLoading) {
        setPageLoading(false)
      }
    }
  }

  const resolveSkuFromInventory = async (code: string) => {
    if (!supabaseUrl) return code
    const normalized = code.trim()
    const searchBy = /^[0-9]+$/.test(normalized) ? 'gtin' : 'sku'
    const params = new URLSearchParams({
      account_id: tinyAccountId,
      search: normalized,
      search_by: searchBy,
      limit: '1',
      offset: '0',
    })
    const response = await tinyFetch(`${supabaseUrl}/functions/v1/tiny-inventory?${params.toString()}`)
    if (!response.ok) return code
    const data = await response.json()
    const items = extractTinyProductEntries(data)
    const itemEntry = items[0]
    if (!itemEntry) return code
    const codes = getTinyProductCodes(itemEntry).map((value) => value.toLowerCase())
    if (codes.includes(normalized.toLowerCase())) {
      return getTinyProductSku(itemEntry) ?? code
    }
    return code
  }

  const loadBinTotals = async (skuValues: string[]) => {
    if (!supabaseUrl) return
    const totals: Record<string, number> = {}
    for (const skuValue of skuValues.filter(Boolean)) {
      const response = await tinyFetch(`${supabaseUrl}/functions/v1/tiny-bins?sku=${skuValue}`)
      if (!response.ok) {
        continue
      }
      const data = await response.json()
      for (const entry of Array.isArray(data) ? data : []) {
        const bin = entry?.bin
        const qty = Number(entry?.quantity ?? 0)
        if (!bin) continue
        totals[bin] = (totals[bin] ?? 0) + (Number.isFinite(qty) ? qty : 0)
      }
    }
    setBinTotals(totals)
  }

  const handleSkuSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!sku.trim()) {
      setError('Informe o SKU.')
      return
    }
    setSkuLoading(true)
    setError(null)
    setSkuConfirmed(false)
    setItem(null)
    setQuantity('')
    setFromBin('')
    setToBin('')
    setResolvedSku('')
    const trimmed = sku.trim()
    resolveSkuFromInventory(trimmed)
      .then((lookupSku) => {
        setResolvedSku(String(lookupSku))
        return tinyFetch(
          `${supabaseUrl}/functions/v1/tiny-item-lookup?account_id=${tinyAccountId}&sku=${lookupSku}`,
        )
      })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`SKU não encontrado: ${response.status}`)
        }
        const data = await response.json()
        const items = Array.isArray(data?.items) ? data.items : []
        if (!items.length) {
          throw new Error('SKU não encontrado.')
        }
        const primaryItem = items[0]
        setItem(primaryItem)
        setSkuConfirmed(true)
        const lookup = resolvedSku || trimmed
        loadHistory(lookup, true)
        const candidateSkus = new Set<string>([
          lookup,
          primaryItem?.seller_sku ?? '',
          primaryItem?.id ?? '',
        ])
        loadBinTotals(Array.from(candidateSkus))
        setTimeout(() => qtyInputRef.current?.focus(), 0)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Falha ao buscar SKU.')
      })
      .finally(() => {
        setSkuLoading(false)
      })
  }

  const handleQuantitySubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const qty = Number(quantity)
    if (!Number.isFinite(qty) || qty <= 0) {
      setError('Informe uma quantidade válida.')
      return
    }
    setError(null)
    setTimeout(() => {
      if (action === 'mover') {
        fromBinInputRef.current?.focus()
      } else {
        binInputRef.current?.focus()
      }
    }, 0)
  }

  const handleBinSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    handleSubmit()
  }

  const handleSubmit = async () => {
    const qty = Number(quantity)
    const skuValue = resolvedSku || sku.trim()
    if (!skuValue || !Number.isFinite(qty) || qty <= 0) {
      setError('Informe SKU e quantidade válida.')
      return
    }
    if (action === 'mover' && (!fromBin || !toBin)) {
      setError('Selecione o bin de origem e destino.')
      return
    }
    if (action !== 'mover' && !toBin) {
      setError('Selecione o bin.')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const response = await tinyFetch(`${supabaseUrl}/functions/v1/tiny-adjust-stock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: tinyAccountId,
          sku: skuValue,
          quantity: qty,
          action,
          from_bin:
            action === 'mover'
              ? fromBin === '__sem_bin__'
                ? 'Sem bin'
                : fromBin || null
              : toBin || null,
          to_bin: action === 'mover' ? toBin || null : null,
          note: null,
        }),
      })
      if (!response.ok) {
        throw new Error(`Erro ao registrar ajuste: ${response.status}`)
      }
      await loadHistory(skuValue)
      setQuantity('')
      setFromBin('')
      setToBin('')
      setResolvedSku('')
      setTimeout(() => qtyInputRef.current?.focus(), 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao registrar ajuste.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {pageLoading ? <LoadingOverlay label="Carregando histórico..." /> : null}
      {skuLoading ? <LoadingOverlay label="Carregando SKU..." /> : null}
      {loading ? <LoadingOverlay label="Registrando ajuste..." /> : null}
      <section className="px-4 pt-6 sm:px-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Ajustar</h1>
          </div>
        </div>
      </section>

      <section className="px-4 pt-6 pb-10 sm:px-8">
        <div className="rounded border border-black/10 bg-white p-4">
          <div className="flex flex-wrap gap-4 text-sm">
            {actions.map((opt) => (
              <label key={opt.value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="action"
                  value={opt.value}
                  checked={action === opt.value}
                  onChange={() => setAction(opt.value)}
                />
                {opt.label}
              </label>
            ))}
          </div>

          <form onSubmit={handleSkuSubmit} className="mt-4">
            <input
              className="w-full rounded border border-black/10 px-3 py-2 text-sm"
              placeholder="Digite ou escaneie o SKU, GTIN/EAN ou ID do item"
              value={sku}
              onChange={(event) => {
                setSku(event.target.value)
                if (skuConfirmed) {
                  setSkuConfirmed(false)
                }
                if (resolvedSku) {
                  setResolvedSku('')
                }
                if (item) {
                  setItem(null)
                }
                if (Object.keys(binTotals).length) {
                  setBinTotals({})
                }
              }}
              ref={skuInputRef}
            />
          </form>

          {skuConfirmed ? (
            <>
              {item ? (
                <div className="mt-4 grid gap-4 rounded border border-black/10 bg-[var(--surface)] p-4 sm:grid-cols-[120px_1fr]">
                  <div className="flex h-24 w-24 items-center justify-center rounded border border-black/10 bg-white text-xs text-[var(--ink-muted)]">
                    {item.thumbnail ? (
                      <img src={item.thumbnail} alt={item.title} className="h-full w-full object-contain" />
                    ) : (
                      'Thumb'
                    )}
                  </div>
                  <div className="text-sm">
                    <div className="text-[var(--ink-muted)]">Título</div>
                    <div className="mt-1 text-lg font-semibold">{item.title}</div>
                    <div className="mt-2 text-[var(--ink-muted)]">SKU: {item.seller_sku ?? item.id}</div>
                    <div className="mt-2 text-[var(--ink-muted)]">
                      Estoque atual: {item.available_quantity ?? 0}
                    </div>
                  </div>
                </div>
              ) : null}
              <form onSubmit={handleQuantitySubmit} className="mt-4">
                <input
                  className="w-full rounded border border-black/10 px-3 py-2 text-sm"
                  placeholder="Quantidade"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  ref={qtyInputRef}
                />
              </form>
              {action === 'mover' ? (
              <form onSubmit={handleBinSubmit} className="mt-4">
                <select
                  className="w-full rounded border border-black/10 bg-white px-3 py-2 text-sm"
                  value={fromBin}
                  onChange={(event) => setFromBin(event.target.value)}
                  ref={fromBinInputRef}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        binInputRef.current?.focus()
                      }
                    }}
                >
                  <option value="">Selecione o bin de origem</option>
                  {bins
                    .filter((bin) => (binTotals[bin] ?? 0) > 0)
                    .map((bin) => (
                      <option key={bin} value={bin}>
                        {bin} ({binTotals[bin] ?? 0})
                      </option>
                    ))}
                  {(() => {
                    const totalInBins = bins.reduce((acc, bin) => acc + (binTotals[bin] ?? 0), 0)
                    const available = item?.available_quantity ?? 0
                    const unbinned = Math.max(0, available - totalInBins)
                    if (unbinned <= 0 && totalInBins > 0) {
                      return null
                    }
                    return (
                      <option value="__sem_bin__">Sem bin ({unbinned})</option>
                    )
                  })()}
                </select>
              </form>
            ) : null}
              <form onSubmit={handleBinSubmit} className="mt-4">
                <select
                  className="w-full rounded border border-black/10 bg-white px-3 py-2 text-sm"
                  value={toBin}
                  onChange={(event) => setToBin(event.target.value)}
                  ref={binInputRef}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      handleSubmit()
                    }
                  }}
                >
                  <option value="">
                    {action === 'mover' ? 'Selecione o bin de destino' : 'Selecione o bin'}
                  </option>
                  {bins.map((bin) => (
                    <option key={bin} value={bin}>
                      {bin} ({binTotals[bin] ?? 0})
                    </option>
                  ))}
                </select>
              </form>
            </>
          ) : null}

          {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}

          {skuConfirmed ? (
            <div className="mt-6 rounded border border-black/10 bg-white p-4">
              <h2 className="text-lg font-semibold">Histórico de ajustes</h2>
              <div className="mt-3 grid grid-cols-[1.2fr_1fr_0.8fr_0.8fr_1fr] gap-4 border-b border-black/10 pb-2 text-xs font-semibold text-[var(--ink-muted)]">
                <span>SKU</span>
                <span>Ação</span>
                <span>Quantidade</span>
                <span>Origem</span>
                <span>Destino</span>
              </div>
              <div className="mt-2 flex flex-col gap-2">
                {history.map((row) => (
                  <div
                    key={row.id}
                    className="grid grid-cols-[1.2fr_1fr_0.8fr_0.8fr_1fr] gap-4 border-b border-black/10 py-2 text-sm"
                  >
                    <div>{row.sku}</div>
                    <div>{row.action}</div>
                    <div>{row.quantity}</div>
                    <div>{row.from_bin ?? '-'}</div>
                    <div>{row.to_bin ?? '-'}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </>
  )
}
