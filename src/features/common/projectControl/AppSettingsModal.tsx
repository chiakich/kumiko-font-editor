import {
  FormControl,
  FormLabel,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Select,
  Stack,
} from '@chakra-ui/react'
import {
  saveGlyphColorLabelDisplayMode,
  useGlyphColorLabelDisplayMode,
  type GlyphColorLabelDisplayMode,
} from 'src/lib/preferences/appPreferences'
import {
  languageNames,
  supportedLanguages,
  type SupportedLanguage,
} from 'src/i18n'
import { useTranslation } from 'react-i18next'

interface AppSettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export function AppSettingsModal({ isOpen, onClose }: AppSettingsModalProps) {
  const { i18n, t } = useTranslation()
  const activeLanguage = i18n.resolvedLanguage ?? i18n.language
  const glyphColorLabelDisplayMode = useGlyphColorLabelDisplayMode()

  const changeLanguage = (language: SupportedLanguage) => {
    void i18n.changeLanguage(language)
  }

  const changeGlyphColorLabelDisplayMode = (
    mode: GlyphColorLabelDisplayMode
  ) => {
    saveGlyphColorLabelDisplayMode(mode)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm">
      <ModalOverlay />
      <ModalContent borderRadius="sm">
        <ModalHeader>{t('settings.title')}</ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={6}>
          <Stack spacing={4}>
            <FormControl>
              <FormLabel fontSize="sm">{t('settings.language')}</FormLabel>
              <Select
                value={activeLanguage}
                onChange={(event) =>
                  changeLanguage(event.target.value as SupportedLanguage)
                }
              >
                {supportedLanguages.map((language) => (
                  <option key={language} value={language}>
                    {languageNames[language]}
                  </option>
                ))}
              </Select>
            </FormControl>
            <FormControl>
              <FormLabel fontSize="sm">
                {t('settings.glyphColorLabelDisplay')}
              </FormLabel>
              <Select
                value={glyphColorLabelDisplayMode}
                onChange={(event) =>
                  changeGlyphColorLabelDisplayMode(
                    event.target.value as GlyphColorLabelDisplayMode
                  )
                }
              >
                <option value="card">
                  {t('settings.glyphColorLabelDisplayCard')}
                </option>
                <option value="dot">
                  {t('settings.glyphColorLabelDisplayDot')}
                </option>
              </Select>
            </FormControl>
          </Stack>
        </ModalBody>
      </ModalContent>
    </Modal>
  )
}
