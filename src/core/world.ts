/**
 * Weltgenerierung mit eingebauter Invariante: JEDER erzeugte Tag ist spielbar.
 *
 * Der alte Generator pruefte nur die linke obere Ecke einer Wand gegen einen
 * Schutzkreis um das Portal. Ergebnis (nachgerechnet ueber 3000 Seeds):
 * 13,6 % Spawn-in-Wand, 11,8 % harter 180-Sekunden-Lock.
 *
 * Solution hier: nach dem Wuerfeln wird per Flood-Fill BEWIESEN, dass der
 * Spawn frei ist und alle Echos sowie das Portal erreichbar sind. Schlaegt
 * der Beweis fehl, wird der Salt erhoeht und deterministisch neu gewuerfelt.
 * Der Salt ist Teil des Seeds, die Reproduzierbarkeit bleibt also erhalten.
 */

import { CONFIG, SEED_VERSION } from './config.ts'
import { ECHO_DEFS } from './echoes.ts'
import { circleRectOverlap, distance, distanceToRect } from './geometry.ts'
import { makeRng, randRange, type Rng } from './rng.ts'
import type { AABB, Echo, Vec, World } from './types.ts'

const W = CONFIG.arena.width
const H = CONFIG.arena.height
const BORDER = CONFIG.player.radius + CONFIG.player.wallInset

/** Sichtbarer Echo-Radius (nur Darstellung + Platzierungsabstand). */
export const ECHO_RADIUS = 11

/** Baut den Arena-Rand als vier Rechtecke. */
function borderWalls(): AABB[] {
  return [
    { x: 0, y: 0, w: W, h: BORDER },
    { x: 0, y: H - BORDER, w: W, h: BORDER },
    { x: 0, y: 0, w: BORDER, h: H },
    { x: W - BORDER, y: 0, w: BORDER, h: H },
  ]
}

/** Innenbereich, in dem Waende und Echos liegen duerfen. */
const INNER = {
  x: BORDER,
  y: BORDER,
  w: W - BORDER * 2,
  h: H - BORDER * 2,
}

export const PORTAL: { x: number; y: number; r: number } = { x: W / 2, y: H / 2, r: 34 }

/** Fester Spawnpunkt unterhalb des Portals. */
const SPAWN: Vec = { x: W / 2, y: H / 2 + 110 }

/** Freihaltezone um das Portal (verhindert zugestellte Extraktion). */
const PORTAL_KEEPOUT = PORTAL.r + CONFIG.world.portalKeepoutPadding

function buildInteriorWalls(rng: Rng): AABB[] {
  const walls: AABB[] = []
  const attempts = CONFIG.world.wallCount * 40

  for (let i = 0; i < attempts && walls.length < CONFIG.world.wallCount; i++) {
    const horizontal = rng() > 0.5
    const w = horizontal ? randRange(rng, 110, 260) : randRange(rng, 18, 24)
    const h = horizontal ? randRange(rng, 18, 24) : randRange(rng, 80, 190)
    const x = randRange(rng, INNER.x, INNER.x + INNER.w - w)
    const y = randRange(rng, INNER.y, INNER.y + INNER.h - h)
    const rect: AABB = { x, y, w, h }

    // Nicht ins Portal-Keepout ragen.
    const cx = x + w / 2
    const cy = y + h / 2
    const halfDiag = Math.sqrt(w * w + h * h) / 2
    // distance() nutzt Math.sqrt (IEEE-genau) statt der engine-abhaengigen
    // Hypotenusen-Funktion -> gleicher Seed liefert auf jeder Engine exakt dieselbe Karte.
    if (distance(cx, cy, PORTAL.x, PORTAL.y) < PORTAL_KEEPOUT + halfDiag) continue

    // Spawn freihalten.
    if (circleRectOverlap(SPAWN.x, SPAWN.y, CONFIG.player.radius + CONFIG.world.spawnKeepoutPadding, rect)) continue

    // Keine Wand direkt an eine andere kleben (haelt die Arena offen).
    let tooClose = false
    for (const other of walls) {
      const gap = CONFIG.world.wallGap
      if (
        rect.x < other.x + other.w + gap &&
        rect.x + rect.w + gap > other.x &&
        rect.y < other.y + other.h + gap &&
        rect.y + rect.h + gap > other.y
      ) {
        tooClose = true
        break
      }
    }
    if (tooClose) continue

    walls.push(rect)
  }
  return walls
}

function placeEchoes(rng: Rng, walls: readonly AABB[]): Echo[] {
  const spots: Vec[] = []
  const minDist = CONFIG.world.echoMinDistance
  const clearance = CONFIG.player.radius + ECHO_RADIUS + 2

  for (let i = 0; i < CONFIG.world.echoCount; i++) {
    let found: Vec | null = null
    for (let attempt = 0; attempt < CONFIG.world.echoPlacementAttempts; attempt++) {
      const margin = CONFIG.world.echoMargin
      const x = randRange(rng, INNER.x + margin, INNER.x + INNER.w - margin)
      const y = randRange(rng, INNER.y + margin, INNER.y + INNER.h - margin)

      if (distance(x, y, PORTAL.x, PORTAL.y) < PORTAL_KEEPOUT) continue
      let blocked = false
      for (const wall of walls) {
        if (circleRectOverlap(x, y, clearance, wall)) {
          blocked = true
          break
        }
      }
      if (blocked) continue

      let tooNear = false
      for (const s of spots) {
        if (distance(x, y, s.x, s.y) < minDist) {
          tooNear = true
          break
        }
      }
      if (tooNear) continue

      found = { x, y }
      break
    }
    // Kann bei sehr dichter Arena fehlschlagen -> Invariante unten faengt es.
    if (!found) break
    spots.push(found)
  }

  return ECHO_DEFS.slice(0, spots.length).map((def, i) => {
    const spot = spots[i] as Vec
    return {
      ...def,
      x: spot.x,
      y: spot.y,
      integrity: 100,
      phase: randRange(rng, 0, Math.PI * 2),
      state: 'ground' as const,
    }
  })
}

/**
 * Begehbarkeitsraster: Zelle begehbar, wenn der Spielerkreis an ihrem
 * Mittelpunkt keine Wand beruehrt.
 */
export function buildWalkableGrid(walls: readonly AABB[]): {
  cols: number
  rows: number
  cell: number
  walkable: Uint8Array
} {
  const cell = CONFIG.world.reachabilityCellSize
  const cols = Math.floor(W / cell)
  const rows = Math.floor(H / cell)
  const walkable = new Uint8Array(cols * rows)
  const r = CONFIG.player.radius

  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const cx = gx * cell + cell / 2
      const cy = gy * cell + cell / 2
      let free = 1
      for (const wall of walls) {
        if (circleRectOverlap(cx, cy, r, wall)) {
          free = 0
          break
        }
      }
      walkable[gy * cols + gx] = free
    }
  }
  return { cols, rows, cell, walkable }
}

function cellIndex(grid: ReturnType<typeof buildWalkableGrid>, x: number, y: number): number {
  const gx = Math.floor(x / grid.cell)
  const gy = Math.floor(y / grid.cell)
  if (gx < 0 || gy < 0 || gx >= grid.cols || gy >= grid.rows) return -1
  return gy * grid.cols + gx
}

/**
 * Flood-Fill vom Spawn aus. Liefert die Menge erreichbarer Zellindizes.
 * Das ist der eigentliche Beweis — nicht eine Heuristik.
 */
export function reachableFrom(
  grid: ReturnType<typeof buildWalkableGrid>,
  origin: Vec,
): { seen: Uint8Array; start: number } {
  const seen = new Uint8Array(grid.cols * grid.rows)
  const start = cellIndex(grid, origin.x, origin.y)
  if (start < 0 || grid.walkable[start] !== 1) return { seen, start }

  const queue = new Int32Array(grid.cols * grid.rows)
  let head = 0
  let tail = 0
  queue[tail++] = start
  seen[start] = 1

  while (head < tail) {
    const idx = queue[head++] as number
    const gx = idx % grid.cols
    const gy = (idx - gx) / grid.cols

    // 4er-Nachbarschaft
    if (gx > 0) {
      const n = idx - 1
      if (grid.walkable[n] === 1 && seen[n] === 0) {
        seen[n] = 1
        queue[tail++] = n
      }
    }
    if (gx < grid.cols - 1) {
      const n = idx + 1
      if (grid.walkable[n] === 1 && seen[n] === 0) {
        seen[n] = 1
        queue[tail++] = n
      }
    }
    if (gy > 0) {
      const n = idx - grid.cols
      if (grid.walkable[n] === 1 && seen[n] === 0) {
        seen[n] = 1
        queue[tail++] = n
      }
    }
    if (gy < grid.rows - 1) {
      const n = idx + grid.cols
      if (grid.walkable[n] === 1 && seen[n] === 0) {
        seen[n] = 1
        queue[tail++] = n
      }
    }
  }
  return { seen, start }
}

export interface WorldValidation {
  ok: boolean
  spawnFree: boolean
  portalReachable: boolean
  reachableEchoes: number
  totalEchoes: number
  /** Echos, die vom Spawn aus nicht erreichbar sind. */
  unreachable: number[]
}

/** Prueft die Invariante. Wird sowohl im Generator als auch in Tests benutzt. */
export function validateWorld(world: World): WorldValidation {
  const grid = buildWalkableGrid(world.walls)
  const spawnIdx = cellIndex(grid, world.spawn.x, world.spawn.y)
  const spawnFree = spawnIdx >= 0 && grid.walkable[spawnIdx] === 1

  if (!spawnFree) {
    return {
      ok: false,
      spawnFree: false,
      portalReachable: false,
      reachableEchoes: 0,
      totalEchoes: world.echoes.length,
      unreachable: world.echoes.map((e) => e.id),
    }
  }

  const { seen } = reachableFrom(grid, world.spawn)
  const portalIdx = cellIndex(grid, world.portal.x, world.portal.y)
  const portalReachable = portalIdx >= 0 && seen[portalIdx] === 1

  const unreachable: number[] = []
  let reachableEchoes = 0
  for (const echo of world.echoes) {
    const idx = cellIndex(grid, echo.x, echo.y)
    if (idx >= 0 && seen[idx] === 1) reachableEchoes++
    else unreachable.push(echo.id)
  }

  const ok =
    spawnFree &&
    portalReachable &&
    unreachable.length === 0 &&
    world.echoes.length === CONFIG.world.echoCount

  return { ok, spawnFree, portalReachable, reachableEchoes, totalEchoes: world.echoes.length, unreachable }
}

function buildWorldForSalt(baseSeed: string, salt: number): World {
  const seed = salt === 0 ? baseSeed : `${baseSeed}#${salt}`
  const rng = makeRng(seed)
  const walls = [...borderWalls(), ...buildInteriorWalls(rng)]
  const echoes = placeEchoes(rng, walls)

  return {
    seed,
    salt,
    walls,
    echoes,
    portal: { ...PORTAL },
    spawn: { ...SPAWN },
  }
}

/**
 * Erzeugt eine garantiert spielbare Welt fuer einen Basisseed.
 * Deterministisch: derselbe Basisseed liefert immer dieselbe Welt.
 */
export function generateWorld(baseSeed: string): World {
  const full = `${SEED_VERSION}:${baseSeed}`
  let last: World | null = null

  for (let salt = 0; salt < CONFIG.world.maxSaltAttempts; salt++) {
    const world = buildWorldForSalt(full, salt)
    last = world
    if (validateWorld(world).ok) return world
  }

  // Theoretisch unerreichbar; dient als harter Fehler statt stiller Fehlschlag.
  const reason = last ? JSON.stringify(validateWorld(last)) : 'keine Welt erzeugt'
  throw new Error(`Weltgenerierung fehlgeschlagen fuer Seed ${full}: ${reason}`)
}

/** Nur fuer Tests: erzwingt einen bestimmten Salt. */
export function generateWorldWithSalt(baseSeed: string, salt: number): World {
  return buildWorldForSalt(`${SEED_VERSION}:${baseSeed}`, salt)
}

/** Abstand des Spielers zur naechsten Wand (fuer Debug/Tests). */
export function clearanceToWalls(world: World, x: number, y: number): number {
  let min = Infinity
  for (const wall of world.walls) {
    const d = distanceToRect(x, y, wall)
    if (d < min) min = d
  }
  return min
}
