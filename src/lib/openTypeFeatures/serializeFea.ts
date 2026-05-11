import type {
  FeaDocument,
  FeaNode,
  GeneratedFeaSourceMap,
} from 'src/lib/openTypeFeatures/feaAst'
import {
  formatAnchor,
  formatGlyphList,
  formatGlyphSelector,
  formatLookupFlags,
  formatMarkAttachment,
  formatValueRecord,
} from 'src/lib/openTypeFeatures/feaFormat'

interface SerializeContext {
  lines: string[]
  sourceMap: GeneratedFeaSourceMap
}

const pushLine = (context: SerializeContext, line: string) => {
  context.lines.push(line)
  return context.lines.length
}

const serializeNodes = (
  nodes: FeaNode[],
  context: SerializeContext,
  indentLevel: number
) => {
  for (const node of nodes) {
    serializeNode(node, context, indentLevel)
  }
}

const serializeLookupBlock = (
  node: Extract<FeaNode, { kind: 'LookupBlock' }>,
  context: SerializeContext,
  indent: string,
  indentLevel: number
) => {
  pushLine(context, `${indent}# kumiko-lookup-id: ${node.lookupId}`)
  const lineStart = pushLine(context, `${indent}lookup ${node.name} {`)
  serializeNodes(node.statements, context, indentLevel + 1)
  const lineEnd = pushLine(context, `${indent}} ${node.name};`)
  context.sourceMap.entries.push({
    lookupId: node.lookupId,
    lineStart,
    lineEnd,
  })
}

const serializeFeatureBlock = (
  node: Extract<FeaNode, { kind: 'FeatureBlock' }>,
  context: SerializeContext,
  indent: string,
  indentLevel: number
) => {
  pushLine(context, `${indent}# kumiko-feature-id: ${node.featureId}`)
  const lineStart = pushLine(context, `${indent}feature ${node.tag} {`)
  serializeNodes(node.statements, context, indentLevel + 1)
  const lineEnd = pushLine(context, `${indent}} ${node.tag};`)
  context.sourceMap.entries.push({
    featureId: node.featureId,
    lineStart,
    lineEnd,
  })
}

const serializeSubstitution = (
  node: Extract<FeaNode, { kind: 'Substitution' }>,
  context: SerializeContext,
  indent: string
) => {
  if (node.ruleId) {
    pushLine(context, `${indent}# kumiko-rule-id: ${node.ruleId}`)
  }
  const lineStart = context.lines.length + 1
  const pattern = node.pattern.map(formatGlyphSelector).join(' ')
  if (node.alternates) {
    pushLine(
      context,
      `${indent}sub ${pattern} from ${formatGlyphList(node.alternates)};`
    )
  } else {
    pushLine(
      context,
      `${indent}sub ${pattern} by ${node.replacement.join(' ')};`
    )
  }
  if (node.ruleId) {
    context.sourceMap.entries.push({
      ruleId: node.ruleId,
      lineStart,
      lineEnd: lineStart,
    })
  }
}

const serializePositioning = (
  node: Extract<FeaNode, { kind: 'Positioning' }>,
  context: SerializeContext,
  indent: string
) => {
  if (node.ruleId) {
    pushLine(context, `${indent}# kumiko-rule-id: ${node.ruleId}`)
  }
  const lineStart = context.lines.length + 1
  const left = formatGlyphSelector(node.left)
  const first = formatValueRecord(node.firstValue)
  const second = formatValueRecord(node.secondValue)
  if (node.right) {
    const right = formatGlyphSelector(node.right)
    pushLine(
      context,
      `${indent}pos ${left} ${right}${first ? ` ${first}` : ''}${second ? ` ${second}` : ''};`
    )
  } else {
    pushLine(context, `${indent}pos ${left} ${first};`)
  }
  if (node.ruleId) {
    context.sourceMap.entries.push({
      ruleId: node.ruleId,
      lineStart,
      lineEnd: lineStart,
    })
  }
}

const serializeContextualSubstitution = (
  node: Extract<FeaNode, { kind: 'ContextualSubstitution' }>,
  context: SerializeContext,
  indent: string
) => {
  if (node.ruleId) {
    pushLine(context, `${indent}# kumiko-rule-id: ${node.ruleId}`)
  }
  const lineStart = context.lines.length + 1
  const backtrack = node.backtrack.map(formatGlyphSelector)
  const input = node.input.map((entry) => {
    const selector = `${formatGlyphSelector(entry.selector)}'`
    return entry.lookupNames.reduce(
      (value, lookupName) => `${value} lookup ${lookupName}`,
      selector
    )
  })
  const lookahead = node.lookahead.map(formatGlyphSelector)
  pushLine(
    context,
    `${indent}sub ${[...backtrack, ...input, ...lookahead].join(' ')};`
  )
  recordRuleSource(context, node.ruleId, lineStart, lineStart)
}

const recordRuleSource = (
  context: SerializeContext,
  ruleId: string | undefined,
  lineStart: number,
  lineEnd: number
) => {
  if (ruleId) {
    context.sourceMap.entries.push({ ruleId, lineStart, lineEnd })
  }
}

const serializeMarkToBase = (
  node: Extract<FeaNode, { kind: 'MarkToBase' }>,
  context: SerializeContext,
  indent: string
) => {
  if (node.ruleId) {
    pushLine(context, `${indent}# kumiko-rule-id: ${node.ruleId}`)
  }
  const lineStart = context.lines.length + 1
  const marks = node.marks.map(formatMarkAttachment).join(' ')
  pushLine(
    context,
    `${indent}pos base ${formatGlyphSelector(node.base)} ${marks};`
  )
  recordRuleSource(context, node.ruleId, lineStart, lineStart)
}

const serializeMarkToMark = (
  node: Extract<FeaNode, { kind: 'MarkToMark' }>,
  context: SerializeContext,
  indent: string
) => {
  if (node.ruleId) {
    pushLine(context, `${indent}# kumiko-rule-id: ${node.ruleId}`)
  }
  const lineStart = context.lines.length + 1
  const marks = node.marks.map(formatMarkAttachment).join(' ')
  pushLine(
    context,
    `${indent}pos mark ${formatGlyphSelector(node.baseMark)} ${marks};`
  )
  recordRuleSource(context, node.ruleId, lineStart, lineStart)
}

const formatLigatureComponent = (
  marks: Extract<FeaNode, { kind: 'MarkToLigature' }>['componentMarks'][number],
  index: number
) =>
  `${index === 0 ? '' : 'ligComponent '}${marks.map(formatMarkAttachment).join(' ')}`

const serializeMarkToLigature = (
  node: Extract<FeaNode, { kind: 'MarkToLigature' }>,
  context: SerializeContext,
  indent: string
) => {
  if (node.ruleId) {
    pushLine(context, `${indent}# kumiko-rule-id: ${node.ruleId}`)
  }
  const lineStart = context.lines.length + 1
  const components = node.componentMarks.map(formatLigatureComponent).join(' ')
  pushLine(
    context,
    `${indent}pos ligature ${formatGlyphSelector(node.ligature)} ${components};`
  )
  recordRuleSource(context, node.ruleId, lineStart, lineStart)
}

function serializeNode(
  node: FeaNode,
  context: SerializeContext,
  indentLevel: number
) {
  const indent = '  '.repeat(indentLevel)
  switch (node.kind) {
    case 'LanguageSystem':
      pushLine(
        context,
        `${indent}languagesystem ${node.script} ${node.language};`
      )
      return
    case 'GlyphClass':
      pushLine(
        context,
        `${indent}${node.name} = ${formatGlyphList(node.glyphs)};`
      )
      return
    case 'MarkClass':
      pushLine(
        context,
        `${indent}markClass ${node.glyph} ${formatAnchor(node.anchor)} ${node.className};`
      )
      return
    case 'LookupFlag':
      pushLine(
        context,
        `${indent}lookupflag ${formatLookupFlags(node.flags, node.markFilteringSetName)};`
      )
      return
    case 'LookupBlock':
      serializeLookupBlock(node, context, indent, indentLevel)
      return
    case 'FeatureBlock':
      serializeFeatureBlock(node, context, indent, indentLevel)
      return
    case 'ScriptStatement':
      pushLine(context, `${indent}script ${node.script};`)
      return
    case 'LanguageStatement':
      pushLine(context, `${indent}language ${node.language};`)
      return
    case 'Substitution':
      serializeSubstitution(node, context, indent)
      return
    case 'ContextualSubstitution':
      serializeContextualSubstitution(node, context, indent)
      return
    case 'Positioning':
      serializePositioning(node, context, indent)
      return
    case 'MarkToBase':
      serializeMarkToBase(node, context, indent)
      return
    case 'MarkToMark':
      serializeMarkToMark(node, context, indent)
      return
    case 'MarkToLigature':
      serializeMarkToLigature(node, context, indent)
      return
    case 'Raw':
      node.value.split(/\r?\n/).forEach((line) => pushLine(context, line))
      return
    case 'Comment':
      pushLine(context, `${indent}# ${node.value}`)
      return
  }
}

export const serializeFeaDocument = (document: FeaDocument) => {
  const context: SerializeContext = {
    lines: [],
    sourceMap: { entries: [] },
  }
  serializeNodes(document.statements, context, 0)
  return {
    text: `${context.lines.join('\n')}\n`,
    sourceMap: context.sourceMap,
  }
}
