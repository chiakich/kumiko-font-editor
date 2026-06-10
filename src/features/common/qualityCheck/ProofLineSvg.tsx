import { Box, Text } from '@chakra-ui/react'
import type { ProofRun } from 'src/features/common/qualityCheck/qualityProof'

const PROOF_ASCENDER = 900
const PROOF_DESCENDER = -260
const PROOF_FLIP_OFFSET = 800

interface ProofLineSvgProps {
  proofRun: ProofRun
  fontSize: number
}

export function ProofLineSvg({ proofRun, fontSize }: ProofLineSvgProps) {
  if (proofRun.glyphs.length === 0) {
    return (
      <Text fontSize="sm" color="field.muted">
        沒有可顯示的 proof 文字。
      </Text>
    )
  }

  const glyphPlacements = proofRun.glyphs.reduce<
    Array<{ glyph: (typeof proofRun.glyphs)[number]; x: number }>
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
      {glyphPlacements.map(({ glyph, x }) => {
        if (glyph.isSpace) {
          return null
        }

        if (glyph.isMissing || glyph.shapes.length === 0) {
          return (
            <g key={glyph.key} transform={`translate(${x} 0)`}>
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

        return (
          <g
            key={glyph.key}
            transform={`translate(${x} ${PROOF_FLIP_OFFSET}) scale(1 -1)`}
          >
            {glyph.shapes.map((shape, index) => (
              <path
                key={`${glyph.key}-${index}`}
                d={shape.d}
                transform={shape.transform}
                fill="currentColor"
              />
            ))}
          </g>
        )
      })}
    </Box>
  )
}
