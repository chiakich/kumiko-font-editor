import type { FontAxes, FontExportInstance } from 'src/store'

const escapeXmlAttr = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

// Tolerance matches locationsMatch (designspaceLocation) so a source that the
// export guard accepts as the default location is also marked as default here;
// a strict comparison would leave near-default sources without <info copy>,
// making varLib fail with "no default source".
const LOCATION_MATCH_TOLERANCE = 1e-6

const sameLocation = (
  a: Record<string, number>,
  b: Record<string, number>
): boolean => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) {
    if (Math.abs((a[key] ?? 0) - (b[key] ?? 0)) > LOCATION_MATCH_TOLERANCE) {
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
  values?: number[]
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

export interface DesignspaceInstance {
  name?: string
  familyName?: string
  styleName?: string
  fileName?: string
  postScriptFontName?: string
  styleMapFamilyName?: string
  styleMapStyleName?: string
  location: Record<string, number>
}

export interface Designspace {
  axes: DesignspaceAxis[]
  sources: DesignspaceSource[]
  instances?: DesignspaceInstance[]
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

const childText = (element: Element, selector: string): string | undefined =>
  element.querySelector(selector)?.textContent?.trim() || undefined

const attrOrChildText = (element: Element, attr: string, selector: string) =>
  element.getAttribute(attr) ?? childText(element, selector)

const parseLocation = (element: Element): Record<string, number> => {
  const location: Record<string, number> = {}
  for (const dimension of Array.from(
    element.querySelectorAll('location > dimension')
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
  return location
}

const uniqueNumbers = (values: number[]) =>
  [...new Set(values.filter(Number.isFinite))].sort(
    (left, right) => left - right
  )

const parseAxisValues = (axis: Element): number[] => {
  const valueElements = [
    ...Array.from(axis.querySelectorAll('values > value')),
    ...Array.from(axis.children).filter(
      (child) => child.tagName.toLowerCase() === 'value'
    ),
  ]
  return uniqueNumbers(
    valueElements.map((valueElement) =>
      toNumber(
        valueElement.getAttribute('value') ??
          valueElement.getAttribute('uservalue') ??
          valueElement.getAttribute('xvalue') ??
          valueElement.textContent,
        Number.NaN
      )
    )
  )
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
    const values = parseAxisValues(axis)
    return {
      name: axis.getAttribute('name') ?? '',
      tag: axis.getAttribute('tag') ?? '',
      minimum: toNumber(axis.getAttribute('minimum')),
      default: toNumber(axis.getAttribute('default')),
      maximum: toNumber(axis.getAttribute('maximum')),
      ...(values.length ? { values } : {}),
      ...(map.length ? { map } : {}),
    }
  })

  const sources: DesignspaceSource[] = Array.from(
    document.querySelectorAll('sources > source')
  ).map((source) => {
    const location = parseLocation(source)
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

  const instances: DesignspaceInstance[] = Array.from(
    document.querySelectorAll('instances > instance')
  ).map((instance) => ({
    name: instance.getAttribute('name') ?? undefined,
    familyName: attrOrChildText(instance, 'familyname', 'familyname'),
    styleName: attrOrChildText(instance, 'stylename', 'stylename'),
    fileName: instance.getAttribute('filename') ?? undefined,
    postScriptFontName:
      attrOrChildText(instance, 'postscriptfontname', 'postscriptfontname') ??
      undefined,
    styleMapFamilyName:
      attrOrChildText(instance, 'stylemapfamilyname', 'stylemapfamilyname') ??
      undefined,
    styleMapStyleName:
      attrOrChildText(instance, 'stylemapstylename', 'stylemapstylename') ??
      undefined,
    location: parseLocation(instance),
  }))

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

  return {
    axes,
    sources,
    ...(instances.length > 0 ? { instances } : {}),
    ...(rules.length > 0 ? { rules } : {}),
  }
}

export const designspaceToFontAxes = (designspace: Designspace): FontAxes => ({
  axes: designspace.axes.map((axis) => ({
    name: axis.name,
    label: axis.name,
    tag: axis.tag,
    minValue: axis.minimum,
    defaultValue: axis.default,
    maxValue: axis.maximum,
    ...(axis.values ? { values: axis.values } : {}),
    ...(axis.map ? { mapping: axis.map } : {}),
  })),
  mappings: [],
})

const instanceId = (instance: DesignspaceInstance, index: number) => {
  const label =
    instance.name ??
    [instance.familyName, instance.styleName].filter(Boolean).join(' ') ??
    ''
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug ? `instance-${slug}` : `instance-${index + 1}`
}

export const designspaceToExportInstances = (
  designspace: Designspace
): FontExportInstance[] =>
  (designspace.instances ?? []).map((instance, index) => {
    const styleName =
      instance.styleName || instance.name || `Instance ${index + 1}`
    const name =
      instance.name ??
      [instance.familyName, styleName].filter(Boolean).join(' ') ??
      styleName
    return {
      id: instanceId(instance, index),
      name,
      styleName,
      location: instance.location,
      export: true,
      ...(instance.fileName ? { fileName: instance.fileName } : {}),
      ...(instance.familyName ? { familyName: instance.familyName } : {}),
      ...(instance.postScriptFontName ||
      instance.styleMapFamilyName ||
      instance.styleMapStyleName
        ? {
            customData: {
              ...(instance.postScriptFontName
                ? { postScriptFontName: instance.postScriptFontName }
                : {}),
              ...(instance.styleMapFamilyName
                ? { styleMapFamilyName: instance.styleMapFamilyName }
                : {}),
              ...(instance.styleMapStyleName
                ? { styleMapStyleName: instance.styleMapStyleName }
                : {}),
            },
          }
        : {}),
    }
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

export interface DesignspaceAxisLabelOut {
  name: string
  value: number
  elidable?: boolean
}

// Serialize FontData axes + sources back to a .designspace document. The source
// at the axis-defaults location is marked default via <info copy="1"/>.
export const serializeDesignspace = (
  axes: FontAxes | undefined,
  sources: DesignspaceSourceOut[],
  rules: DesignspaceRule[] = [],
  instances: FontExportInstance[] = [],
  // STAT axis value labels keyed by axis name (designspaceLib format 5). When
  // present the document is emitted as format 5.0 so varLib builds a STAT table.
  axisLabels: Record<string, DesignspaceAxisLabelOut[]> = {}
): string => {
  const axisEntries = axes?.axes ?? []
  const defaultLocation = Object.fromEntries(
    axisEntries.map((axis) => [axis.name, axis.defaultValue])
  )
  const hasAxisLabels = Object.values(axisLabels).some(
    (labels) => labels.length > 0
  )

  const axesXml = axisEntries
    .map((axis) => {
      const maps = (axis.mapping ?? [])
        .map(
          ([input, output]) =>
            `      <map input="${input}" output="${output}"/>`
        )
        .join('\n')
      const values = (axis.values ?? [])
        .map((value) => `      <value value="${value}"/>`)
        .join('\n')
      const labels = (axisLabels[axis.name] ?? [])
        .map(
          (label) =>
            `        <label uservalue="${label.value}" name="${escapeXmlAttr(
              label.name
            )}"${label.elidable ? ' elidable="true"' : ''}/>`
        )
        .join('\n')
      const labelsBlock = labels
        ? `      <labels>\n${labels}\n      </labels>`
        : ''
      // designspaceLib (fontTools/varLib) recognizes a discrete axis by the
      // `values` attribute on <axis>; the <values> child below is this project's
      // own round-trip convention. Emit both so varLib treats the axis as
      // discrete while our parser and the GitHub sync keep working.
      const discreteAttr =
        axis.values && axis.values.length > 0
          ? ` values="${axis.values.join(' ')}"`
          : ''
      const open = `    <axis tag="${escapeXmlAttr(axis.tag)}" name="${escapeXmlAttr(axis.name)}" minimum="${axis.minValue}" maximum="${axis.maxValue}" default="${axis.defaultValue}"${discreteAttr}>`
      return maps || values || labelsBlock
        ? [
            open,
            values ? `      <values>\n${values}\n      </values>` : '',
            maps,
            labelsBlock,
            '    </axis>',
          ]
            .filter(Boolean)
            .join('\n')
        : `${open}\n    </axis>`
    })
    .join('\n')

  // Exactly one source may carry <info copy="1"/>; mark only the first source
  // at the default location even if several coincide there.
  const defaultSourceIndex = sources.findIndex((source) =>
    sameLocation(source.location, defaultLocation)
  )
  const sourcesXml = sources
    .map((source, index) => {
      const dimensions = Object.entries(source.location)
        .map(
          ([name, value]) =>
            `      <dimension name="${escapeXmlAttr(name)}" xvalue="${value}"/>`
        )
        .join('\n')
      const isDefault = index === defaultSourceIndex
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

  const instancesXml = instances
    .filter((instance) => instance.export !== false)
    .map((instance) => {
      const dimensions = Object.entries(instance.location)
        .map(
          ([name, value]) =>
            `      <dimension name="${escapeXmlAttr(name)}" xvalue="${value}"/>`
        )
        .join('\n')
      const nameAttr = instance.name
        ? ` name="${escapeXmlAttr(instance.name)}"`
        : ''
      const familyAttr = instance.familyName
        ? ` familyname="${escapeXmlAttr(instance.familyName)}"`
        : ''
      const styleAttr = ` stylename="${escapeXmlAttr(
        instance.styleName || instance.name || instance.id
      )}"`
      const fileAttr = instance.fileName
        ? ` filename="${escapeXmlAttr(instance.fileName)}"`
        : ''
      return [
        `    <instance${nameAttr}${familyAttr}${styleAttr}${fileAttr}>`,
        '      <location>',
        dimensions,
        '      </location>',
        '    </instance>',
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
<designspace format="${hasAxisLabels ? '5.0' : '4.1'}">
  <axes>
${axesXml}
  </axes>
  <sources>
${sourcesXml}
  </sources>
${instancesXml ? `  <instances>\n${instancesXml}\n  </instances>\n` : ''}
${rulesXml ? `  <rules processing="last">\n${rulesXml}\n  </rules>\n` : ''}</designspace>
`
}
