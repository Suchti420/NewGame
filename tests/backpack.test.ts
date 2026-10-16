import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canPlaceAt,
  cellsAt,
  createBackpack,
  packedEchoes,
  placeEcho,
  previewPlacement,
  removeEcho,
  resetBackpack,
  scoreBackpack,
  shapeFits,
} from '../src/core/backpack.ts'
import { CONFIG } from '../src/core/config.ts'
import { SHAPES, rotateCells, shapeCellCount, totalCellsOf } from '../src/core/shapes.ts'
import { ECHO_DEFS } from '../src/core/echoes.ts'
import type { Cell } from '../src/core/types.ts'
import { makeEcho } from './helpers/factory.ts'

function norm(cells: readonly Cell[]): Array<[number, number]> {
  const minX = Math.min(...cells.map((c) => c[0]))
  const minY = Math.min(...cells.map((c) => c[1]))
  return cells.map((c) => [c[0] - minX, c[1] - minY])
}

test('createBackpack liefert ein leeres 4x4-Raster', () => {
  const bp = createBackpack()
  assert.equal(bp.cols, CONFIG.backpack.cols)
  assert.equal(bp.rows, CONFIG.backpack.rows)
  assert.equal(bp.grid.length, CONFIG.backpack.cols * CONFIG.backpack.rows)
  assert.ok(bp.grid.every((c) => c === null))
})

test('rotateCells: Periode 4, normalisiert, zellzahl-treu', () => {
  for (const id of Object.keys(SHAPES) as Array<keyof typeof SHAPES>) {
    const base = SHAPES[id].cells
    const count = base.length
    for (let rot = 0; rot < 8; rot++) {
      const cells = rotateCells(base, rot)
      assert.equal(cells.length, count, `${String(id)} rot=${rot}: Zellzahl`)
      assert.deepEqual(norm(cells), norm(rotateCells(base, rot % 4)), `${String(id)} rot=${rot}: Periode 4`)
      for (const [x, y] of cells) assert.ok(x >= 0 && y >= 0, `${String(id)} rot=${rot}: negativ`)
    }
    assert.deepEqual(rotateCells(base, 0), base, `${String(id)}: rot=0 unveraendert`)
    assert.deepEqual(rotateCells(base, 4), base, `${String(id)}: rot=4 == rot=0`)
    assert.deepEqual(rotateCells(base, -1), rotateCells(base, 3), `${String(id)}: negatives rot`)
  }
})

test('5 Formen passen nie gleichzeitig ins 4x4 (Pack-Entscheidung existiert)', () => {
  const all = ECHO_DEFS.map((e) => e.shape)
  assert.ok(totalCellsOf(all) > CONFIG.backpack.cols * CONFIG.backpack.rows, 'sonst gibt es keine Entscheidung')
})

test('canPlaceAt respektiert Grenzen und Belegung', () => {
  const bp = createBackpack()
  assert.equal(canPlaceAt(bp, 'I', 0, 0, 0), true, 'I bei 0 belegt 0..2')
  assert.equal(canPlaceAt(bp, 'I', 0, 1, 0), true, 'I bei 1 belegt 1..3')
  assert.equal(canPlaceAt(bp, 'I', 0, 2, 0), false, 'I bei 2 ragt raus')
  assert.equal(canPlaceAt(bp, 'O', 0, 3, 3), false, 'O ragt raus')
  assert.equal(canPlaceAt(bp, 'P', 0, 0, 2), false, 'P ist 3 hoch, ragt raus')

  const echo = makeEcho(0, { shape: 'dot' })
  assert.equal(placeEcho(bp, echo, 0, 0, 0), true)
  assert.equal(canPlaceAt(bp, 'I', 0, 0, 0), false, 'belegte Zelle')
})

test('cellsAt liefert erwartete Zellen', () => {
  assert.deepEqual(cellsAt('dot', 0, 2, 3), [[2, 3]])
  assert.deepEqual(cellsAt('I', 0, 0, 0), [[0, 0], [1, 0], [2, 0]])
})

test('placeEcho/removeEcho sind reversibel und liefern das Echo zurueck', () => {
  const bp = createBackpack()
  const echo = makeEcho(0, { shape: 'O' })
  assert.equal(placeEcho(bp, echo, 0, 1, 1), true)
  assert.equal(bp.placements.length, 1)
  assert.equal(bp.grid[1 * 4 + 1], echo)
  assert.equal(bp.grid[1 * 4 + 2], echo)
  assert.equal(bp.grid[2 * 4 + 1], echo)
  assert.equal(bp.grid[2 * 4 + 2], echo)

  const removed = removeEcho(bp, echo.id)
  assert.equal(removed, echo)
  assert.equal(bp.placements.length, 0)
  assert.ok(bp.grid.every((c) => c === null), 'alle Zellen wieder frei')
  assert.equal(removeEcho(bp, 999), null, 'unbekanntes Echo -> null')
})

test('packedEchoes liefert jedes Echo genau einmal', () => {
  const bp = createBackpack()
  const a = makeEcho(0, { shape: 'O' })
  const b = makeEcho(1, { shape: 'dot' })
  placeEcho(bp, a, 0, 0, 0)
  placeEcho(bp, b, 0, 3, 0)
  const packed = packedEchoes(bp)
  assert.equal(packed.length, 2)
  assert.ok(packed.includes(a) && packed.includes(b))
})

test('shapeFits prueft irgendeine Position', () => {
  const bp = createBackpack()
  assert.equal(shapeFits(bp, 'P', 0), true)
  // Rucksack fast fuellen (4 I-Formen zu je 3 Zellen = 12 Zellen, Reihen 0-2 voll)
  for (let gy = 0; gy < 3; gy++) {
    for (let gx = 0; gx < 4; gx++) bp.grid[gy * 4 + gx] = makeEcho(gx % 8, { shape: 'dot' })
  }
  assert.equal(shapeFits(bp, 'P', 0), false, 'nur noch 4 freie Zellen, P braucht 5')
  assert.equal(shapeFits(bp, 'dot', 0), true)
})

test('previewPlacement stimmt mit echtem Ergebnis ueberein und mutiert nichts', () => {
  const bp = createBackpack()
  bp.grid[0] = makeEcho(3, { shape: 'dot', family: 'cool', baseValue: 100 })
  const echo = makeEcho(4, { shape: 'dot', family: 'cool', baseValue: 100 })

  const before = bp.grid.slice()
  const beforePlacements = bp.placements.length
  const preview = previewPlacement(bp, echo, 0, 1, 0)
  assert.ok(preview)
  assert.deepEqual(bp.grid, before, 'Raster darf nicht mutiert werden')
  assert.equal(bp.placements.length, beforePlacements, 'Placements duerfen nicht mutiert werden')
  assert.equal(preview.largestCluster, 2)

  assert.equal(placeEcho(bp, echo, 0, 1, 0), true)
  const real = scoreBackpack(bp)
  assert.deepEqual(preview, real)
})

test('previewPlacement liefert null bei ungueltiger Position', () => {
  const bp = createBackpack()
  assert.equal(previewPlacement(bp, makeEcho(0, { shape: 'O' }), 0, 3, 3), null)
})

test('resetBackpack leert Raster und Placements', () => {
  const bp = createBackpack()
  placeEcho(bp, makeEcho(0, { shape: 'O' }), 0, 0, 0)
  resetBackpack(bp)
  assert.ok(bp.grid.every((c) => c === null))
  assert.equal(bp.placements.length, 0)
})

test('shapeCellCount stimmt mit SHAPES ueberein', () => {
  for (const id of Object.keys(SHAPES) as Array<keyof typeof SHAPES>) {
    assert.equal(shapeCellCount(id), SHAPES[id].cells.length)
  }
})
