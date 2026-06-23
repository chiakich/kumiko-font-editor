import type { FontAxes } from 'src/store'

const escapeXmlAttr = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const sameLocation = (
  a: Record<string, number>,
  b: Record<string, number>
): boolean => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) {
    if ((a[key] ?? 0) !== (b[key] ?? 0)) {
      return false
    }
  }
  return true
}

// Minimal .designspace (designspaceLib) parser: axes + sources. Instances and
// avar2 cross-axis rules are out of scope for the first multi-master import.
// Source/axis locations are keyed by axis NAME (the designspace dimension key);
// FontAxis carries both name and tag so the same key flows through interpolation.

export interface DesignspaceAxis {
  name: string
  tag: string
  minimum: number
  default: number
  maximum: number
  // avar 1 piecewise map, as [userValue, designValue] pairs.
  map?: Array<[number, number]>
}

export interface DesignspaceSource {
  filename: string
  name: string
  layer?: string
  styleName?: string
  location: Record<string, number>
}

export interface Designspace {
  axes: DesignspaceAxis[]
  sources: DesignspaceSource[]
  rules?: DesignspaceRule[]
}

export interface DesignspaceRule {
  name: string
  conditions: Record<string, { minimum?: number; maximum?: number }>
  substitutions: Array<{ name: string; with: string }>
}

const toNumber = (value: string | null | undefined, fallback = 0): number => {
  if (value == null) {
    return fallback
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const parseDesignspace = (
  text: string,
  context = 'designspace'
): Designspace => {
  const document = new DOMParser().parseFromString(text, 'application/xml')
  if (document.querySelector('parsererror')) {
    throw new Error(`Invalid designspace: ${context}`)
  }

  const axes: DesignspaceAxis[] = Array.from(
    document.querySelectorAll('axes > axis')
  ).map((axis) => {
    const map = Array.from(axis.querySelectorAll('map')).map(
      (entry) =>
        [
          toNumber(entry.getAttribute('input')),
          toNumber(entry.getAttribute('output')),
        ] as [number, number]
    )
    return {
      name: axis.getAttribute('name') ?? '',
      tag: axis.getAttribute('tag') ?? '',
      minimum: toNumber(axis.getAttribute('minimum')),
      default: toNumber(axis.getAttribute('default')),
      maximum: toNumber(axis.getAttribute('maximum')),
      ...(map.length ? { map } : {}),
    }
  })

  const sources: DesignspaceSource[] = Array.from(
    document.querySelectorAll('sources > source')
  ).map((source) => {
    const location: Record<string, number> = {}
    for (const dimension of Array.from(
      source.querySelectorAll('location > dimension')
    )) {
      const name = dimension.getAttribute('name')
      if (!name) {
        continue
      }
      location[name] = toNumber(
        dimension.getAttribute('xvalue') ??
          dimension.getAttribute('uservalue') ??
          dimension.getAttribute('value')
      )
    }
    const filename = source.getAttribute('filename') ?? ''
    const layer = source.getAttribute('layer') ?? undefined
    return {
      filename,
      name:
        source.getAttribute('name') ??
        source.getAttribute('stylename') ??
        filename,
      ...(layer ? { layer } : {}),
      styleName: source.getAttribute('stylename') ?? undefined,
      location,
    }
  })

  const rules: DesignspaceRule[] = Array.from(
    document.querySelectorAll('rules > rule')
  ).map((rule) => {
    const conditions: Record<string, { minimum?: number; maximum?: number }> =
      {}
    for (const condition of Array.from(rule.querySelectorAll('condition'))) {
      const name = condition.getAttribute('name')
      if (!name) {
        continue
      }
      conditions[name] = {
        ...(condition.hasAttribute('minimum')
          ? { minimum: toNumber(condition.getAttribute('minimum')) }
          : {}),
        ...(condition.hasAttribute('maximum')
          ? { maximum: toNumber(condition.getAttribute('maximum')) }
          : {}),
      }
    }
    const substitutions = Array.from(rule.querySelectorAll('sub')).map(
      (substitution) => ({
        name: substitution.getAttribute('name') ?? '',
        with: substitution.getAttribute('with') ?? '',
      })
    )
    return {
      name: rule.getAttribute('name') ?? '',
      conditions,
      substitutions,
    }
  })

  return { axes, sources, ...(rules.length > 0 ? { rules } : {}) }
}

export const designspaceToFontAxes = (designspace: Designspace): FontAxes => ({
  axes: designspace.axes.map((axis) => ({
    name: axis.name,
    label: axis.name,
    tag: axis.tag,
    minValue: axis.minimum,
    defaultValue: axis.default,
    maxValue: axis.maximum,
    ...(axis.map ? { mapping: axis.map } : {}),
  })),
  mappings: [],
})

// The design-space point where every axis is at its default — the default source
// sits here.
export const designspaceDefaultLocation = (
  designspace: Designspace
): Record<string, number> =>
  Object.fromEntries(designspace.axes.map((axis) => [axis.name, axis.default]))

export interface DesignspaceSourceOut {
  filename: string
  name: string
  location: Record<string, number>
  layer?: string
  familyName?: string
  styleName?: string
}

// Serialize FontData axes + sources back to a .designspace document. The source
// at the axis-defaults location is marked default via <info copy="1"/>.
export const serializeDesignspace = (
  axes: FontAxes | undefined,
  sources: DesignspaceSourceOut[],
  rules: DesignspaceRule[] = []
): string => {
  const axisEntries = axes?.axes ?? []
  const defaultLocation = Object.fromEntries(
    axisEntries.map((axis) => [axis.name, axis.defaultValue])
  )

  const axesXml = axisEntries
    .map((axis) => {
      const maps = (axis.mapping ?? [])
        .map(
          ([input, output]) =>
            `      <map input="${input}" output="${output}"/>`
        )
        .join('\n')
      const open = `    <axis tag="${escapeXmlAttr(axis.tag)}" name="${escapeXmlAttr(axis.name)}" minimum="${axis.minValue}" maximum="${axis.maxValue}" default="${axis.defaultValue}">`
      return maps ? `${open}\n${maps}\n    </axis>` : `${open}\n    </axis>`
    })
    .join('\n')

  const sourcesXml = sources
    .map((source) => {
      const dimensions = Object.entries(source.location)
        .map(
          ([name, value]) =>
            `      <dimension name="${escapeXmlAttr(name)}" xvalue="${value}"/>`
        )
        .join('\n')
      const isDefault = sameLocation(source.location, defaultLocation)
      const layerAttr = source.layer
        ? ` layer="${escapeXmlAttr(source.layer)}"`
        : ''
      return [
        `    <source filename="${escapeXmlAttr(source.filename)}" name="${escapeXmlAttr(source.name)}" stylename="${escapeXmlAttr(source.styleName ?? source.name)}"${layerAttr}>`,
        ...(source.familyName
          ? [
              `      <familyname>${escapeXmlAttr(source.familyName)}</familyname>`,
            ]
          : []),
        ...(isDefault ? ['      <info copy="1"/>'] : []),
        '      <location>',
        dimensions,
        '      </location>',
        '    </source>',
      ].join('\n')
    })
    .join('\n')

  const rulesXml = rules
    .map((rule) => {
      const conditions = Object.entries(rule.conditions)
        .map(([name, condition]) =>
          [
            `        <condition name="${escapeXmlAttr(name)}"`,
            condition.minimum !== undefined
              ? ` minimum="${condition.minimum}"`
              : '',
            condition.maximum !== undefined
              ? ` maximum="${condition.maximum}"`
              : '',
            '/>',
          ].join('')
        )
        .join('\n')
      const substitutions = rule.substitutions
        .map(
          (substitution) =>
            `      <sub name="${escapeXmlAttr(substitution.name)}" with="${escapeXmlAttr(substitution.with)}"/>`
        )
        .join('\n')
      return [
        `    <rule name="${escapeXmlAttr(rule.name)}">`,
        '      <conditionset>',
        conditions,
        '      </conditionset>',
        substitutions,
        '    </rule>',
      ].join('\n')
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<designspace format="4.1">
  <axes>
${axesXml}
  </axes>
  <sources>
${sourcesXml}
  </sources>
${rulesXml ? `  <rules processing="last">\n${rulesXml}\n  </rules>\n` : ''}</designspace>
`
}
