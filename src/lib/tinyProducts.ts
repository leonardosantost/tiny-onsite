type TinyProductEntry = Record<string, any>

export function extractTinyProductEntries(payload: any): TinyProductEntry[] {
  const rawItems = Array.isArray(payload?.itens)
    ? payload.itens
    : Array.isArray(payload?.produtos)
      ? payload.produtos
      : Array.isArray(payload?.retorno?.produtos)
        ? payload.retorno.produtos
        : []
  return rawItems
    .map((entry: any) => (entry?.produto ? entry.produto : entry))
    .filter((entry: any) => entry && typeof entry === 'object')
}

export function getTinyProductTitle(entry: TinyProductEntry): string {
  return String(entry?.descricao ?? entry?.nome ?? entry?.descricaoComplementar ?? '-')
}

export function getTinyProductSku(entry: TinyProductEntry): string | null {
  const sku = entry?.sku ?? entry?.codigo ?? null
  return sku != null ? String(sku) : null
}

export function getTinyProductGtin(entry: TinyProductEntry): string | null {
  const gtin = entry?.gtin ?? entry?.tributacao?.gtinEmbalagem ?? null
  return gtin != null ? String(gtin) : null
}

export function getTinyProductThumb(entry: TinyProductEntry): string | null {
  const attachment = Array.isArray(entry?.anexos) ? entry.anexos.find((item: any) => item?.url) : null
  return attachment?.url ?? null
}

export function getTinyProductCodes(entry: TinyProductEntry): string[] {
  const candidates = [
    entry?.sku,
    entry?.codigo,
    entry?.gtin,
    entry?.tributacao?.gtinEmbalagem,
    entry?.id,
  ]
    .filter((value) => value != null)
    .flatMap((value) => String(value).split(','))
    .map((value) => value.trim())
    .filter(Boolean)
  return Array.from(new Set(candidates))
}

export function normalizeTinyPaging(payload: any, fallback: { limit: number; offset: number; total: number }) {
  const paging = payload?.paginacao ?? payload?.retorno?.paginacao ?? null
  if (!paging || typeof paging !== 'object') return fallback
  const limit = Number(paging?.limit ?? paging?.limite ?? fallback.limit)
  const offset = Number(paging?.offset ?? fallback.offset)
  const total = Number(paging?.total ?? paging?.total_registros ?? paging?.total_reg ?? fallback.total)
  return {
    limit: Number.isFinite(limit) ? limit : fallback.limit,
    offset: Number.isFinite(offset) ? offset : fallback.offset,
    total: Number.isFinite(total) ? total : fallback.total,
  }
}
