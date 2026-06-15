import { Box, Heading, HStack, Image, Text } from '@chakra-ui/react'
import logoUrl from 'src/assets/logo.svg'
import { useTranslation } from 'react-i18next'

export function HomeHeader() {
  const { t } = useTranslation()

  return (
    <HStack mt={4} mb={8} align="center" spacing={{ base: 4, md: 6 }}>
      <Image
        src={logoUrl}
        alt={t('home.kumikoFontEditor')}
        boxSize={{ base: '72px', md: '112px' }}
        flexShrink={0}
        mt="15px"
      />
      <Box minW={0}>
        <Text
          fontFamily="mono"
          fontSize="10px"
          fontWeight="900"
          letterSpacing="0.16em"
          color="field.muted"
        >
          {t('home.fullWebBasedFontEditor')}
        </Text>
        <Heading
          mt={1}
          fontSize={{ base: '46px', md: '76px' }}
          lineHeight="0.82"
          letterSpacing="0"
          color="field.ink"
          fontWeight="700"
          fontFamily="'SF Pro Display', 'SF Pro Text', -apple-system, BlinkMacSystemFont,'Noto Sans TC', sans-serif"
        >
          {t('home.kumiko')}
          <br />
          {t('home.fontEditor')}
        </Heading>
      </Box>
    </HStack>
  )
}
