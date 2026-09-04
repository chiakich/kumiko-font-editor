import type { OpenTypeFeaturesState } from '@/lib/openTypeFeatures'

export interface ShapingLanguageOption {
  id: string
  // OT tags as authored ("hani" / "ZHT").
  script: string
  language: string
  // What HarfBuzz's text API wants: ISO 15924 script, BCP47 language.
  hbScript?: string
  hbLanguage?: string
  label: string
}

// OT language-system tags → BCP47, for the tags CJK projects actually use.
// HarfBuzz maps BCP47 back onto OT language systems internally; feeding it a
// raw OT tag would silently miss.
const OT_LANGUAGE_TO_BCP47: Record<string, string> = {
  ZHT: 'zh-TW',
  ZHS: 'zh-CN',
  ZHH: 'zh-HK',
  ZHP: 'zh-phonetic',
  JAN: 'ja',
  KOR: 'ko',
  VIT: 'vi',
  ENG: 'en',
  ROM: 'ro',
  TRK: 'tr',
  AZE: 'az',
  CRT: 'crh',
  KAZ: 'kk',
  TAT: 'tt',
  MOL: 'mo',
  DEU: 'de',
  NLD: 'nl',
}

const toHbScript = (script: string) => {
  const trimmed = script.trim()
  if (!trimmed || trimmed.toUpperCase() === 'DFLT') {
    return undefined
  }
  return trimmed[0].toUpperCase() + trimmed.slice(1).toLowerCase()
}

const toHbLanguage = (language: string) => {
  const trimmed = language.trim().replace(/\s+$/, '')
  if (!trimmed || trimmed.toLowerCase() === 'dflt') {
    return undefined
  }
  return OT_LANGUAGE_TO_BCP47[trimmed.toUpperCase()] ?? trimmed.toLowerCase()
}

// The language systems the feature state declares, as shaping options. Only
// worth showing when something beyond DFLT/dflt exists — locl and per-script
// rules are unverifiable without it.
export const listShapingLanguageOptions = (
  state: OpenTypeFeaturesState | undefined
): ShapingLanguageOption[] => {
  const seen = new Set<string>()
  const options: ShapingLanguageOption[] = []
  for (const system of state?.languagesystems ?? []) {
    const key = `${system.script}/${system.language}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    const hbScript = toHbScript(system.script)
    const hbLanguage = toHbLanguage(system.language)
    if (!hbScript && !hbLanguage) {
      continue
    }
    options.push({
      id: system.id,
      script: system.script,
      language: system.language,
      hbScript,
      hbLanguage,
      label: key,
    })
  }
  return options
}
