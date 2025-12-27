import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { tinyAccountId, supabaseUrl } from '../config'
import LoadingOverlay from '../components/LoadingOverlay'
import { tinyFetch } from '../lib/tinyFetch'

type InventoryItem = {
  id: string | null
  nome: string | null
  codigo: string | null
  sku: string | null
  unidade: string | null
}

type Paging = {
  limit: number
  offset: number
  total: number
}

const DEFAULT_LIMIT = 100

export default function InventarioPage() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [paging, setPaging] = useState<Paging | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim())
      setOffset(0)
    }, 400)
    return () => clearTimeout(handler)
  }, [searchTerm])

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
        if (debouncedSearch) {
          params.set('search', debouncedSearch)
        }

        const response = await tinyFetch(`${supabaseUrl}/functions/v1/tiny-inventory?${params.toString()}`, {
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error(`Erro ao carregar inventário: ${response.status}`)
        }
        const data = await response.json()
        const results = Array.isArray(data?.results) ? data.results : []
        setItems(results)
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
          setError(err instanceof Error ? err.message : 'Falha ao carregar inventário.')
        }
      } finally {
        setLoading(false)
      }
    }

    load()

    return () => controller.abort()
  }, [debouncedSearch, offset])

  const rows = useMemo(() => items, [items])

  const total = paging?.total ?? items.length
  const limit = paging?.limit ?? DEFAULT_LIMIT
  const currentPage = Math.floor((paging?.offset ?? offset) / limit) + 1
  const totalPages = Math.max(1, Math.ceil(total / limit))

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
        <div className="mt-4 rounded border border-black/10 bg-[var(--surface)] p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <input
                className="w-full rounded border border-black/10 bg-white px-3 py-2 text-sm lg:w-[260px]"
                placeholder="Pesquisar por SKU, GTIN ou título"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>
          </div>
          {loading ? <div className="mt-3 text-sm text-[var(--ink-muted)]">Carregando inventário...</div> : null}
          {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}

          <div className="mt-4 overflow-x-auto">
            <div className="min-w-[820px]">
              <div
                className="grid grid-cols-[2.4fr_1.2fr_1.2fr_0.9fr_0.8fr] gap-4 border-b border-black/10 pb-2 text-xs font-semibold text-[var(--ink-muted)]"
              >
                <span>Nome do produto</span>
                <span>Código</span>
                <span>SKU</span>
                <span>Unidade</span>
                <span>ID</span>
              </div>
              <div className="mt-2 flex flex-col gap-2">
                {loading ? (
                  <div className="border-b border-black/10 px-1 py-6 text-sm text-[var(--ink-muted)]">
                    Carregando inventário...
                  </div>
                ) : null}
                {rows.map((row, index) => (
                  <div
                    key={`${row.id ?? row.sku ?? `row-${index}`}`}
                    className="grid grid-cols-[2.4fr_1.2fr_1.2fr_0.9fr_0.8fr] items-center gap-4 border-b border-black/10 px-1 py-3 text-sm"
                  >
                    <div className="text-blue-600">
                      <Link to={`/inventario/${row.id ?? ''}`}>{row.nome ?? '-'}</Link>
                    </div>
                    <div>{row.codigo ?? '-'}</div>
                    <div>{row.sku ?? '-'}</div>
                    <div>{row.unidade ?? '-'}</div>
                    <div>{row.id ?? '-'}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 text-sm text-[var(--ink-muted)]">
                <span>
                  {rows.length} resultados | Página {currentPage} de {totalPages}
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
      </section>
    </>
  )
}
