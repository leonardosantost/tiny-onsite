import { useEffect, useMemo, useState } from 'react'
import Barcode from '../components/Barcode'

type LabelPayload = {
  title: string
  sku: string | null
  gtin: string | null
  brand: string | null
  location: string | null
  entryDate: string | null
  productUrl: string | null
  code: string
  codeLabel: string
  price?: string | null
  showInstallments?: boolean
}

type ParsedTitle = {
  baseTitle: string
  size: string | null
  variations: string[]
}

export default function InventarioEtiquetasPrintPage() {
  const [labels, setLabels] = useState<LabelPayload[]>([])

  useEffect(() => {
    const raw = sessionStorage.getItem('inventory-labels')
    if (!raw) return
    try {
      const parsed = JSON.parse(raw)
      const items = Array.isArray(parsed?.labels) ? parsed.labels : []
      setLabels(items)
    } catch {
      setLabels([])
    }
  }, [])

  useEffect(() => {
    if (labels.length) {
      const timer = setTimeout(() => {
        window.print()
      }, 400)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [labels.length])

  const parseTitle = (value: string): ParsedTitle => {
    const parts = value
      .split(' - ')
      .map((part) => part.trim())
      .filter(Boolean)

    if (parts.length === 0) {
      return { baseTitle: value.trim(), size: null, variations: [] }
    }

    const baseTitle = parts[0]
    const variations = parts.slice(1)

    const sizeCandidates = [
      'PP',
      'P',
      'M',
      'G',
      'GG',
      'XG',
      'XGG',
      'XXG',
      'XXGG',
      'EXG',
      'EXGG',
      'XS',
      'S',
      'L',
      'XL',
      'XXL',
      'XXXL',
    ]

    let size: string | null = null
    const remaining: string[] = []
    for (const entry of variations) {
      const normalized = entry.toUpperCase()
      const hyphenParts = normalized.split('-').filter(Boolean)
      const isHyphenSize =
        hyphenParts.length > 1 &&
        hyphenParts.every((part) => sizeCandidates.includes(part) || /^[0-9]{1,3}$/.test(part))
      if (
        !size &&
        (sizeCandidates.includes(normalized) || /^[0-9]{1,3}$/.test(normalized) || isHyphenSize)
      ) {
        size = entry
        continue
      }
      remaining.push(entry)
    }

    return { baseTitle, size, variations: remaining }
  }

  const styleTag = useMemo(
    () => (
      <style>
        {`
        @page {
          size: 10cm 9.9cm;
          margin: 0;
        }
        html, body {
          width: 10cm;
          height: 9.9cm;
        }
        body {
          margin: 0;
          color: #000;
          font-family: "Arial", sans-serif;
        }
        .print-toolbar {
          padding: 16px;
          background: #f5f5f5;
          border-bottom: 1px solid #ddd;
        }
        .sheet {
          width: 10cm;
          height: 9.9cm;
          margin: 0 auto;
          display: grid;
          grid-template-columns: repeat(2, 5cm);
          grid-auto-rows: 9.9cm;
        }
        .label {
          box-sizing: border-box;
          padding: 0.5cm 0.5cm 0.25cm;
          display: flex;
          flex-direction: column;
          align-items: stretch;
          text-align: left;
          height: 9.9cm;
        }
        .top-block {
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          gap: 0.2cm;
          margin-top: auto;
          padding-bottom: 0.3cm;
        }
        .qr-top {
          display: flex;
          justify-content: flex-start;
          align-items: center;
          gap: 0.25cm;
          position: relative;
          z-index: 2;
        }
        .qr-image {
          width: 1.2cm;
          height: 1.2cm;
          object-fit: contain;
          flex-shrink: 0;
          display: block;
        }
        .qr-logo {
          width: 0.9cm;
          height: 0.9cm;
          object-fit: contain;
          flex-shrink: 0;
          display: block;
        }
        .header {
          display: flex;
          flex-direction: column;
          gap: 0.16cm;
          min-height: 0;
          position: relative;
        }
        .header-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.16cm;
          min-width: 0;
        }
        .title {
          font-size: 13px;
          font-weight: 700;
          line-height: 1.2;
          text-transform: uppercase;
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 3;
          overflow: hidden;
        }
        .meta-line {
          font-size: 8px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #333;
          font-weight: 700;
          position: absolute;
          top: 50%;
          right: 0;
          white-space: nowrap;
          transform: translateY(-50%) rotate(90deg);
          transform-origin: center right;
        }
        .variation-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.18cm 0.3cm;
        }
        .variation-label {
          font-size: 7px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #333;
          font-weight: 700;
        }
        .variation-value {
          font-size: 10px;
          font-weight: 800;
          line-height: 1.1;
          text-transform: uppercase;
        }
        .variation-size {
          font-size: 22px;
          font-weight: 900;
          line-height: 1;
          text-transform: uppercase;
        }
        .sku-line {
          font-size: 8px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #333;
          font-weight: 700;
        }
        .barcode {
          margin-top: 0;
          width: calc(100% + 0.6cm);
          box-sizing: border-box;
          padding: 0;
          margin-left: -0.3cm;
        }
        .barcode svg {
          border: none;
          shape-rendering: crispEdges;
        }
        .barcode-text {
          margin-top: 0;
          text-align: center;
          font-size: 9px;
          letter-spacing: 0.04em;
          font-weight: 600;
          line-height: 1;
        }
        .product-name {
          font-size: 7px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.02em;
          text-align: center;
          line-height: 1.1;
          padding-top: 4px;
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .price {
          font-size: 22px;
          font-weight: 900;
          text-align: center;
          margin-top: 0.02cm;
          letter-spacing: 0.02em;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }
        .price-currency {
          font-size: 12px;
          font-weight: 800;
        }
        .installments {
          font-size: 8px;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          text-align: center;
          margin-top: 0;
          font-weight: 700;
        }
        .bottom {
          width: 100%;
          min-height: 1.4cm;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
        }
        @media print {
          .print-toolbar {
            display: none;
          }
        }
        `}
      </style>
    ),
    [],
  )

  return (
    <div>
      {styleTag}
      <div className="print-toolbar">
        <button onClick={() => window.print()}>Imprimir</button>
      </div>
      <div className="sheet">
        {labels.map((label, index) => {
          const parsedTitle = parseTitle(label.title)
          const sizeText = parsedTitle.size ? parsedTitle.size.toUpperCase() : '-'
          const variationText = parsedTitle.variations.length ? parsedTitle.variations.join(' / ') : '-'
          const parsePriceNumber = (value?: string | null) => {
            if (!value) return null
            const normalized = value.replace(/[^\d,.-]/g, '').replace('.', '').replace(',', '.')
            const parsed = Number(normalized)
            return Number.isFinite(parsed) ? parsed : null
          }
          const formatPriceBRL = (value: number | null) => {
            if (value == null) return null
            return `R$ ${value.toFixed(2).replace('.', ',')}`
          }
          const priceNumber = parsePriceNumber(label.price ?? null)
          const installmentValue =
            label.showInstallments !== false && priceNumber != null ? priceNumber / 6 : null
          const installmentText = installmentValue != null ? formatPriceBRL(installmentValue) : null
          const qrUrl = label.productUrl
            ? `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(
                label.productUrl,
              )}`
            : null
          return (
            <div key={`${label.code}-${index}`} className="label">
              <div className="top-block">
                <div className="qr-top">
                  {qrUrl ? <img src={qrUrl} alt="QR code" className="qr-image" /> : null}
                  <img src="/LOGO ICON QD.png" alt="Logo" className="qr-logo" />
                </div>
                <div className="header">
                  <div className="header-main">
                    <div className="title">{parsedTitle.baseTitle}</div>
                    <div className="variation-grid">
                      <div>
                        <div className="variation-label">Tamanho</div>
                        <div className="variation-size">{sizeText}</div>
                      </div>
                      <div>
                        <div className="variation-label">Variações</div>
                        <div className="variation-value">{variationText}</div>
                      </div>
                    </div>
                    {label.gtin ? <div className="sku-line">SKU {label.sku ?? '-'}</div> : null}
                    <div>
                      <div className="barcode">
                        <Barcode value={label.code} height={40} minBarWidth={2} />
                      </div>
                      <div className="barcode-text">{label.code}</div>
                    </div>
                  </div>
                  <div className="meta-line">
                    {`${label.brand ?? '-'} ${label.location ?? '-'} ${label.entryDate ?? '-'}`}
                  </div>
                </div>
              </div>

              <div className="bottom">
                {label.price ? (
                  <>
                    <div className="price">
                      <span className="price-currency">R$</span>
                      <span>{label.price.replace(/^R\$\s?/, '')}</span>
                    </div>
                    {installmentText ? (
                      <div className="installments">até 6x sem juros de {installmentText}</div>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
