import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import LoadingOverlay from '../components/LoadingOverlay'
import { supabaseUrl } from '../config'
import { tinyFetch } from '../lib/tinyFetch'
import { formatOrderDate } from '../utils/date'

function buildPrintPage(manifest: any) {
  const logoUrl = `${window.location.origin}/mercado-livre-2.svg`
  const rowsHtml = (manifest?.manifest_items ?? [])
    .map((item: any) => {
      return `
        <tr>
          <td>
            <div class="id">${item.id}</div>
            <div class="meta">Pack ID: ${item.pack_id}</div>
            <div class="meta">Venda: ${item.order_id}</div>
            <div class="meta">${item.buyer_name ?? '-'}</div>
          </td>
          <td>
            <div class="title">${item.title}</div>
            <div class="meta">SKU: ${item.sku}</div>
            <div class="meta">Quantidade: ${item.quantity}</div>
            <div class="meta">Cor: ${item.color ?? '-'}</div>
            <div class="meta">Desenho do tecido: ${item.fabric_design ?? '-'}</div>
          </td>
        </tr>
      `
    })
    .join('')

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>Manifesto ${manifest.id}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, sans-serif; color: #000; margin: 24px; }
        h1 { font-size: 22px; margin: 0 0 8px; }
        .muted { color: #333; font-size: 12px; }
        .logo { margin-bottom: 12px; }
        .logo img { height: 52px; width: auto; display: block; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { border-bottom: 1px solid #000; text-align: left; padding: 10px 8px; vertical-align: top; }
        th { font-size: 12px; text-transform: uppercase; }
        .id { font-weight: bold; }
        .title { font-weight: bold; }
        .meta { font-size: 11px; margin-top: 4px; }
        .signature { margin-top: 50px; border-top: 1px solid #000; padding-top: 12px; width: 30%; }
      </style>
    </head>
    <body>
      <div class="logo"><img src="${logoUrl}" alt="Tiny ERP" /></div>
      <h1>Manifesto de coleta</h1>
      <div class="muted">ID do manifesto: ${manifest.id}</div>
      <div class="muted">Status: ${manifest.status}</div>
      <div class="muted">Método: ${manifest.carrier_name ?? '-'}</div>
      <div class="muted">Gerado em: ${formatOrderDate(manifest.created_at)}</div>
      <table>
        <thead>
          <tr>
            <th>Identificação</th>
            <th>Produto</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
      <div class="signature"><b>Assinatura e CPF/RG</b></div>
      <span>Eu, funcionário da transportadora _________________</br>declaro que recebi os itens acima descritos.</span>
    </body>
  </html>`
}

export default function ManifestarDetailPage() {
  const { id } = useParams()
  const [manifest, setManifest] = useState<any | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabaseUrl || !id) {
      setError('Manifesto não encontrado.')
      return
    }

    const controller = new AbortController()

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await tinyFetch(`${supabaseUrl}/functions/v1/tiny-manifests?id=${id}&include_items=1`, {
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error(`Erro ao carregar manifesto: ${response.status}`)
        }
        const data = await response.json()
        setManifest(data)
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          setError(err instanceof Error ? err.message : 'Falha ao carregar manifesto.')
        }
      } finally {
        setLoading(false)
      }
    }

    load()

    return () => controller.abort()
  }, [id])

  const rows = useMemo(() => (Array.isArray(manifest?.manifest_items) ? manifest.manifest_items : []), [manifest])

  const handlePrint = () => {
    if (!manifest) return
    const printWindow = window.open('', '_blank', 'width=900,height=700')
    if (!printWindow) return
    printWindow.document.write(buildPrintPage(manifest))
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
  }

  return (
    <>
      {loading ? <LoadingOverlay label="Carregando manifesto..." /> : null}
      <section className="px-4 pt-6 sm:px-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Manifesto</h1>
            <div className="mt-2 text-sm text-[var(--ink-muted)]">ID do manifesto: {id}</div>
          </div>
          <button
            className="rounded border border-blue-700 px-4 py-2 text-sm text-blue-700"
            onClick={handlePrint}
          >
            Imprimir manifesto
          </button>
        </div>
        {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
      </section>

      <section className="px-4 pt-6 pb-10 sm:px-8">
        <div className="rounded border border-black/10 bg-[var(--surface)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <div>Status: {manifest?.status ?? '-'}</div>
            <div>Pedidos: {rows.length}</div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <div className="min-w-[820px]">
              <div className="grid grid-cols-[1.2fr_2fr] gap-4 border-b border-black/10 pb-2 text-xs font-semibold text-[var(--ink-muted)]">
                <span>Identificação</span>
                <span>Produto</span>
              </div>
              <div className="mt-2 flex flex-col gap-2">
                {rows.map((item: any) => (
                  <div
                    key={item.id}
                    className="grid grid-cols-[1.2fr_2fr] gap-4 border-b border-black/10 py-3 text-sm"
                  >
                    <div>
                      <div className="font-semibold">{item.id}</div>
                      <div className="mt-1 text-[var(--ink-muted)]">Pack ID: {item.pack_id}</div>
                      <div className="mt-1 text-[var(--ink-muted)]">Venda: {item.order_id}</div>
                      <div className="mt-1 text-[var(--ink-muted)]">{item.buyer_name ?? '-'}</div>
                    </div>
                    <div>
                      <div className="font-semibold">{item.title}</div>
                      <div className="mt-1 text-[var(--ink-muted)]">SKU: {item.sku}</div>
                      <div className="mt-1 text-[var(--ink-muted)]">Quantidade: {item.quantity}</div>
                      <div className="mt-1 text-[var(--ink-muted)]">Cor: {item.color ?? '-'}</div>
                      <div className="mt-1 text-[var(--ink-muted)]">
                        Desenho do tecido: {item.fabric_design ?? '-'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 text-sm text-[var(--ink-muted)]">
                Assinatura do responsável pela coleta
              </div>
              <div className="mt-2 h-10 border-b border-black/40" />
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
