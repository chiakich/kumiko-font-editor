import {
  Box,
  Button,
  HStack,
  Heading,
  Input,
  Stack,
  Switch,
  Text,
} from '@chakra-ui/react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  clearReferenceFont,
  loadReferenceFontFromFile,
} from 'src/lib/referenceFont/referenceFontStore'
import { useStore } from 'src/store'

export function ReferenceFontCard() {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  const referenceFontName = useStore((state) => state.referenceFontName)
  const referenceFontVisible = useStore((state) => state.referenceFontVisible)
  const referenceFontChar = useStore((state) => state.referenceFontChar)
  const setReferenceFontName = useStore((state) => state.setReferenceFontName)
  const setReferenceFontVisible = useStore(
    (state) => state.setReferenceFontVisible
  )
  const setReferenceFontChar = useStore((state) => state.setReferenceFontChar)

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) {
      return
    }
    setError(null)
    try {
      const name = await loadReferenceFontFromFile(file)
      setReferenceFontName(name)
      setReferenceFontVisible(true)
    } catch {
      setError(t('editor.referenceFontLoadFailed'))
    }
  }

  const handleClear = () => {
    clearReferenceFont()
    setReferenceFontName(null)
    setReferenceFontVisible(false)
    setError(null)
  }

  return (
    <Box p={4} bg="field.panel" borderRadius="sm">
      <Heading size="sm" textTransform="uppercase" color="field.ink" mb={3}>
        {t('editor.referenceFont')}
      </Heading>

      <Stack spacing={3}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".ttf,.otf,.woff"
          style={{ display: 'none' }}
          onChange={(event) => void handleFileChange(event)}
        />

        {referenceFontName ? (
          <HStack justify="space-between">
            <Text fontSize="sm" fontWeight="700" noOfLines={1}>
              {referenceFontName}
            </Text>
            <Button size="xs" variant="ghost" onClick={handleClear}>
              {t('editor.clearReferenceFont')}
            </Button>
          </HStack>
        ) : (
          <Button size="sm" onClick={() => fileInputRef.current?.click()}>
            {t('editor.loadReferenceFont')}
          </Button>
        )}

        {error ? (
          <Text fontSize="xs" color="red.400">
            {error}
          </Text>
        ) : null}

        {referenceFontName ? (
          <>
            <HStack justify="space-between">
              <Text fontSize="xs" fontWeight="700">
                {t('editor.referenceFontVisible')}
              </Text>
              <Switch
                size="sm"
                isChecked={referenceFontVisible}
                onChange={(event) =>
                  setReferenceFontVisible(event.target.checked)
                }
              />
            </HStack>

            <Box>
              <Text fontSize="xs" color="field.muted" mb={1}>
                {t('editor.referenceFontCharOverride')}
              </Text>
              <Input
                size="sm"
                maxLength={2}
                value={referenceFontChar ?? ''}
                onChange={(event) =>
                  setReferenceFontChar(event.target.value || null)
                }
                placeholder={t('editor.referenceFontCharOverridePlaceholder')}
              />
            </Box>
          </>
        ) : null}
      </Stack>
    </Box>
  )
}
