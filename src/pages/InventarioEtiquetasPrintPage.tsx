import { useEffect, useMemo, useState } from 'react'
import Barcode from '../components/Barcode'
import QRCode from '../components/QRCode'

type LabelPayload = {
  title: string
  variation: string
  location: string
  code: string
  codeLabel: string
  sku: string
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
      if (!size && (sizeCandidates.includes(normalized) || /^[0-9]{1,3}$/.test(normalized))) {
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
          gap: 0.2cm;
          align-items: stretch;
          text-align: left;
          height: 9.9cm;
        }
        .top {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 0.2cm;
          align-items: stretch;
          flex: 1;
          min-height: 0;
          justify-content: flex-end;
          padding-bottom: 0.35cm;
        }
        .top-content {
          display: flex;
          flex-direction: column;
          gap: 0.2cm;
          align-items: flex-start;
          text-align: left;
        }
        .qr {
          width: 1.1cm;
          height: 1.1cm;
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
        .variation-grid {
          width: 100%;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.2cm;
        }
        .variation-label {
          font-size: 7px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #333;
          text-align: left;
          font-weight: 700;
        }
        .variation-size {
          font-size: 36px;
          font-weight: 800;
          line-height: 1;
          text-align: left;
        }
        .variation-text {
          font-size: 10px;
          font-weight: 700;
          line-height: 1.1;
          text-transform: uppercase;
          text-align: left;
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
          padding-top: 10px;
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .bottom {
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0;
          flex: 0 0 auto;
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
          const parsed = parseTitle(label.title)
          const sizeText = parsed.size ? parsed.size.toUpperCase() : '-'
          const variationText = parsed.variations.length ? parsed.variations.join(' / ') : '-'
          return (
            <div key={`${label.code}-${index}`} className="label">
              <div className="top">
                <div className="top-content">
                  <div className="qr">
                    <QRCode value={label.sku} size={44} />
                  </div>
                  <div className="title">{parsed.baseTitle}</div>
                  <div className="variation-grid">
                    <div>
                      <div className="variation-label">Tamanho</div>
                      <div className="variation-size">{sizeText}</div>
                    </div>
                    <div>
                      <div className="variation-label">Cor / Variações</div>
                      <div className="variation-text">{variationText}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bottom">
                <div className="product-name">{parsed.baseTitle}</div>
                <div className="barcode">
                  <Barcode value={label.code} height={45} minBarWidth={2} />
                </div>
                <div className="barcode-text">{label.code}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
