import {
  Box,
  Button,
  FormControl,
  FormLabel,
  HStack,
  Input,
  Grid,
  Stack,
  Text,
  IconButton,
  Select,
} from '@chakra-ui/react'
import { XmarkCircle } from 'iconoir-react'

import { getLanguageOptions } from './languages'

const COMMON_LANGUAGES = getLanguageOptions()

const editableNameKeys = [
  ['fontFamily', 'Family name'],
  ['preferredFamily', 'Preferred family name'],
  ['fontSubfamily', 'Subfamily name'],
  ['preferredSubfamily', 'Preferred subfamily name'],
  ['fullName', 'Full name'],
  ['designer', 'Designer'],
  ['manufacturer', 'Manufacturer'],
  ['copyright', 'Copyright'],
  ['trademark', 'Trademark'],
  ['license', 'License'],
  ['licenseURL', 'License URL'],
] as const

interface LocalizedNamesEditorProps {
  localizedNames: Record<string, Record<string, string>>
  onChange: (localizedNames: Record<string, Record<string, string>>) => void
}

export function LocalizedNamesEditor({
  localizedNames,
  onChange,
}: LocalizedNamesEditorProps) {
  const updateValue = (nameKey: string, language: string, value: string) => {
    onChange({
      ...localizedNames,
      [nameKey]: {
        ...(localizedNames[nameKey] ?? {}),
        [language]: value,
      },
    })
  }

  const updateLanguage = (
    nameKey: string,
    previousLanguage: string,
    nextLanguage: string
  ) => {
    const names = { ...(localizedNames[nameKey] ?? {}) }
    const value = names[previousLanguage] ?? ''
    delete names[previousLanguage]
    names[nextLanguage || previousLanguage] = value
    onChange({ ...localizedNames, [nameKey]: names })
  }

  const removeLanguage = (nameKey: string, language: string) => {
    const names = { ...(localizedNames[nameKey] ?? {}) }
    delete names[language]
    onChange({ ...localizedNames, [nameKey]: names })
  }

  return (
    <Stack spacing={4}>
      {editableNameKeys.map(([nameKey, label]) => {
        const entries = Object.entries(localizedNames[nameKey] ?? {})
        return (
          <Box key={nameKey} borderWidth="1px" p={3}>
            <HStack justify="space-between" mb={3}>
              <Text fontWeight="semibold">{label}</Text>
              <Button
                size="sm"
                onClick={() =>
                  updateValue(
                    nameKey,
                    entries.some(([language]) => language === 'en')
                      ? `lang-${entries.length + 1}`
                      : 'en',
                    ''
                  )
                }
              >
                +
              </Button>
            </HStack>
            <Grid templateColumns="240px 1fr min-content" gap={2}>
              {entries.map(([language, value]) => (
                <>
                  <FormControl>
                    <FormLabel fontSize="xs">Language</FormLabel>
                    <Select
                      value={language}
                      onChange={(event) =>
                        updateLanguage(nameKey, language, event.target.value)
                      }
                    >
                      {!COMMON_LANGUAGES.some((l) => l.tag === language) &&
                        language && (
                          <option value={language}>{language}</option>
                        )}
                      {COMMON_LANGUAGES.map((lang) => (
                        <option key={lang.tag} value={lang.tag}>
                          {lang.label} ({lang.tag})
                        </option>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl>
                    <FormLabel fontSize="xs">Value</FormLabel>
                    <Input
                      value={value}
                      onChange={(event) =>
                        updateValue(nameKey, language, event.target.value)
                      }
                    />
                  </FormControl>
                  <IconButton
                    alignSelf="end"
                    variant="ghost"
                    onClick={() => removeLanguage(nameKey, language)}
                    width="20px"
                    aria-label="Delete"
                    borderRadius="full"
                    _hover={{ bg: 'transparent', color: 'red.500' }}
                    icon={
                      <XmarkCircle width={20} height={20} aria-hidden="true" />
                    }
                  />
                </>
              ))}
            </Grid>
          </Box>
        )
      })}
    </Stack>
  )
}
