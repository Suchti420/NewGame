/**
 * Route-Feasibility-Bot.
 *
 * Der Seed-Sweep beweist bisher nur ERREICHBARKEIT. Das reicht nicht: ein Tag
 * kann strukturell gueltig und trotzdem im 180-Sekunden-Budget unschaffbar
 * sein. Genau der Fehler der alten Version (11,8 % harter Lock) war so einer.
 *
 * Dieser Bot berechnet eine KONSERVATIVE Obergrenze der noetigen Zeit:
 *   - jede ECHO wird einzeln geholt: Portal -> Echo -> Portal
 *     (das ist mehr als jede optimale Mehrfach-Tour, also eine sichere Schranke)
 *   - Weglänge per BFS ueber den Begehbarkeitsgraphen (4er-Nachbarschaft,
 *     keine Diagonalen) -> niemals kuerzer als der echte Weg
 *   - Geschwindigkeit immer voll beladen (langsamster Fall)
 *   - pauschaler Pack-Overhead pro Extraktion
 *
 * Faellt selbst diese Obergrenze unters Tagesbudget, ist der Tag BEWEISBAR
 * schaffbar. Kein Raten.
 */

import { CONFIG } from '../../src/core/config.ts'
import { speedFactor } from '../../src/core/simulation.ts'
import { buildWalkableGrid } from '../../src/core/world.ts'
import type { Vec, World } from '../../src/core/types.ts'

/** Konservativer Aufschlag fuer das Ein-/Umsortieren im Rucksack-Sheet. */
export const PACK_OVERHEAD_SECONDS = 20

export interface RouteFeasibility {
  /** Konservative Obergrenze der noetigen Sekunden. */
  seconds: number
  /** Summierte Wegstrecke in px (Obergrenze). */
  pixels: number
  /** Anzahl der Extraktions-Trips (bei voller Tragekapazitaet). */
  trips: number
  /** Laengste einzelne Portal-Echo-Strecke. */
  worstLegPixels: number
  /** Echos, die im Graphen nicht erreichbar sind (muss 0 sein). */
  unreachable: number
}

interface Grid {
  cols: number
  rows: number
  cell: number
  walkable: Uint8Array
}

function indexOf(grid: Grid, x: number, y: number): number {
  const gx = Math.floor(x / grid.cell)
  const gy = Math.floor(y / grid.cell)
  if (gx < 0 || gy < 0 || gx >= grid.cols || gy >= grid.rows) return -1
  return gy * grid.cols + gx
}

/** BFS-Zelldistanzen (in Schritten) von einem Ursprung. -1 = unerreichbar. */
function bfsDistances(grid: Grid, origin: Vec): Int32Array {
  const dist = new Int32Array(grid.cols * grid.rows).fill(-1)
  const start = indexOf(grid, origin.x, origin.y)
  if (start < 0 || grid.walkable[start] !== 1) return dist

  const queue = new Int32Array(grid.cols * grid.rows)
  let head = 0
  let tail = 0
  queue[tail++] = start
  dist[start] = 0

  while (head < tail) {
    const idx = queue[head++] as number
    const gx = idx % grid.cols
    const gy = (idx - gx) / grid.cols
    const d = (dist[idx] as number) + 1

    const candidates = [
      gx > 0 ? idx - 1 : -1,
      gx < grid.cols - 1 ? idx + 1 : -1,
      gy > 0 ? idx - grid.cols : -1,
      gy < grid.rows - 1 ? idx + grid.cols : -1,
    ]
    for (const n of candidates) {
      if (n < 0 || dist[n] !== -1 || grid.walkable[n] !== 1) continue
      dist[n] = d
      queue[tail++] = n
    }
  }
  return dist
}

export function routeFeasibility(world: World): RouteFeasibility {
  const grid = buildWalkableGrid(world.walls)
  const dist = bfsDistances(grid, world.portal)

  let pixels = 0
  let worstLegPixels = 0
  let unreachable = 0

  for (const echo of world.echoes) {
    const idx = indexOf(grid, echo.x, echo.y)
    const steps = idx >= 0 ? (dist[idx] as number) : -1
    if (steps < 0) {
      unreachable++
      continue
    }
    const leg = steps * grid.cell
    if (leg > worstLegPixels) worstLegPixels = leg
    pixels += 2 * leg // hin und zurueck, ein Echo pro Trip
  }

  // Langsamster Fall: voll beladen.
  const speed = CONFIG.player.walkSpeed * speedFactor(CONFIG.carry.max)
  const trips = Math.ceil(world.echoes.length / CONFIG.carry.max)
  const seconds = pixels / speed + trips * PACK_OVERHEAD_SECONDS

  return { seconds, pixels, trips, worstLegPixels, unreachable }
}

/** true, wenn der Tag selbst mit der konservativen Obergrenze schaffbar ist. */
export function isRouteFeasible(world: World): boolean {
  const r = routeFeasibility(world)
  return r.unreachable === 0 && r.seconds <= CONFIG.day.seconds
}
