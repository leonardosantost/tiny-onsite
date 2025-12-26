import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Barcode from '../components/Barcode'
import LoadingOverlay from '../components/LoadingOverlay'
import { supabaseUrl } from '../config'
import { formatCutoffDisplay, formatOrderDate } from '../utils/date'

function barcodeBars(value: string) {
  const bars: { x: number; width: number }[] = []
  let x = 0
  for (const char of value) {
    const code = char.charCodeAt(0)
    const widths = [1, 2, 3]
    const barWidth = widths[code % widths.length]
    bars.push({ x, width: barWidth })
    x += barWidth + 1
  }
  return { bars, width: Math.max(x, 1) }
}

function buildBarcodeSvg(value: string) {
  const { bars, width } = barcodeBars(value)
  const scale = 220 / Math.max(width, 1)
  const rects = bars
    .map((bar) => `<rect x="${bar.x * scale}" y="0" width="${bar.width * scale}" height="48" fill="#000" />`)
    .join('')
  return `<svg width="220" height="48" viewBox="0 0 220 48" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`
}

export default function ColetarDetailPage() {
  const { id } = useParams()
  const [list, setList] = useState<any | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabaseUrl || !id) {
      setError('Lista não encontrada.')
      return
    }

    const controller = new AbortController()

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/ml-picklists?id=${id}`, {
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error(`Erro ao carregar lista: ${response.status}`)
        }
        const data = await response.json()
        setList(data)
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          setError(err instanceof Error ? err.message : 'Falha ao carregar lista.')
        }
      } finally {
        setLoading(false)
      }
    }

    load()

    return () => controller.abort()
  }, [id])

  const items = Array.isArray(list?.pick_list_items) ? list.pick_list_items : []
  const groupedItems = new Map<
    string,
    { title: string; sku: string; quantity: number; packIds: Set<string> }
  >()

  for (const item of items) {
    const sku = String(item?.sku ?? item?.item_id ?? '-')
    const title = String(item?.title ?? '-')
    const key = `${sku}::${title}`
    const existing = groupedItems.get(key)
    const packId = item?.order_id ? String(item.order_id) : null
    if (existing) {
      existing.quantity += Number(item?.quantity ?? 0)
      if (packId) {
        existing.packIds.add(packId)
      }
    } else {
      groupedItems.set(key, {
        title,
        sku,
        quantity: Number(item?.quantity ?? 0),
        packIds: new Set(packId ? [packId] : []),
      })
    }
  }

  const groupedRows = Array.from(groupedItems.values())
  const ordersCount = Array.isArray(list?.orders) ? list.orders.length : 0
  const skuCount = new Set(items.map((item: any) => item.sku || item.item_id)).size
  const unitsCount = items.reduce((acc: number, item: any) => acc + (item.quantity ?? 0), 0)
  const cutoffLabel = list?.cutoff_at ? formatCutoffDisplay(list.cutoff_at).label : '-'
  const packedCount = items.filter((item: any) => item?.packed_at).length
  const packedAtDates = items
    .map((item: any) => item?.packed_at)
    .filter(Boolean)
    .map((value: string) => new Date(value))
    .filter((date: Date) => !Number.isNaN(date.getTime()))
  const packedFinishedAt =
    packedAtDates.length > 0
      ? new Date(Math.max(...packedAtDates.map((date: Date) => date.getTime())))
      : null
  const isPacked = items.length > 0 && packedCount === items.length
  const isManifested = list?.status === 'completed'
  const handlePrint = () => {
    if (!id) return
    const printWindow = window.open('', '_blank', 'width=900,height=700')
    if (!printWindow) return
    const rowsHtml = groupedRows
      .map((row) => {
        const packs = Array.from(row.packIds).join(', ') || '-'
        return `
          <tr>
            <td>
              <div class="title">${row.title}</div>
              <div class="ref">Ref. pedidos: ${packs}</div>
            </td>
            <td>${row.sku}</td>
            <td class="qty">${row.quantity}</td>
          </tr>
        `
      })
      .join('')
    const barcodeSvg = buildBarcodeSvg(id)
    printWindow.document.write(`<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Lista de coleta ${id}</title>
          <style>
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; color: #000; margin: 24px; }
            h1 { font-size: 22px; margin: 0 0 8px; }
            .muted { color: #333; font-size: 12px; }
            .warning { margin: 16px 0; padding: 8px 12px; border: 2px solid #000; font-weight: bold; text-align: center; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
            .barcode { border: 1px solid #000; padding: 8px; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; }
            th, td { border-bottom: 1px solid #000; text-align: left; padding: 8px 6px; vertical-align: top; }
            th { font-size: 12px; text-transform: uppercase; }
            .title { font-weight: bold; }
            .ref { font-size: 11px; margin-top: 4px; }
            .qty { text-align: right; width: 80px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1>Lista de coleta</h1>
              <div class="muted">ID da lista: ${id}</div>
              <div class="muted">Corte: ${cutoffLabel}</div>
              <div class="muted">Pedidos: ${ordersCount} | SKUs: ${skuCount} | Unidades: ${unitsCount}</div>
            </div>
            <div class="barcode">${barcodeSvg}</div>
          </div>
          <div class="warning">NÃO ANEXAR ESSA FOLHA AOS PEDIDOS</div>
          <table>
            <thead>
              <tr>
                <th>Título do produto</th>
                <th>SKU</th>
                <th class="qty">Unidades</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </body>
      </html>`)
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
  }

  return (
    <>
      {loading ? <LoadingOverlay label="Carregando lista..." /> : null}
      <section className="px-4 pt-6 sm:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm text-[var(--ink-muted)]">
              <Link className="text-blue-700" to="/pedidos/coletar">
                Coletar
              </Link>{' '}
              &gt; Detalhes da lista
            </p>
            <h1 className="mt-2 text-3xl font-semibold">ID da lista de coleta: {id}</h1>
          </div>
          <div className="flex flex-col items-end gap-3">
            {id ? <Barcode value={id} /> : null}
            <button
              className="rounded border border-blue-700 px-4 py-2 text-sm text-blue-700"
              onClick={handlePrint}
            >
              Imprimir lista de coleta
            </button>
          </div>
        </div>
      </section>

      <section className="px-4 pt-6 sm:px-8">
        {loading ? <div className="text-sm text-[var(--ink-muted)]">Carregando lista...</div> : null}
        {error ? <div className="text-sm text-red-600">{error}</div> : null}
      </section>

      {list ? (
        <>
          <section className="px-4 pt-6 sm:px-8">
            <div className="flex flex-col gap-6 text-sm sm:flex-row sm:items-start">
              {[
                {
                  title: 'Criar',
                  detail: formatOrderDate(list.created_at),
                  sub: cutoffLabel,
                  done: true,
                },
                {
                  title: 'Embalar',
                  detail: isPacked
                    ? packedFinishedAt
                      ? formatOrderDate(packedFinishedAt.toISOString())
                      : 'Pacote completo'
                    : '',
                  sub: '',
                  done: isPacked,
                },
                {
                  title: 'Manifestar',
                  detail: isManifested ? 'Envio concluído' : '',
                  sub: '',
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
                  {step.detail ? <div className="text-[var(--ink-muted)]">{step.detail}</div> : null}
                  {step.sub ? <div className="text-[var(--ink-muted)]">{step.sub}</div> : null}
                  {index === array.length - 1 ? null : (
                    <div className="hidden h-px bg-transparent sm:block" />
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="px-4 pt-8 pb-10 sm:px-8">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Lista de coleta</h2>
              <div className="text-sm text-[var(--ink-muted)]">
                Pedidos: {ordersCount}, SKUs: {skuCount}, Unidades: {unitsCount}
              </div>
            </div>
            <div className="mt-4 overflow-x-auto rounded border border-black/10 bg-[var(--surface)] p-4">
              <div className="min-w-[760px]">
                <div className="grid grid-cols-[2fr_1fr_0.8fr] gap-4 border-b border-black/10 pb-2 text-xs font-semibold text-[var(--ink-muted)]">
                  <span>Título do produto</span>
                  <span>SKU</span>
                  <span>Unidades</span>
                </div>
                {groupedRows.map((item: any) => (
                  <div
                    key={`${item.sku}-${item.title}`}
                    className="grid grid-cols-[2fr_1fr_0.8fr] gap-4 border-b border-black/10 py-3 text-sm"
                  >
                    <div>
                      <div className="text-blue-700">{item.title ?? '-'}</div>
                      <div className="mt-1 text-xs text-[var(--ink-muted)]">
                        Ref. pedidos: {Array.from(item.packIds).join(', ') || '-'}
                      </div>
                    </div>
                    <div>{item.sku ?? '-'}</div>
                    <div>{item.quantity ?? 0}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      ) : null}
    </>
  )
}
