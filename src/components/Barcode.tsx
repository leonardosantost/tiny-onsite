const CODE128_PATTERNS = [
  '212222',
  '222122',
  '222221',
  '121223',
  '121322',
  '131222',
  '122213',
  '122312',
  '132212',
  '221213',
  '221312',
  '231212',
  '112232',
  '122132',
  '122231',
  '113222',
  '123122',
  '123221',
  '223211',
  '221132',
  '221231',
  '213212',
  '223112',
  '312131',
  '311222',
  '321122',
  '321221',
  '312212',
  '322112',
  '322211',
  '212123',
  '212321',
  '232121',
  '111323',
  '131123',
  '131321',
  '112313',
  '132113',
  '132311',
  '211313',
  '231113',
  '231311',
  '112133',
  '112331',
  '132131',
  '113123',
  '113321',
  '133121',
  '313121',
  '211331',
  '231131',
  '213113',
  '213311',
  '213131',
  '311123',
  '311321',
  '331121',
  '312113',
  '312311',
  '332111',
  '314111',
  '221411',
  '431111',
  '111224',
  '111422',
  '121124',
  '121421',
  '141122',
  '141221',
  '112214',
  '112412',
  '122114',
  '122411',
  '142112',
  '142211',
  '241211',
  '221114',
  '413111',
  '241112',
  '134111',
  '111242',
  '121142',
  '121241',
  '114212',
  '124112',
  '124211',
  '411212',
  '421112',
  '421211',
  '212141',
  '214121',
  '412121',
  '111143',
  '111341',
  '131141',
  '114113',
  '114311',
  '411113',
  '411311',
  '113141',
  '114131',
  '311141',
  '411131',
  '211412',
  '211214',
  '211232',
  '2331112',
]

function toCode128(value: string) {
  const sanitized = value
    .split('')
    .map((char) => {
      const code = char.charCodeAt(0)
      return code >= 32 && code <= 126 ? char : '?'
    })
    .join('')

  const codes = sanitized.split('').map((char) => char.charCodeAt(0) - 32)
  const startCode = 104
  let checksum = startCode
  codes.forEach((code, index) => {
    checksum += code * (index + 1)
  })
  const checksumCode = checksum % 103

  const sequence = [startCode, ...codes, checksumCode, 106]
  return sequence.map((code) => CODE128_PATTERNS[code])
}

function barcodeBars(value: string) {
  const patterns = toCode128(value)
  const bars: { x: number; width: number }[] = []
  let x = 0
  patterns.forEach((pattern) => {
    const widths = pattern.split('').map((digit) => Number(digit))
    widths.forEach((width, index) => {
      const isBar = index % 2 === 0
      if (isBar) {
        bars.push({ x, width })
      }
      x += width
    })
  })

  return { bars, width: Math.max(x, 1) }
}

export default function Barcode({
  value,
  height = 48,
  minBarWidth = 1,
}: {
  value: string
  height?: number
  minBarWidth?: number
}) {
  const { bars, width } = barcodeBars(value)
  const adjustedScale = minBarWidth / Math.max(1, Math.min(...bars.map((bar) => bar.width)))
  const totalWidth = width * adjustedScale
  const viewWidth = Math.max(100, totalWidth)
  return (
    <svg
      viewBox={`0 0 ${viewWidth} ${height}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height }}
    >
      {bars.map((bar, index) => (
        <rect
          key={index}
          x={bar.x * adjustedScale}
          y={0}
          width={bar.width * adjustedScale}
          height={height}
          fill="#111"
        />
      ))}
    </svg>
  )
}
