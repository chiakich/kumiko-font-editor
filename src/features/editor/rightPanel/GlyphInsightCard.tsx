import {
  Badge,
  Box,
  HStack,
  Heading,
  Spinner,
  Stack,
  Switch,
  Text,
} from '@chakra-ui/react'
import { useMemo } from 'react'
import {
  buildRadarAdvice,
  type RadarAdvice,
} from 'src/features/common/qualityCheck/radarAdvice'
import { useGlyphInsight } from 'src/features/editor/insight/glyphInsight'

const MAX_VISIBLE_ADVICES = 4

function AdviceRow({ advice }: { advice: RadarAdvice }) {
  return (
    <Box>
      <HStack spacing={2} align="flex-start">
        <Box
          mt="6px"
          boxSize="8px"
          borderRadius="full"
          flexShrink={0}
          bg={advice.severity === 'warning' ? 'red.400' : 'orange.300'}
        />
        <Stack spacing={0.5}>
          <Text fontSize="sm" fontWeight="700">
            {advice.title}
          </Text>
          <Text fontSize="xs" color="field.muted" fontFamily="mono">
            {advice.detail}
          </Text>
          {advice.action ? (
            <Text fontSize="xs" color="field.muted">
              建議：{advice.action}
            </Text>
          ) : null}
        </Stack>
      </HStack>
    </Box>
  )
}

export function GlyphInsightCard() {
  const insight = useGlyphInsight()

  const advices = useMemo(
    () => insight.evaluation?.reasons.map(buildRadarAdvice) ?? [],
    [insight.evaluation]
  )

  if (insight.status === 'idle') {
    return null
  }

  return (
    <Box p={4} bg="field.panel" borderRadius="sm">
      <HStack justify="space-between" mb={3}>
        <Heading size="sm" textTransform="uppercase" color="field.ink">
          品質提示
        </Heading>
        {insight.status === 'ready' ? (
          <Badge colorScheme={advices.length === 0 ? 'green' : 'orange'}>
            {advices.length === 0 ? '良好' : `${advices.length} 項建議`}
          </Badge>
        ) : null}
      </HStack>

      {insight.status === 'analyzing' ? (
        <HStack spacing={2}>
          <Spinner size="xs" />
          <Text fontSize="xs" color="field.muted">
            正在背景分析字體統計基準…
          </Text>
        </HStack>
      ) : insight.status === 'insufficient' ? (
        <Text fontSize="xs" color="field.muted">
          漢字樣本不足（需 20 個以上），尚無法跟群體比較。
        </Text>
      ) : (
        <Stack spacing={3}>
          {advices.length === 0 ? (
            <Text fontSize="xs" color="field.muted">
              這個字的邊界、比例、墨量與重心都落在這套字的常見範圍內。
            </Text>
          ) : (
            <Stack spacing={2.5}>
              {advices.slice(0, MAX_VISIBLE_ADVICES).map((advice) => (
                <AdviceRow key={advice.key} advice={advice} />
              ))}
              {advices.length > MAX_VISIBLE_ADVICES ? (
                <Text fontSize="xs" color="field.muted">
                  其餘 {advices.length - MAX_VISIBLE_ADVICES} 項已省略。
                </Text>
              ) : null}
            </Stack>
          )}
          <HStack justify="space-between">
            <Text fontSize="xs" fontWeight="700">
              在畫布顯示分布帶
            </Text>
            <Switch
              size="sm"
              isChecked={insight.showBands}
              onChange={(event) => insight.setShowBands(event.target.checked)}
            />
          </HStack>
        </Stack>
      )}
    </Box>
  )
}
