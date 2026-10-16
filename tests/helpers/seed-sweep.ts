/**
 * Seed-Sweep: beweist die Spielbarkeits-Invariante ueber viele Tage.
 *
 * Die alte Version hatte 11,8 % harte 180-Sekunden-Locks. Dieser Sweep
 * erzeugt N Seeds und prueft JEDEN gegen validateWorld. Ein einziger
 * Verstoss => Exit-Code 1.
 *
 * Aufruf: node --import tsx tests/helpers/seed-sweep.ts [anzahl]
 */

import { DAY_SECONDS } from '../../src/core/config.ts'
import { generateWorld, validateWorld } from '../../src/core/world.ts'
import { routeFeasibility } from './route-bot.ts'

const count = Number.parseInt(process.argv[2] ?? '20000', 10)
if (!Number.isFinite(count) || count <= 0) {
  console.error(`Ungueltige Seed-Anzahl: ${process.argv[2]}`)
  process.exit(2)
}

interface Failure {
  seed: string
  reason: string
}

const failures: Failure[] = []
const saltHistogram = new Map<number, number>()
let maxSalt = 0
let maxRouteSeconds = 0

const started = Date.now()
for (let i = 0; i < count; i++) {
  const seed = `sweep-${i}`
  try {
    const world = generateWorld(seed)
    saltHistogram.set(world.salt, (saltHistogram.get(world.salt) ?? 0) + 1)
    if (world.salt > maxSalt) maxSalt = world.salt

    const v = validateWorld(world)
    if (!v.ok) {
      failures.push({
        seed,
        reason: `spawnFree=${v.spawnFree} portalReachable=${v.portalReachable} unreachable=[${v.unreachable.join(',')}] echoes=${v.reachableEchoes}/${v.totalEchoes}`,
      })
      continue
    }

    // Erreichbarkeit ist nicht genug: der Tag muss auch IM ZEITBUDGET machbar sein.
    const route = routeFeasibility(world)
    if (route.seconds > maxRouteSeconds) maxRouteSeconds = route.seconds
    if (route.unreachable > 0) {
      failures.push({ seed, reason: `Route: ${route.unreachable} Echo(s) im Graphen unerreichbar` })
    } else if (route.seconds > DAY_SECONDS) {
      failures.push({
        seed,
        reason: `Route nicht im Budget: ${route.seconds.toFixed(1)}s > ${DAY_SECONDS.toFixed(1)}s (${route.pixels.toFixed(0)}px)`,
      })
    }
  } catch (error) {
    failures.push({ seed, reason: error instanceof Error ? error.message : String(error) })
  }
}

const elapsed = Date.now() - started
const saltSummary = [...saltHistogram.entries()].sort((a, b) => a[0] - b[0]).map(([s, n]) => `${s}:${n}`).join(' ')

console.log(`Seed-Sweep: ${count} Seeds geprueft in ${elapsed} ms`)
console.log(`Salt-Verteilung: ${saltSummary}`)
console.log(`Maximaler Salt: ${maxSalt}`)
console.log(
  `Route-Obergrenze: max ${maxRouteSeconds.toFixed(1)}s / Budget ${DAY_SECONDS.toFixed(1)}s (${((maxRouteSeconds / DAY_SECONDS) * 100).toFixed(0)} %)`,
)

if (failures.length > 0) {
  console.error(`\n${failures.length} Verletzung(en) der Spielbarkeits-Invariante:`)
  for (const f of failures.slice(0, 20)) {
    console.error(`  - ${f.seed}: ${f.reason}`)
  }
  if (failures.length > 20) console.error(`  ... und ${failures.length - 20} weitere`)
  process.exit(1)
}

console.log('Alle Tage sind spielbar. 0 Verletzungen.')
