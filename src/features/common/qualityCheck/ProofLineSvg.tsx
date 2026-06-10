import { Box, Text } from '@chakra-ui/react'
import { useMemo } from 'react'
import type {
  ProofGlyph,
  ProofRun,
} from 'src/features/common/qualityCheck/qualityProof'

const PROOF_ASCENDER = 900
const PROOF_DESCENDER = -260
const PROOF_FLIP_OFFSET = 800
const HIGHLIGHT_FILL = 'var(--chakra-colors-orange-500)'

interface ProofLineSvgProps {
  proofRun: ProofRun
  fontSize: number
  highlightGlyphIds?: Set<string>
}

function ProofGlyphShape({
  glyph,
  x,
  y,
  highlightGlyphIds,
}: {
  glyph: ProofGlyph
  x: number
  y: number
  highlightGlyphIds?: Set<string>
}) {
  if (glyph.isSpace) {
    return null
  }

  if (glyph.isMissing || glyph.shapes.length === 0) {
    return (
      <g transform={`translate(${x} ${y})`}>
        <rect
          x={0}
          y={90}
          width={glyph.advance * 0.82}
          height={520}
          fill="none"
          stroke="currentColor"
          strokeDasharray="28 22"
          strokeWidth={18}
          opacity={0.28}
        />
        <text
          x={glyph.advance * 0.41}
          y={460}
          textAnchor="middle"
          fontSize={360}
          fill="currentColor"
          opacity={0.42}
        >
          {glyph.character}
        </text>
      </g>
    )
  }

  const isHighlighted = Boolean(
    glyph.glyphId && highlightGlyphIds?.has(glyph.glyphId)
  )
  const fill = isHighlighted ? HIGHLIGHT_FILL : 'currentColor'

  return (
    <g transform={`translate(${x} ${y + PROOF_FLIP_OFFSET}) scale(1 -1)`}>
      {glyph.shapes.map((shape, index) => (
        <path
          key={`${glyph.key}-${index}`}
          d={shape.d}
          transform={shape.transform}
          fill={fill}
        />
      ))}
    </g>
  )
}

export function ProofLineSvg({
  proofRun,
  fontSize,
  highlightGlyphIds,
}: ProofLineSvgProps) {
  if (proofRun.glyphs.length === 0) {
    return (
      <Text fontSize="sm" color="field.muted">
        沒有可顯示的 proof 文字。
      </Text>
    )
  }

  const glyphPlacements = proofRun.glyphs.reduce<
    Array<{ glyph: ProofGlyph; x: number }>
  >((placements, glyph) => {
    const previous = placements[placements.length - 1]
    const x = previous ? previous.x + previous.glyph.advance : 0
    return [...placements, { glyph, x }]
  }, [])

  return (
    <Box
      as="svg"
      viewBox={`0 ${PROOF_DESCENDER} ${proofRun.totalAdvance} ${PROOF_ASCENDER - PROOF_DESCENDER}`}
      width="100%"
      height={`${Math.max(28, fontSize * 1.8)}px`}
      display="block"
      preserveAspectRatio="xMinYMid meet"
      color="field.ink"
      role="img"
      aria-label="proof line"
    >
      {glyphPlacements.map(({ glyph, x }) => (
        <ProofGlyphShape
          key={glyph.key}
          glyph={glyph}
          x={x}
          y={0}
          highlightGlyphIds={highlightGlyphIds}
        />
      ))}
    </Box>
  )
}

interface ProofParagraphSvgProps {
  proofRun: ProofRun
  fontSize: number
  highlightGlyphIds?: Set<string>
  /** 每行寬度（em 數） */
  emPerLine?: number
}

const LINE_ADVANCE = 1280

/**
 * 段落排版 proof：自動換行，把一大段文字排成文字塊，
 * 用於觀察整體灰度。
 */
export function ProofParagraphSvg({
  proofRun,
  fontSize,
  highlightGlyphIds,
  emPerLine = 24,
}: ProofParagraphSvgProps) {
  const lineWidth = emPerLine * 1000

  const lines = useMemo(() => {
    const result: Array<Array<{ glyph: ProofGlyph; x: number }>> = []
    let currentLine: Array<{ glyph: ProofGlyph; x: number }> = []
    let cursor = 0
    for (const glyph of proofRun.glyphs) {
      if (cursor + glyph.advance > lineWidth && currentLine.length > 0) {
        result.push(currentLine)
        currentLine = []
        cursor = 0
        if (glyph.isSpace) {
          continue
        }
      }
      currentLine.push({ glyph, x: cursor })
      cursor += glyph.advance
    }
    if (currentLine.length > 0) {
      result.push(currentLine)
    }
    return result
  }, [lineWidth, proofRun.glyphs])

  if (lines.length === 0) {
    return (
      <Text fontSize="sm" color="field.muted">
        沒有可顯示的 proof 文字。
      </Text>
    )
  }

  const totalHeight =
    lines.length * LINE_ADVANCE + (PROOF_ASCENDER - PROOF_DESCENDER - 1000)

  return (
    <Box
      as="svg"
      viewBox={`0 ${PROOF_DESCENDER} ${lineWidth} ${totalHeight}`}
      width={`${emPerLine * fontSize}px`}
      maxW="100%"
      display="block"
      preserveAspectRatio="xMinYMin meet"
      color="field.ink"
      role="img"
      aria-label="proof paragraph"
    >
      {lines.map((line, lineIndex) =>
        line.map(({ glyph, x }) => (
          <ProofGlyphShape
            key={`${lineIndex}-${glyph.key}`}
            glyph={glyph}
            x={x}
            y={lineIndex * LINE_ADVANCE}
            highlightGlyphIds={highlightGlyphIds}
          />
        ))
      )}
    </Box>
  )
}
