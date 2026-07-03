import {
  Box,
  Button,
  Heading,
  HStack,
  Image,
  Stack,
  Text,
} from '@chakra-ui/react'
import { Plus } from 'iconoir-react'
import logoUrl from 'src/assets/logo.svg'
import { useTranslation } from 'react-i18next'

interface HomeHeaderProps {
  isCreatingNewProject: boolean
  onCreateNewProject: () => void | Promise<void>
}

export function HomeHeader({
  isCreatingNewProject,
  onCreateNewProject,
}: HomeHeaderProps) {
  const { t } = useTranslation()

  return (
    <Stack
      mt={4}
      mb={8}
      direction={{ base: 'column', md: 'row' }}
      align={{ base: 'stretch', md: 'center' }}
      justify="space-between"
      gap={{ base: 5, md: 6 }}
    >
      <HStack align="center" gap={{ base: 4, md: 6 }} minW={0}>
        <Image
          src={logoUrl}
          alt={t('home.kumikoFontEditor')}
          boxSize={{ base: '72px', md: '112px' }}
          flexShrink={0}
          mt="15px"
          // logo.svg is monochrome black line-art rendered as <img> (can't use
          // currentColor) — invert it in dark mode to a soft near-white
          _dark={{ filter: 'invert(0.9)' }}
        />
        <Box minW={0}>
          <Text
            fontFamily="mono"
            fontSize="10px"
            fontWeight="900"
            letterSpacing="0.16em"
            color="mutedForeground"
          >
            {t('home.fullWebBasedFontEditor')}
          </Text>
          <Heading
            mt={1}
            fontSize={{ base: '46px', md: '76px' }}
            lineHeight="0.82"
            letterSpacing="0"
            color="foreground"
            fontWeight="700"
            fontFamily="'SF Pro Display', 'SF Pro Text', -apple-system, BlinkMacSystemFont,'Noto Sans TC', sans-serif"
          >
            {t('home.kumiko')}
            <br />
            {t('home.fontEditor')}
          </Heading>
        </Box>
      </HStack>
      <Button
        alignSelf={{ base: 'stretch', md: 'flex-start' }}
        flexShrink={0}
        loading={isCreatingNewProject}
        loadingText={t('home.creatingNewProject')}
        onClick={() => void onCreateNewProject()}
      >
        <Plus />
        {t('home.createNewProject')}
      </Button>
    </Stack>
  )
}
