import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateWorld, generateWorldWithSalt, validateWorld, PORTAL } from '../src/core/world.ts'
import { CONFIG } from '../src/core/config.ts'
import type { AABB, World } from '../src/core/types.ts'

test('generateWorld ist deterministisch', () => {
  const a = generateWorld('alpha')
  const b = generateWorld('alpha')
  assert.deepEqual(a, b, 'gleicher Seed => identische Welt inkl. Salt und Float-Positionen')
  assert.equal(a.seed, b.seed)

  const c = generateWorld('beta')
  assert.notDeepEqual(a.echoes.map((e) => [e.x, e.y]), c.echoes.map((e) => [e.x, e.y]))
})

test('jede erzeugte Welt hat genau 8 Echos und ein zentriertes Portal', () => {
  const w = generateWorld('struktur')
  assert.equal(w.echoes.length, CONFIG.world.echoCount)
  assert.equal(w.portal.x, PORTAL.x)
  assert.equal(w.portal.y, PORTAL.y)
  assert.ok(w.walls.length >= CONFIG.world.wallCount, 'mindestens wallCount Waende (inkl. Rand zu je 4)')
})

test('200 Seeds: Invariante gilt fuer ALLE (Regression 11,8% unspielbar)', () => {
  let failures = 0
  for (let i = 0; i < 200; i++) {
    const w = generateWorld(`regress-${i}`)
    const v = validateWorld(w)
    if (!v.ok) {
      failures++
      console.error(`Seed regress-${i} ungueltig:`, v)
    }
  }
  assert.equal(failures, 0)
})

test('generateWorldWithSalt erzwingt den Salt', () => {
  const w = generateWorldWithSalt('fix', 3)
  assert.equal(w.salt, 3)
  assert.ok(w.seed.endsWith('#3'))
  assert.equal(generateWorldWithSalt('fix', 0).seed.includes('#'), false)
})

test('validateWorld erkennt eine unerreichbare Echo-Kammer', () => {
  const base = generateWorld('kaefig')
  const target = base.echoes[0]
  assert.ok(target)

  const ex = target.x
  const ey = target.y
  const box: AABB[] = [
    { x: ex - 40, y: ey - 40, w: 80, h: 20 },
    { x: ex - 40, y: ey + 20, w: 80, h: 20 },
    { x: ex - 40, y: ey - 40, w: 20, h: 80 },
    { x: ex + 20, y: ey - 40, w: 20, h: 80 },
  ]
  const sealed: World = { ...base, walls: [...base.walls, ...box] }
  const v = validateWorld(sealed)
  assert.equal(v.ok, false)
  assert.ok(v.unreachable.includes(target.id), 'das eingemauerte Echo muss als unerreichbar gelten')
})

test('validateWorld erkennt einen blockierten Spawn', () => {
  const base = generateWorld('spawn')
  const s = base.spawn
  const seal: AABB[] = [
    { x: s.x - 60, y: s.y - 60, w: 120, h: 20 },
    { x: s.x - 60, y: s.y + 40, w: 120, h: 20 },
    { x: s.x - 60, y: s.y - 60, w: 20, h: 120 },
    { x: s.x + 40, y: s.y - 60, w: 20, h: 120 },
  ]
  const sealed: World = { ...base, walls: seal }
  assert.equal(validateWorld(sealed).ok, false)
})
