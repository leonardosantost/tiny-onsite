type QrModule = 0 | 1

class QrCode {
  static readonly Ecc = {
    LOW: 1,
    MEDIUM: 0,
    QUARTILE: 3,
    HIGH: 2,
  } as const

  readonly size: number
  readonly modules: QrModule[][]

  private constructor(size: number, modules: QrModule[][]) {
    this.size = size
    this.modules = modules
  }

  static encodeText(text: string, ecc: number) {
    const data = QrSegment.makeBytes(QrSegment.toUtf8ByteArray(text))
    return QrCode.encodeSegments([data], ecc)
  }

  static encodeSegments(segments: QrSegment[], ecc: number) {
    let minVersion = 1
    let maxVersion = 10
    let version = 1
    let dataUsedBits: number | null = 0
    for (version = minVersion; version <= maxVersion; version += 1) {
      const dataCapacityBits = QrCode.getNumDataCodewords(version, ecc) * 8
      dataUsedBits = QrSegment.getTotalBits(segments, version)
      if (dataUsedBits != null && dataUsedBits <= dataCapacityBits) break
    }
    if (dataUsedBits == null) {
      throw new Error('QR payload too large')
    }

    const bb: number[] = []
    segments.forEach((seg) => {
      QrCode.appendBits(seg.mode, 4, bb)
      QrCode.appendBits(seg.numChars, seg.numCharsBits(version), bb)
      seg.data.forEach((bit) => bb.push(bit))
    })
    const dataCapacityBits = QrCode.getNumDataCodewords(version, ecc) * 8
    QrCode.appendBits(0, Math.min(4, dataCapacityBits - bb.length), bb)
    while (bb.length % 8 !== 0) bb.push(0)
    for (let padByte = 0xec; bb.length < dataCapacityBits; padByte ^= 0xec ^ 0x11) {
      QrCode.appendBits(padByte, 8, bb)
    }

    const dataCodewords = []
    for (let i = 0; i < bb.length; i += 8) {
      let val = 0
      for (let j = 0; j < 8; j += 1) val = (val << 1) | bb[i + j]
      dataCodewords.push(val)
    }

    const codewords = QrCode.addEccAndInterleave(dataCodewords, version, ecc)
    const modules = QrCode.buildMatrix(version, codewords)
    return new QrCode(modules.length, modules)
  }

  private static buildMatrix(version: number, codewords: number[]) {
    const size = version * 4 + 17
    const modules: QrModule[][] = Array.from({ length: size }, () => Array(size).fill(0))
    const isFunction = Array.from({ length: size }, () => Array(size).fill(false))

    const drawFinder = (x: number, y: number) => {
      for (let dy = -1; dy <= 7; dy += 1) {
        for (let dx = -1; dx <= 7; dx += 1) {
          const xx = x + dx
          const yy = y + dy
          if (0 <= xx && xx < size && 0 <= yy && yy < size) {
            const dist = Math.max(Math.abs(dx), Math.abs(dy))
            modules[yy][xx] = dist === 0 || dist === 6 || (dist <= 4 && dist >= 2) ? 1 : 0
            isFunction[yy][xx] = true
          }
        }
      }
    }

    drawFinder(0, 0)
    drawFinder(size - 7, 0)
    drawFinder(0, size - 7)

    for (let i = 0; i < size; i += 1) {
      if (!isFunction[6][i]) {
        modules[6][i] = i % 2 === 0 ? 1 : 0
        isFunction[6][i] = true
      }
      if (!isFunction[i][6]) {
        modules[i][6] = i % 2 === 0 ? 1 : 0
        isFunction[i][6] = true
      }
    }

    const alignPos = QrCode.getAlignmentPatternPositions(version)
    alignPos.forEach((y) => {
      alignPos.forEach((x) => {
        if (isFunction[y][x]) return
        for (let dy = -2; dy <= 2; dy += 1) {
          for (let dx = -2; dx <= 2; dx += 1) {
            modules[y + dy][x + dx] =
              Math.max(Math.abs(dx), Math.abs(dy)) === 1 ? 0 : 1
            isFunction[y + dy][x + dx] = true
          }
        }
      })
    })

    const mask = 0
    let i = 0
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right -= 1
      for (let vert = 0; vert < size; vert += 1) {
        const y = (right + 1) % 2 === 0 ? size - 1 - vert : vert
        for (let j = 0; j < 2; j += 1) {
          const x = right - j
          if (!isFunction[y][x]) {
            const bit = ((codewords[Math.floor(i / 8)] >>> (7 - (i % 8))) & 1) !== 0
            const masked = QrCode.applyMask(mask, x, y) ? !bit : bit
            modules[y][x] = masked ? 1 : 0
            i += 1
          }
        }
      }
    }

    return modules
  }

  private static applyMask(mask: number, x: number, y: number) {
    switch (mask) {
      case 0:
        return (x + y) % 2 === 0
      default:
        return false
    }
  }

  private static addEccAndInterleave(data: number[], version: number, ecc: number) {
    const numBlocks = QrCode.NUM_ERROR_CORRECTION_BLOCKS[ecc][version]
    const blockEccLen = QrCode.ERROR_CORRECTION_CODEWORDS_PER_BLOCK[ecc][version]
    const rawCodewords = QrCode.getNumRawDataModules(version) / 8
    const numShortBlocks = numBlocks - (rawCodewords % numBlocks)
    const shortBlockLen = Math.floor(rawCodewords / numBlocks)

    const blocks: number[][] = []
    let k = 0
    for (let i = 0; i < numBlocks; i += 1) {
      const blockLen = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1)
      const block = data.slice(k, k + blockLen)
      k += blockLen
      const eccBlock = QrCode.reedSolomonCompute(block, blockEccLen)
      blocks.push(block.concat(eccBlock))
    }

    const result: number[] = []
    for (let i = 0; i < blocks[0].length; i += 1) {
      blocks.forEach((block) => {
        if (i < block.length) result.push(block[i])
      })
    }
    return result
  }

  private static reedSolomonCompute(data: number[], eccLen: number) {
    const result = Array(eccLen).fill(0)
    data.forEach((byte) => {
      let factor = byte ^ result[0]
      result.shift()
      result.push(0)
      if (factor !== 0) {
        const gen = QrCode.reedSolomonGenerator(eccLen)
        for (let i = 0; i < eccLen; i += 1) {
          result[i] ^= QrCode.reedSolomonMultiply(gen[i], factor)
        }
      }
    })
    return result
  }

  private static reedSolomonGenerator(degree: number) {
    let result = [1]
    for (let i = 0; i < degree; i += 1) {
      const next = [1]
      for (let j = 0; j < result.length; j += 1) {
        next[j] = result[j]
      }
      next.push(0)
      for (let j = 0; j < result.length; j += 1) {
        next[j + 1] ^= QrCode.reedSolomonMultiply(result[j], QrCode.EXP_TABLE[i])
      }
      result = next
    }
    return result
  }

  private static reedSolomonMultiply(x: number, y: number) {
    if (x === 0 || y === 0) return 0
    return QrCode.EXP_TABLE[(QrCode.LOG_TABLE[x] + QrCode.LOG_TABLE[y]) % 255]
  }

  private static getNumRawDataModules(version: number) {
    let result = (16 * version + 128) * version + 64
    if (version >= 2) {
      const numAlign = Math.floor(version / 7) + 2
      result -= (25 * numAlign - 10) * numAlign - 55
      if (version >= 7) result -= 36
    }
    return result
  }

  private static getNumDataCodewords(version: number, ecc: number) {
    return QrCode.getNumRawDataModules(version) / 8 - QrCode.getNumEccCodewords(version, ecc)
  }

  private static getNumEccCodewords(version: number, ecc: number) {
    return QrCode.ERROR_CORRECTION_CODEWORDS_PER_BLOCK[ecc][version] *
      QrCode.NUM_ERROR_CORRECTION_BLOCKS[ecc][version]
  }

  private static getAlignmentPatternPositions(version: number) {
    if (version === 1) return []
    const numAlign = Math.floor(version / 7) + 2
    const step = version === 32 ? 26 : Math.ceil((version * 4 + 17 - 13) / (numAlign - 1))
    const result = [6]
    for (let pos = version * 4 + 17 - 7; result.length < numAlign; pos -= step) {
      result.splice(1, 0, pos)
    }
    return result
  }

  private static appendBits(val: number, len: number, bb: number[]) {
    for (let i = len - 1; i >= 0; i -= 1) {
      bb.push((val >>> i) & 1)
    }
  }

  private static readonly EXP_TABLE = (() => {
    const table = Array(256).fill(0)
    let x = 1
    for (let i = 0; i < 255; i += 1) {
      table[i] = x
      x = (x * 2) ^ (x >= 128 ? 0x11d : 0)
    }
    return table
  })()

  private static readonly LOG_TABLE = (() => {
    const table = Array(256).fill(0)
    for (let i = 0; i < 255; i += 1) {
      table[QrCode.EXP_TABLE[i]] = i
    }
    return table
  })()

  private static readonly NUM_ERROR_CORRECTION_BLOCKS = [
    [],
    [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2],
    [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5],
    [0, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8],
    [0, 1, 2, 4, 4, 8, 8, 8, 11, 11, 11],
  ]

  private static readonly ERROR_CORRECTION_CODEWORDS_PER_BLOCK = [
    [],
    [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18],
    [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26],
    [0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24],
    [0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28],
  ]
}

class QrSegment {
  static readonly MODE_NUMERIC = 0
  static readonly MODE_ALPHANUMERIC = 1
  static readonly MODE_BYTE = 2
  static readonly MODE_KANJI = 3

  readonly mode: number
  readonly numChars: number
  readonly data: number[]

  private constructor(mode: number, numChars: number, data: number[]) {
    this.mode = mode
    this.numChars = numChars
    this.data = data
  }

  static makeBytes(data: number[]) {
    const bb: number[] = []
    data.forEach((b) => QrSegment.appendBits(b, 8, bb))
    return new QrSegment(QrSegment.MODE_BYTE, data.length, bb)
  }

  static getTotalBits(segs: QrSegment[], version: number) {
    let result = 0
    for (const seg of segs) {
      const ccbits = seg.numCharsBits(version)
      if (seg.numChars >= (1 << ccbits)) return null
      result += 4 + ccbits + seg.data.length
    }
    return result
  }

  numCharsBits(version: number) {
    if (1 <= version && version <= 9) return [10, 9, 8, 8][this.mode]
    return [12, 11, 16, 10][this.mode]
  }

  private static appendBits(val: number, len: number, bb: number[]) {
    for (let i = len - 1; i >= 0; i -= 1) {
      bb.push((val >>> i) & 1)
    }
  }

  static toUtf8ByteArray(text: string) {
    const out: number[] = []
    for (let i = 0; i < text.length; i += 1) {
      const c = text.charCodeAt(i)
      if (c < 0x80) {
        out.push(c)
      } else if (c < 0x800) {
        out.push(0xc0 | (c >>> 6))
        out.push(0x80 | (c & 0x3f))
      } else {
        out.push(0xe0 | (c >>> 12))
        out.push(0x80 | ((c >>> 6) & 0x3f))
        out.push(0x80 | (c & 0x3f))
      }
    }
    return out
  }
}

export default function QRCode({
  value,
  size = 64,
  quietZone = 4,
}: {
  value: string
  size?: number
  quietZone?: number
}) {
  if (!value) {
    return null
  }
  const qr = QrCode.encodeText(value, QrCode.Ecc.LOW)
  const cells = qr.modules
  const modules = qr.size + quietZone * 2
  const cellSize = size / modules
  const offset = quietZone * cellSize
  const rects = []
  for (let y = 0; y < qr.size; y += 1) {
    for (let x = 0; x < qr.size; x += 1) {
      if (cells[y][x]) {
        rects.push(
          <rect
            key={`${x}-${y}`}
            x={offset + x * cellSize}
            y={offset + y * cellSize}
            width={cellSize}
            height={cellSize}
            fill="#111"
          />,
        )
      }
    }
  }

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#fff" />
      {rects}
    </svg>
  )
}
