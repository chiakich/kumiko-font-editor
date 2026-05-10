import type {
  FeaDocument,
  FeaNode,
  GeneratedFeaSourceMap,
} from 'src/lib/openTypeFeatures/feaAst'
import {
  formatGlyphList,
  formatGlyphSelector,
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
        `${indent}markClass ${node.glyph} <anchor ${Math.round(node.anchor.x)} ${Math.round(node.anchor.y)}> ${node.className};`
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
    case 'Positioning':
      serializePositioning(node, context, indent)
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
