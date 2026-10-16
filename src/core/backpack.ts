/**
 * Rucksack: Platzierung, Rotation, Entnahme und Score.
 *
 * Repariert den zentralen Designfehler der alten Version:
 * Dort verglich comboScore die OBJEKTIDENTITAET (`at(x+1,y) === v`), wodurch
 * der Bonus ueber alle Positionen und Rotationen konstant war (nachgerechnet:
 * O=40, I=20, L/T/S=30, dot=0, P=50). Der Spieler konnte den Wert nicht
 * beeinflussen — die beworbene Kernmechanik existierte schlicht nicht.
 *
 * Jetzt: zusammenhaengende Regionen gleicher FARBFAMILIE (Flood-Fill ueber
 * die 4er-Nachbarschaft) erzeugen einen echten Multiplikator. Platzierung
 * und Nachbarschaft entscheiden jetzt tatsaechlich ueber den Ertrag.
 */

import { CONFIG } from './config.ts'
import { rotateCells, SHAPES } from './shapes.ts'
import type { BackpackGrid, BackpackScore, Cell, Echo, Family, ShapeId } from './types.ts'

export interface Placement {
  echoId: number
  anchorX: number
  anchorY: number
  rot: number
}

export interface BackpackState {
  cols: number
  rows: number
  /** null = leere Zelle, sonst Referenz auf das platzierte Echo. */
  grid: BackpackGrid
  /** Metadaten fuer Entnahme/Undo. */
  placements: Placement[]
}

export function createBackpack(): BackpackState {
  const cols = CONFIG.backpack.cols
  const rows = CONFIG.backpack.rows
  return {
    cols,
    rows,
    grid: new Array<Echo | null>(cols * rows).fill(null),
    placements: [],
  }
}

export function resetBackpack(bp: BackpackState): void {
  bp.grid.fill(null)
  bp.placements.length = 0
}

/** Zellen einer Form in Rotation, verankert an (gx, gy). */
export function cellsAt(shape: ShapeId, rot: number, gx: number, gy: number): Cell[] {
  return rotateCells(SHAPES[shape].cells, rot).map(([cx, cy]) => [gx + cx, gy + cy] as Cell)
}

/** Passt die Form ueberhaupt ins Raster (irgendwohin)? */
export function shapeFits(bp: BackpackState, shape: ShapeId, rot: number): boolean {
  for (let gy = 0; gy < bp.rows; gy++) {
    for (let gx = 0; gx < bp.cols; gx++) {
      if (canPlaceAt(bp, shape, rot, gx, gy)) return true
    }
  }
  return false
}

export function canPlaceAt(bp: BackpackState, shape: ShapeId, rot: number, gx: number, gy: number): boolean {
  for (const [x, y] of cellsAt(shape, rot, gx, gy)) {
    if (x < 0 || y < 0 || x >= bp.cols || y >= bp.rows) return false
    if (bp.grid[y * bp.cols + x] !== null) return false
  }
  return true
}

/** Setzt ein Echo ins Raster. Liefert false, wenn es nicht passt. */
export function placeEcho(bp: BackpackState, echo: Echo, rot: number, gx: number, gy: number): boolean {
  if (!canPlaceAt(bp, echo.shape, rot, gx, gy)) return false
  for (const [x, y] of cellsAt(echo.shape, rot, gx, gy)) {
    bp.grid[y * bp.cols + x] = echo
  }
  bp.placements.push({ echoId: echo.id, anchorX: gx, anchorY: gy, rot })
  return true
}

/** Nimmt ein Echo wieder heraus. Liefert das Echo oder null. */
export function removeEcho(bp: BackpackState, echoId: number): Echo | null {
  const idx = bp.placements.findIndex((p) => p.echoId === echoId)
  if (idx < 0) return null

  let removed: Echo | null = null
  for (let gy = 0; gy < bp.rows; gy++) {
    for (let gx = 0; gx < bp.cols; gx++) {
      const cell = bp.grid[gy * bp.cols + gx]
      if (cell && cell.id === echoId) {
        removed = cell
        bp.grid[gy * bp.cols + gx] = null
      }
    }
  }
  bp.placements.splice(idx, 1)
  return removed
}

/** Alle im Raster vorhandenen Echos, jedes genau einmal. */
export function packedEchoes(bp: BackpackState): Echo[] {
  const out: Echo[] = []
  const seen = new Set<number>()
  for (const cell of bp.grid) {
    if (cell && !seen.has(cell.id)) {
      seen.add(cell.id)
      out.push(cell)
    }
  }
  return out
}

function baseValueOf(echo: Echo): number {
  return Math.round((echo.baseValue * echo.integrity) / 100)
}

/**
 * Kern des Spiels: Score aus Basiswert + Familien-Clustern.
 *
 * Fuer jede zusammenhaengende Region (4er-Nachbarschaft) gleicher Familie
 * mit mindestens comboMinSize VERSCHIEDENEN Echos gilt:
 *   combo += (Summe der Basiswerte der Region) * comboPerMember * (Groesse - 1)
 *
 * Dadurch ist Nachbarschaft echten Einflussfaktor: dasselbe Echo an
 * anderer Stelle liefert einen anderen Score.
 */
export function scoreBackpack(bp: BackpackState): BackpackScore {
  const { cols, rows, grid } = bp
  const visited = new Uint8Array(cols * rows)
  let base = 0
  let combo = 0
  let largestCluster = 0

  // Basis einmal ueber alle eindeutigen Echos.
  for (const echo of packedEchoes(bp)) base += baseValueOf(echo)

  for (let start = 0; start < grid.length; start++) {
    if (visited[start] === 1) continue
    const seed = grid[start]
    if (!seed) {
      visited[start] = 1
      continue
    }

    const family: Family = seed.family
    const stack = [start]
    visited[start] = 1
    const members = new Map<number, Echo>()

    while (stack.length > 0) {
      const idx = stack.pop() as number
      const echo = grid[idx] as Echo
      if (!members.has(echo.id)) members.set(echo.id, echo)

      const gx = idx % cols
      const gy = (idx - gx) / cols

      const neighbors = [
        gx > 0 ? idx - 1 : -1,
        gx < cols - 1 ? idx + 1 : -1,
        gy > 0 ? idx - cols : -1,
        gy < rows - 1 ? idx + cols : -1,
      ]

      for (const n of neighbors) {
        if (n < 0 || visited[n] === 1) continue
        const other = grid[n]
        if (other && other.family === family) {
          visited[n] = 1
          stack.push(n)
        }
      }
    }

    const size = members.size
    if (size > largestCluster) largestCluster = size

    if (size >= CONFIG.scoring.comboMinSize) {
      let regionValue = 0
      for (const echo of members.values()) regionValue += baseValueOf(echo)
      combo += regionValue * CONFIG.scoring.comboPerMember * (size - 1)
    }
  }

  const comboRounded = Math.round(combo)
  return { base, combo: comboRounded, total: base + comboRounded, largestCluster }
}

/**
 * Vorschau fuer die UI: welcher Score entstuende, wenn ein Echo an
 * (gx, gy) gelegt wuerde. Rechnet auf einer Kopie — mutiert nichts.
 */
export function previewPlacement(
  bp: BackpackState,
  echo: Echo,
  rot: number,
  gx: number,
  gy: number,
): BackpackScore | null {
  if (!canPlaceAt(bp, echo.shape, rot, gx, gy)) return null

  const snapshot = bp.grid.slice()
  const placements = bp.placements.slice()
  placeEcho(bp, echo, rot, gx, gy)
  const result = scoreBackpack(bp)

  bp.grid = snapshot
  bp.placements.length = 0
  for (const p of placements) bp.placements.push(p)

  return result
}
