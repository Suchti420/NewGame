import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CONFIG } from '../src/core/config.ts'
import { rotateCells, shapeCellCount, SHAPES, totalCellsOf } from '../src/core/shapes.ts'
import type { Cell, ShapeId } from '../src/core/types.ts'

const ALL_SHAPES = Object.keys(SHAPES) as ShapeId[]

function asKey(cells: readonly Cell[]): string {
  return [...cells].map(([x, y]) => `${x},${y}`).sort().join(' ')
}

test('Rotation erhaelt die Zellzahl und bleibt normalisiert (>= 0)', () => {
  for (const id of ALL_SHAPES) {
    const base = SHAPES[id].cells
    for (let rot = 0; rot < 4; rot++) {
      const cells = rotateCells(base, rot)
      assert.equal(cells.length, base.length, `${id} rot ${rot}: Zellzahl veraendert`)

      let minX = Infinity
      let minY = Infinity
      for (const [x, y] of cells) {
        assert.ok(Number.isInteger(x) && Number.isInteger(y), `${id} rot ${rot}: keine Ganzzahlen`)
        assert.ok(x >= 0 && y >= 0, `${id} rot ${rot}: negative Zelle (${x},${y})`)
        if (x < minX) minX = x
        if (y < minY) minY = y
      }
      assert.equal(minX, 0, `${id} rot ${rot}: nicht auf x=0 normalisiert`)
      assert.equal(minY, 0, `${id} rot ${rot}: nicht auf y=0 normalisiert`)

      // Zellen einer Form duerfen sich nie selbst ueberlappen.
      assert.equal(new Set(cells.map(([x, y]) => `${x},${y}`)).size, cells.length, `${id} rot ${rot}: doppelte Zelle`)
    }
  }
})

test('rot und rot+4 sind identisch, negative Rotationen normalisieren modulo 4', () => {
  for (const id of ALL_SHAPES) {
    const base = SHAPES[id].cells
    for (let rot = 0; rot < 4; rot++) {
      assert.deepEqual(rotateCells(base, rot), rotateCells(base, rot + 4), `${id} rot ${rot} vs ${rot + 4}`)
    }
    assert.deepEqual(rotateCells(base, -1), rotateCells(base, 3), `${id}: rot -1 == rot 3`)
    assert.deepEqual(rotateCells(base, -4), rotateCells(base, 0), `${id}: rot -4 == rot 0`)
  }
})

test('Rotation mutiert die Eingabe nicht und ist deterministisch', () => {
  for (const id of ALL_SHAPES) {
    const base = SHAPES[id].cells
    const before = asKey(base)
    const a = rotateCells(base, 1)
    const b = rotateCells(base, 1)
    assert.deepEqual(a, b, `${id}: nicht deterministisch`)
    assert.equal(asKey(base), before, `${id}: Eingabe wurde mutiert`)
  }
})

test('Bekannte Rotationsfaelle: I und O', () => {
  assert.deepEqual(asKey(rotateCells(SHAPES.I.cells, 1)), asKey([[0, 0], [0, 1], [0, 2]]))
  assert.deepEqual(asKey(rotateCells(SHAPES.I.cells, 0)), asKey([[0, 0], [1, 0], [2, 0]]))
  // Ein Quadrat ist rotationsinvariant (als Zellmenge).
  assert.equal(asKey(rotateCells(SHAPES.O.cells, 1)), asKey(SHAPES.O.cells))
  assert.equal(asKey(rotateCells(SHAPES.O.cells, 3)), asKey(SHAPES.O.cells))
})

test('shapeCellCount stimmt mit den Zellen ueberein', () => {
  for (const id of ALL_SHAPES) {
    assert.equal(shapeCellCount(id), SHAPES[id].cells.length, id)
  }
  assert.equal(shapeCellCount('dot'), 1)
  assert.equal(shapeCellCount('P'), 5)
})

test('DESIGN-INVARIANTE: die fuenf groessten Formen passen NICHT ins 4x4-Raster', () => {
  const counts = ALL_SHAPES.map((id) => shapeCellCount(id)).sort((a, b) => b - a)
  const topFiveSum = counts.slice(0, 5).reduce((a, b) => a + b, 0)
  const area = CONFIG.backpack.cols * CONFIG.backpack.rows
  assert.ok(topFiveSum > area, `Packentscheidung existiert nur, wenn ${topFiveSum} > ${area}`)
  // totalCellsOf ist die Summe der Einzelzaehlungen.
  assert.equal(totalCellsOf(ALL_SHAPES), counts.reduce((a, b) => a + b, 0))
})
