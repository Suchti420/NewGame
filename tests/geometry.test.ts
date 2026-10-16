import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  circleRectOverlap,
  closestPointOnRect,
  distance,
  distanceToRect,
  normalizeVector,
  pushOutOfRect,
  segmentClear,
} from '../src/core/geometry.ts'
import type { AABB } from '../src/core/types.ts'

const WALL: AABB = { x: 100, y: 100, w: 60, h: 40 }

test('normalizeVector: Diagonale wird Einheitsvektor (Regression 1,41x)', () => {
  const d = normalizeVector({ x: 1, y: 1 })
  assert.ok(Math.abs(Math.hypot(d.x, d.y) - 1) < 1e-12, 'Laenge muss 1 sein')
  assert.ok(Math.abs(d.x - Math.SQRT1_2) < 1e-12)
  assert.ok(Math.abs(d.y - Math.SQRT1_2) < 1e-12)

  const z = normalizeVector({ x: 0, y: 0 })
  assert.deepEqual(z, { x: 0, y: 0 }, 'Nullvektor darf nicht NaN werden')
})

test('normalizeVector laesst Einheitsvektoren unveraendert', () => {
  assert.deepEqual(normalizeVector({ x: 1, y: 0 }), { x: 1, y: 0 })
  assert.deepEqual(normalizeVector({ x: 0, y: -1 }), { x: 0, y: -1 })
})

test('closestPointOnRect clamped korrekt', () => {
  assert.deepEqual(closestPointOnRect(130, 120, WALL), { x: 130, y: 120 }, 'innen bleibt innen')
  assert.deepEqual(closestPointOnRect(0, 0, WALL), { x: 100, y: 100 }, 'aussen -> Ecke')
  assert.deepEqual(closestPointOnRect(200, 120, WALL), { x: 160, y: 120 }, 'rechts -> Kante')
})

test('circleRectOverlap: Grenzfaelle', () => {
  assert.equal(circleRectOverlap(130, 120, 5, WALL), true, 'Kreis im Rechteck')
  assert.equal(circleRectOverlap(90, 120, 11, WALL), true, 'Kreis beruehrt Kante mit Radius')
  assert.equal(circleRectOverlap(90, 120, 9, WALL), false, 'Kreis 10px weg, Radius 9')
  assert.equal(circleRectOverlap(89, 120, 11, WALL), false, 'exakt 11px = beruehrt, gilt als NICHT ueberlappend (strikt <)')
  assert.equal(circleRectOverlap(89, 120, 11.5, WALL), true, '11.5px Radius ueberlappt bei 11px Abstand')
  assert.equal(circleRectOverlap(400, 400, 20, WALL), false, 'weit weg')
})

test('pushOutOfRect loest Ueberlappung auf (die alte Pruefung tat das nicht)', () => {
  // Von rechts gegen die Kante: Kreis bei x=165, r=12 -> auf x=172 (160+12) + Kontakt-Epsilon.
  const right = pushOutOfRect(165, 120, 12, WALL)
  assert.equal(right.pushed, true)
  assert.ok(right.x >= 172 && Math.abs(right.x - 172) < 1e-3, `erwartet ~172, war ${right.x}`)
  assert.equal(right.y, 120)

  // Von links: x=95, r=12 -> auf x=88 (100-12) - Kontakt-Epsilon.
  const left = pushOutOfRect(95, 120, 12, WALL)
  assert.ok(left.x <= 88 && Math.abs(left.x - 88) < 1e-3, `erwartet ~88, war ${left.x}`)

  // Ecknaehe: bezueglich der Ecke (100,100) herausschieben.
  const corner = pushOutOfRect(98, 98, 12, WALL)
  assert.equal(corner.pushed, true)
  assert.ok(Math.abs(Math.hypot(corner.x - 100, corner.y - 100) - 12) < 1e-3, 'muss auf Distanz r landen')
})

test('pushOutOfRect: nicht ueberlappend = No-Op', () => {
  const free = pushOutOfRect(400, 400, 12, WALL)
  assert.equal(free.pushed, false)
  assert.equal(free.x, 400)
  assert.equal(free.y, 400)
})

test('pushOutOfRect: Mittelpunkt exakt im Rechteck wird nach aussen geschoben', () => {
  const inside = pushOutOfRect(130, 120, 12, WALL)
  assert.equal(inside.pushed, true)
  assert.equal(circleRectOverlap(inside.x, inside.y, 12, WALL), false, 'darf danach nicht mehr ueberlappen')
})

test('pushOutOfRect iterativ: jedes Ergebnis ist ueberlappungsfrei', () => {
  for (let x = 80; x <= 180; x += 3) {
    for (let y = 80; y <= 160; y += 3) {
      const r = pushOutOfRect(x, y, 12, WALL)
      assert.equal(circleRectOverlap(r.x, r.y, 12, WALL), false, `Position (${x},${y}) nicht aufgeloest`)
    }
  }
})

test('segmentClear: Wand blockiert Sichtlinie', () => {
  const walls = [WALL]
  assert.equal(segmentClear(130, 120, 300, 120, walls, 2), false, 'durch die Wand = blockiert')
  assert.equal(segmentClear(130, 120, 300, 100, walls, 2), false)
  assert.equal(segmentClear(50, 50, 90, 90, walls, 2), true, 'aussen herum = frei')
  assert.equal(segmentClear(130, 120, 130, 120, walls, 2), true, 'Nullstrecke ist frei')
})

test('distance und distanceToRect', () => {
  assert.equal(distance(0, 0, 3, 4), 5)
  assert.equal(distanceToRect(130, 120, WALL), 0, 'innen = 0')
  assert.equal(distanceToRect(100, 80, WALL), 20, 'oberhalb = 20')
  assert.equal(distanceToRect(60, 120, WALL), 40, 'links = 40')
})
