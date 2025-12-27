import { useEffect, useMemo, useState } from 'react'
import Barcode from '../components/Barcode'

type LabelPayload = {
  title: string
  variation: string
  location: string
  code: string
  codeLabel: string
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
          padding: 0.6cm 0.6cm 0.2cm;
          display: flex;
          flex-direction: column;
          gap: 4px;
          align-items: center;
          text-align: center;
          height: 9.9cm;
        }
        .content {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          gap: 4px;
        }
        .logo {
          height: 28px;
          width: auto;
        }
        .title {
          font-size: 13px;
          font-weight: 700;
          line-height: 1.2;
        }
        .meta {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          color: #333;
        }
        .value {
          font-size: 13px;
          font-weight: 600;
        }
        .spacer {
          flex: 1;
        }
        .barcode {
          margin-top: 0;
          width: 100%;
          box-sizing: border-box;
          padding: 0 0.05cm;
        }
        .barcode svg {
          border: none;
        }
        .barcode-text {
          margin-top: 0;
          text-align: center;
          font-size: 12px;
          letter-spacing: 0.08em;
          font-weight: 700;
          line-height: 1;
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
        {labels.map((label, index) => (
          <div key={`${label.code}-${index}`} className="label">
            <div className="content">
              <img src="/LOGO ICON QD.png" alt="Logo" className="logo" />
              <div className="title">{label.title.toUpperCase()}</div>
              <div className="value">{label.code}</div>
            </div>
            <div className="barcode">
              <Barcode value={label.code} />
            </div>
            <div className="barcode-text">{label.code}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
