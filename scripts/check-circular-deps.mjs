import madge from 'madge'

// Ratchet: the count may only go down. Lower BASELINE when you remove cycles.
const BASELINE = 31

const result = await madge('src/main.tsx', {
  fileExtensions: ['ts', 'tsx'],
  tsConfig: 'tsconfig.app.json',
})
const cycles = result.circular()

if (cycles.length > BASELINE) {
  console.error(
    `Found ${cycles.length} circular dependencies (baseline ${BASELINE}).`
  )
  for (const cycle of cycles) console.error(`  ${cycle.join(' > ')}`)
  process.exit(1)
}

console.log(`Circular dependencies: ${cycles.length} (baseline ${BASELINE}).`)
if (cycles.length < BASELINE) {
  console.log(
    'Lower BASELINE in scripts/check-circular-deps.mjs to lock it in.'
  )
}
