/**
 * Formen des Rucksack-Puzzles. Zellen sind [dx, dy], normalisiert auf >= 0.
 * Die Groessen sind so gewaehlt, dass 5 Formen NICHT in ein 4x4 passen.
 */

import type { Cell, Shape, ShapeId } from './types.ts'

export const SHAPES: Record<ShapeId, Shape> = {
  O: { id: 'O', cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  I: { id: 'I', cells: [[0, 0], [1, 0], [2, 0]] },
  L: { id: 'L', cells: [[0, 0], [0, 1], [0, 2], [1, 2]] },
  T: { id: 'T', cells: [[0, 0], [1, 0], [2, 0], [1, 1]] },
  S: { id: 'S', cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  dot: { id: 'dot', cells: [[0, 0]] },
  P: { id: 'P', cells: [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]] },
}

/**
 * Rotiert Zellen um 90 Grad im Uhrzeigersinn und normalisiert sie
 * anschliessend zurueck in den nicht-negativen Bereich.
 * rot wird modulo 4 genommen.
 */
export function rotateCells(cells: readonly Cell[], rot: number): Cell[] {
  const turns = ((rot % 4) + 4) % 4
  let current: Cell[] = cells.map(([x, y]) => [x, y] as Cell)

  for (let t = 0; t < turns; t++) {
    current = current.map(([x, y]) => [-y, x] as Cell)
    let minX = Infinity
    let minY = Infinity
    for (const [x, y] of current) {
      if (x < minX) minX = x
      if (y < minY) minY = y
    }
    current = current.map(([x, y]) => [x - minX, y - minY] as Cell)
  }
  return current
}

/** Belegte Zellzahl — fuer Kapazitaetsrechnungen und Tests. */
export function shapeCellCount(shape: ShapeId): number {
  return SHAPES[shape].cells.length
}

/** Gesamtzellzahl aller Echos, wenn alle gleichzeitig getragen werden. */
export function totalCellsOf(shapes: readonly ShapeId[]): number {
  let sum = 0
  for (const s of shapes) sum += shapeCellCount(s)
  return sum
}
