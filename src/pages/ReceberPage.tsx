import { useEffect, useRef, useState } from 'react'
import LoadingOverlay from '../components/LoadingOverlay'
import { mlAccountId, supabaseUrl } from '../config'

const bins = ['A1', 'A2', 'A3']

export default function ReceberPage() {
  const [sku, setSku] = useState('')
  const [item, setItem] = useState<any | null>(null)
  const [quantity, setQuantity] = useState('')
  const [qtyConfirmed, setQtyConfirmed] = useState(false)
  const [selectedBin, setSelectedBin] = useState('')
  const [resolvedSku, setResolvedSku] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [binsLog, setBinsLog] = useState<any[]>([])
  const skuInputRef = useRef<HTMLInputElement | null>(null)
  const qtyInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    skuInputRef.current?.focus()
  }, [])

  const loadBins = async (skuValue: string) => {
    if (!supabaseUrl) return
    const response = await fetch(`${supabaseUrl}/functions/v1/ml-bins?sku=${skuValue}`)
    if (!response.ok) return
    const data = await response.json()
    setBinsLog(Array.isArray(data) ? data : [])
  }

  const resolveSkuFromInventory = async (code: string) => {
    if (!supabaseUrl) return code
    const response = await fetch(`${supabaseUrl}/functions/v1/ml-inventory?account_id=${mlAccountId}&details=1`)
    if (!response.ok) return code
    const data = await response.json()
    const items = Array.isArray(data?.results) ? data.results : []
    const normalized = code.trim().toLowerCase()
    for (const itemEntry of items) {
      const attrs = Array.isArray(itemEntry?.attributes) ? itemEntry.attributes : []
      const attrSku = attrs.find((attr: any) => attr?.id === 'SELLER_SKU')
      const attrGtin =
        attrs.find((attr: any) => attr?.id === 'GTIN') || attrs.find((attr: any) => attr?.id === 'EAN')
      const codes = [
        attrSku?.value_name,
        itemEntry?.seller_sku,
        itemEntry?.seller_custom_field,
        itemEntry?.id,
        attrGtin?.value_name,
      ]
        .filter(Boolean)
        .flatMap((value) => String(value).split(','))
        .map((value) => value.trim().toLowerCase())
      if (codes.includes(normalized)) {
        return (
          attrSku?.value_name ||
          itemEntry?.seller_sku ||
          itemEntry?.seller_custom_field ||
          itemEntry?.id ||
          code
        )
      }
    }
    return code
  }

  const handleSkuSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = sku.trim()
    if (!trimmed || !supabaseUrl) return
    setLoading(true)
    setError(null)
    setItem(null)
    setQuantity('')
    setQtyConfirmed(false)
    setSelectedBin('')
    setResolvedSku('')
    try {
      const lookupSku = await resolveSkuFromInventory(trimmed)
      setResolvedSku(String(lookupSku))
      const response = await fetch(
        `${supabaseUrl}/functions/v1/ml-item-lookup?account_id=${mlAccountId}&sku=${lookupSku}`,
      )
      if (!response.ok) {
        throw new Error(`SKU não encontrado: ${response.status}`)
      }
      const data = await response.json()
      const items = Array.isArray(data?.items) ? data.items : []
      setItem(items[0] ?? null)
      await loadBins(String(lookupSku))
      setTimeout(() => qtyInputRef.current?.focus(), 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao buscar SKU.')
    } finally {
      setLoading(false)
    }
  }

  const handleQuantitySubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const qty = Number(quantity)
    if (!Number.isFinite(qty) || qty <= 0) {
      setError('Informe uma quantidade válida.')
      return
    }
    setError(null)
    setQtyConfirmed(true)
  }

  const handleRegister = async () => {
    const qty = Number(quantity)
    const skuValue = resolvedSku || sku.trim()
    if (!item || !selectedBin || !Number.isFinite(qty) || qty <= 0 || !supabaseUrl) {
      setError('Selecione o bin e informe a quantidade.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/ml-receive-stock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: mlAccountId,
          sku: skuValue,
          quantity: qty,
          bin: selectedBin,
        }),
      })
      if (!response.ok) {
        throw new Error(`Erro ao atualizar estoque: ${response.status}`)
      }
      await loadBins(skuValue)
      setQuantity('')
      setSelectedBin('')
      setResolvedSku('')
      skuInputRef.current?.focus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao registrar recebimento.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {loading ? <LoadingOverlay label="Carregando SKU..." /> : null}
      <section className="px-4 pt-6 sm:px-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Receber</h1>
          </div>
        </div>
      </section>

      <section className="px-4 pt-6 pb-10 sm:px-8">
        <div className="rounded border border-black/10 bg-white p-4">
          <form onSubmit={handleSkuSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              className="w-full rounded border border-black/10 px-3 py-2 text-sm"
              placeholder="Digite ou escaneie o SKU, GTIN/EAN ou ID do item"
              value={sku}
              onChange={(event) => setSku(event.target.value)}
              ref={skuInputRef}
            />
          </form>
          {loading ? <div className="mt-3 text-sm text-[var(--ink-muted)]">Carregando SKU...</div> : null}
          {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}

          {item ? (
            <div className="mt-6 grid gap-4 rounded border border-black/10 bg-[var(--surface)] p-4 sm:grid-cols-[120px_1fr]">
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

          {item ? (
            <form onSubmit={handleQuantitySubmit} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                className="w-full rounded border border-black/10 px-3 py-2 text-sm sm:w-[160px]"
                placeholder="Quantidade"
                type="number"
                min={1}
                step={1}
                value={quantity}
                onChange={(event) => {
                  setQuantity(event.target.value)
                  if (qtyConfirmed) {
                    setQtyConfirmed(false)
                  }
                }}
                ref={qtyInputRef}
              />
            </form>
          ) : null}

          {item && qtyConfirmed ? (
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <select
                className="rounded border border-black/10 bg-white px-3 py-2 text-sm"
                value={selectedBin}
                onChange={(event) => setSelectedBin(event.target.value)}
              >
                <option value="">Selecione o bin</option>
                {bins.map((bin) => (
                  <option key={bin} value={bin}>
                    {bin}
                  </option>
                ))}
              </select>
              <button
                className="rounded bg-blue-700 px-4 py-2 text-sm text-white"
                type="button"
                onClick={handleRegister}
                disabled={saving}
              >
                {saving ? 'Registrando...' : 'Registrar'}
              </button>
            </div>
          ) : null}

          {binsLog.length ? (
            <div className="mt-6 rounded border border-black/10 bg-white p-4">
              <div className="grid grid-cols-[1fr_1fr_1fr] gap-4 border-b border-black/10 pb-2 text-xs font-semibold text-[var(--ink-muted)]">
                <span>SKU</span>
                <span>Bin</span>
                <span>Quantidade</span>
              </div>
              <div className="mt-2 flex flex-col gap-2">
                {binsLog.map((entry) => (
                  <div
                    key={entry.id}
                    className="grid grid-cols-[1fr_1fr_1fr] gap-4 border-b border-black/10 py-2 text-sm"
                  >
                    <div>{entry.sku}</div>
                    <div>{entry.bin}</div>
                    <div>{entry.quantity}</div>
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
