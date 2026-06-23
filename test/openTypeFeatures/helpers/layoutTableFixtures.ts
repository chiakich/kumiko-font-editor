import {
  makeBytes,
  writeTag,
  writeUint16,
  writeUint32,
} from './binaryTableFixtures'

export { makeSfnt } from './binaryTableFixtures'

export const makeMinimalGsubTable = () =>
  makeBytes(58, (view) => {
    writeUint16(view, 0, 1)
    writeUint16(view, 2, 0)
    writeUint16(view, 4, 10)
    writeUint16(view, 6, 30)
    writeUint16(view, 8, 44)

    writeUint16(view, 10, 1)
    writeTag(view, 12, 'latn')
    writeUint16(view, 16, 8)

    writeUint16(view, 18, 4)
    writeUint16(view, 20, 0)

    writeUint16(view, 22, 0)
    writeUint16(view, 24, 0xffff)
    writeUint16(view, 26, 1)
    writeUint16(view, 28, 0)

    writeUint16(view, 30, 1)
    writeTag(view, 32, 'liga')
    writeUint16(view, 36, 8)

    writeUint16(view, 38, 0)
    writeUint16(view, 40, 1)
    writeUint16(view, 42, 0)

    writeUint16(view, 44, 1)
    writeUint16(view, 46, 4)

    writeUint16(view, 48, 6)
    writeUint16(view, 50, 0x0008)
    writeUint16(view, 52, 1)
    writeUint16(view, 54, 8)
    writeUint16(view, 56, 3)
  })

export const makeGsubTable = (
  featureTag: string,
  lookupType: number,
  subtable: Uint8Array
) => {
  const tableLength = 56 + subtable.byteLength
  const bytes = makeBytes(tableLength, (view) => {
    writeUint16(view, 0, 1)
    writeUint16(view, 2, 0)
    writeUint16(view, 4, 10)
    writeUint16(view, 6, 30)
    writeUint16(view, 8, 44)

    writeUint16(view, 10, 1)
    writeTag(view, 12, 'latn')
    writeUint16(view, 16, 8)

    writeUint16(view, 18, 4)
    writeUint16(view, 20, 0)

    writeUint16(view, 22, 0)
    writeUint16(view, 24, 0xffff)
    writeUint16(view, 26, 1)
    writeUint16(view, 28, 0)

    writeUint16(view, 30, 1)
    writeTag(view, 32, featureTag)
    writeUint16(view, 36, 8)

    writeUint16(view, 38, 0)
    writeUint16(view, 40, 1)
    writeUint16(view, 42, 0)

    writeUint16(view, 44, 1)
    writeUint16(view, 46, 4)

    writeUint16(view, 48, lookupType)
    writeUint16(view, 50, 0)
    writeUint16(view, 52, 1)
    writeUint16(view, 54, 8)
  })
  bytes.set(subtable, 56)
  return bytes
}

export const makeGposTable = (
  featureTag: string,
  lookupType: number,
  subtable: Uint8Array
) => {
  const tableLength = 56 + subtable.byteLength
  const bytes = makeBytes(tableLength, (view) => {
    writeUint16(view, 0, 1)
    writeUint16(view, 2, 0)
    writeUint16(view, 4, 10)
    writeUint16(view, 6, 30)
    writeUint16(view, 8, 44)

    writeUint16(view, 10, 1)
    writeTag(view, 12, 'latn')
    writeUint16(view, 16, 8)

    writeUint16(view, 18, 4)
    writeUint16(view, 20, 0)

    writeUint16(view, 22, 0)
    writeUint16(view, 24, 0xffff)
    writeUint16(view, 26, 1)
    writeUint16(view, 28, 0)

    writeUint16(view, 30, 1)
    writeTag(view, 32, featureTag)
    writeUint16(view, 36, 8)

    writeUint16(view, 38, 0)
    writeUint16(view, 40, 1)
    writeUint16(view, 42, 0)

    writeUint16(view, 44, 1)
    writeUint16(view, 46, 4)

    writeUint16(view, 48, lookupType)
    writeUint16(view, 50, 0)
    writeUint16(view, 52, 1)
    writeUint16(view, 54, 8)
  })
  bytes.set(subtable, 56)
  return bytes
}

export const makeGposTableWithSubtables = (
  featureTag: string,
  lookupType: number,
  subtables: Uint8Array[]
) => {
  const lookupOffset = 48
  const lookupHeaderLength = 6 + subtables.length * 2
  const subtableStart = lookupOffset + lookupHeaderLength
  const tableLength =
    subtableStart +
    subtables.reduce((total, subtable) => total + subtable.byteLength, 0)
  const bytes = makeBytes(tableLength, (view) => {
    writeUint16(view, 0, 1)
    writeUint16(view, 2, 0)
    writeUint16(view, 4, 10)
    writeUint16(view, 6, 30)
    writeUint16(view, 8, 44)

    writeUint16(view, 10, 1)
    writeTag(view, 12, 'latn')
    writeUint16(view, 16, 8)

    writeUint16(view, 18, 4)
    writeUint16(view, 20, 0)

    writeUint16(view, 22, 0)
    writeUint16(view, 24, 0xffff)
    writeUint16(view, 26, 1)
    writeUint16(view, 28, 0)

    writeUint16(view, 30, 1)
    writeTag(view, 32, featureTag)
    writeUint16(view, 36, 8)

    writeUint16(view, 38, 0)
    writeUint16(view, 40, 1)
    writeUint16(view, 42, 0)

    writeUint16(view, 44, 1)
    writeUint16(view, 46, 4)

    writeUint16(view, lookupOffset, lookupType)
    writeUint16(view, lookupOffset + 2, 0)
    writeUint16(view, lookupOffset + 4, subtables.length)

    let cursor = lookupHeaderLength
    subtables.forEach((subtable, index) => {
      writeUint16(view, lookupOffset + 6 + index * 2, cursor)
      cursor += subtable.byteLength
    })
  })

  let cursor = subtableStart
  subtables.forEach((subtable) => {
    bytes.set(subtable, cursor)
    cursor += subtable.byteLength
  })
  return bytes
}

export const makeSingleSubstitutionSubtable = () =>
  makeBytes(14, (view) => {
    writeUint16(view, 0, 2)
    writeUint16(view, 2, 8)
    writeUint16(view, 4, 1)
    writeUint16(view, 6, 2)

    writeUint16(view, 8, 1)
    writeUint16(view, 10, 1)
    writeUint16(view, 12, 1)
  })

export const makeMultipleSubstitutionSubtable = () =>
  makeBytes(22, (view) => {
    writeUint16(view, 0, 1)
    writeUint16(view, 2, 8)
    writeUint16(view, 4, 1)
    writeUint16(view, 6, 14)

    writeUint16(view, 8, 1)
    writeUint16(view, 10, 1)
    writeUint16(view, 12, 1)

    writeUint16(view, 14, 3)
    writeUint16(view, 16, 2)
    writeUint16(view, 18, 3)
    writeUint16(view, 20, 4)
  })

export const makeAlternateSubstitutionSubtable = () =>
  makeBytes(20, (view) => {
    writeUint16(view, 0, 1)
    writeUint16(view, 2, 8)
    writeUint16(view, 4, 1)
    writeUint16(view, 6, 14)

    writeUint16(view, 8, 1)
    writeUint16(view, 10, 1)
    writeUint16(view, 12, 1)

    writeUint16(view, 14, 2)
    writeUint16(view, 16, 2)
    writeUint16(view, 18, 3)
  })

export const makeLigatureSubstitutionSubtable = () =>
  makeBytes(24, (view) => {
    writeUint16(view, 0, 1)
    writeUint16(view, 2, 8)
    writeUint16(view, 4, 1)
    writeUint16(view, 6, 14)

    writeUint16(view, 8, 1)
    writeUint16(view, 10, 1)
    writeUint16(view, 12, 1)

    writeUint16(view, 14, 1)
    writeUint16(view, 16, 4)

    writeUint16(view, 18, 3)
    writeUint16(view, 20, 2)
    writeUint16(view, 22, 2)
  })

export const makeExtensionSingleSubstitutionSubtable = () => {
  const innerSubtable = makeSingleSubstitutionSubtable()
  const bytes = makeBytes(8 + innerSubtable.byteLength, (view) => {
    writeUint16(view, 0, 1)
    writeUint16(view, 2, 1)
    writeUint32(view, 4, 8)
  })
  bytes.set(innerSubtable, 8)
  return bytes
}

export const makeContextSubstitutionSubtable = () =>
  makeBytes(28, (view) => {
    writeUint16(view, 0, 1)
    writeUint16(view, 2, 22)
    writeUint16(view, 4, 1)
    writeUint16(view, 6, 8)

    writeUint16(view, 8, 1)
    writeUint16(view, 10, 4)

    writeUint16(view, 12, 2)
    writeUint16(view, 14, 1)
    writeUint16(view, 16, 2)
    writeUint16(view, 18, 1)
    writeUint16(view, 20, 0)

    writeUint16(view, 22, 1)
    writeUint16(view, 24, 1)
    writeUint16(view, 26, 1)
  })

export const makeChainingContextSubstitutionSubtable = () =>
  makeBytes(36, (view) => {
    writeUint16(view, 0, 1)
    writeUint16(view, 2, 30)
    writeUint16(view, 4, 1)
    writeUint16(view, 6, 8)

    writeUint16(view, 8, 1)
    writeUint16(view, 10, 4)

    writeUint16(view, 12, 1)
    writeUint16(view, 14, 3)
    writeUint16(view, 16, 2)
    writeUint16(view, 18, 2)
    writeUint16(view, 20, 1)
    writeUint16(view, 22, 4)
    writeUint16(view, 24, 1)
    writeUint16(view, 26, 1)
    writeUint16(view, 28, 0)

    writeUint16(view, 30, 1)
    writeUint16(view, 32, 1)
    writeUint16(view, 34, 1)
  })

const writeCoverageFormat1 = (
  view: DataView,
  offset: number,
  glyphIds: number[]
) => {
  writeUint16(view, offset, 1)
  writeUint16(view, offset + 2, glyphIds.length)
  glyphIds.forEach((glyphId, index) => {
    writeUint16(view, offset + 4 + index * 2, glyphId)
  })
}

export const makeChainingContextSubstitutionFormat3Subtable = () =>
  makeBytes(50, (view) => {
    writeUint16(view, 0, 3)

    writeUint16(view, 2, 1)
    writeUint16(view, 4, 22)

    writeUint16(view, 6, 2)
    writeUint16(view, 8, 30)
    writeUint16(view, 10, 36)

    writeUint16(view, 12, 1)
    writeUint16(view, 14, 44)

    writeUint16(view, 16, 1)
    writeUint16(view, 18, 1)
    writeUint16(view, 20, 0)

    writeCoverageFormat1(view, 22, [3, 5])
    writeCoverageFormat1(view, 30, [1])
    writeCoverageFormat1(view, 36, [2, 6])
    writeCoverageFormat1(view, 44, [4])
  })

export const makeSinglePositioningSubtable = () =>
  makeBytes(14, (view) => {
    writeUint16(view, 0, 1)
    writeUint16(view, 2, 8)
    writeUint16(view, 4, 0x0004)
    writeUint16(view, 6, 0xffce)

    writeUint16(view, 8, 1)
    writeUint16(view, 10, 1)
    writeUint16(view, 12, 1)
  })

export const makeExtensionSinglePositioningSubtable = () => {
  const innerSubtable = makeSinglePositioningSubtable()
  const bytes = makeBytes(8 + innerSubtable.byteLength, (view) => {
    writeUint16(view, 0, 1)
    writeUint16(view, 2, 1)
    writeUint32(view, 4, 8)
  })
  bytes.set(innerSubtable, 8)
  return bytes
}

export const makePairPositioningSubtable = () =>
  makeBytes(26, (view) => {
    writeUint16(view, 0, 1)
    writeUint16(view, 2, 14)
    writeUint16(view, 4, 0x0004)
    writeUint16(view, 6, 0)
    writeUint16(view, 8, 1)
    writeUint16(view, 10, 20)

    writeUint16(view, 14, 1)
    writeUint16(view, 16, 1)
    writeUint16(view, 18, 1)

    writeUint16(view, 20, 1)
    writeUint16(view, 22, 2)
    writeUint16(view, 24, 0xffb0)
  })

export const makeUnsupportedPositioningSubtable = () =>
  makeBytes(2, (view) => {
    writeUint16(view, 0, 3)
  })

export const makeDummyTable = (length = 4) => new Uint8Array(length)
