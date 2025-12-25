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

export default function Barcode({ value }: { value: string }) {
  const { bars, width } = barcodeBars(value)
  const scale = 100 / Math.max(width, 1)
  return (
    <svg
      viewBox="0 0 100 48"
      preserveAspectRatio="none"
      className="h-12 w-full border border-black/10 bg-white"
    >
      {bars.map((bar, index) => (
        <rect
          key={index}
          x={bar.x * scale}
          y={0}
          width={bar.width * scale}
          height={48}
          fill="#111"
        />
      ))}
    </svg>
  )
}
