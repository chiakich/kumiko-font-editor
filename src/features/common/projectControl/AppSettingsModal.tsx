import { NativeSelect, Stack, Field, Dialog, Portal } from '@chakra-ui/react'
import { DialogCloseButton } from '@/components/ui/dialog-close-button'
import {
  saveGlyphColorLabelDisplayMode,
  useGlyphColorLabelDisplayMode,
  type GlyphColorLabelDisplayMode,
} from 'src/lib/preferences/appPreferences'
import {
  saveColorMode,
  useColorModePreference,
  type ColorModePreference,
} from 'src/lib/preferences/colorMode'
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
  const colorMode = useColorModePreference()

  const changeLanguage = (language: SupportedLanguage) => {
    void i18n.changeLanguage(language)
  }

  const changeColorMode = (mode: ColorModePreference) => {
    saveColorMode(mode)
  }

  const changeGlyphColorLabelDisplayMode = (
    mode: GlyphColorLabelDisplayMode
  ) => {
    saveGlyphColorLabelDisplayMode(mode)
  }

  return (
    <Dialog.Root
      open={isOpen}
      size="sm"
      onOpenChange={(e) => {
        if (!e.open) {
          onClose()
        }
      }}
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content borderRadius="lg">
            <Dialog.Header>{t('settings.title')}</Dialog.Header>
            <DialogCloseButton />
            <Dialog.Body pb={6}>
              <Stack gap={4}>
                <Field.Root>
                  <Field.Label textStyle="label">
                    {t('settings.appearance')}
                  </Field.Label>
                  <NativeSelect.Root>
                    <NativeSelect.Field
                      value={colorMode}
                      onChange={(event) =>
                        changeColorMode(
                          event.target.value as ColorModePreference
                        )
                      }
                    >
                      <option value="light">
                        {t('settings.appearanceLight')}
                      </option>
                      <option value="dark">
                        {t('settings.appearanceDark')}
                      </option>
                      <option value="system">
                        {t('settings.appearanceSystem')}
                      </option>
                    </NativeSelect.Field>
                    <NativeSelect.Indicator />
                  </NativeSelect.Root>
                </Field.Root>
                <Field.Root>
                  <Field.Label textStyle="label">
                    {t('settings.language')}
                  </Field.Label>
                  <NativeSelect.Root>
                    <NativeSelect.Field
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
                    </NativeSelect.Field>
                    <NativeSelect.Indicator />
                  </NativeSelect.Root>
                </Field.Root>
                <Field.Root>
                  <Field.Label textStyle="label">
                    {t('settings.glyphColorLabelDisplay')}
                  </Field.Label>
                  <NativeSelect.Root>
                    <NativeSelect.Field
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
                    </NativeSelect.Field>
                    <NativeSelect.Indicator />
                  </NativeSelect.Root>
                </Field.Root>
              </Stack>
            </Dialog.Body>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}
