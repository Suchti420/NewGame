import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeRng, mulberry32, randInt, randRange, shuffle, xmur3 } from '../src/core/rng.ts'

test('xmur3 ist deterministisch und liefert 32-Bit-Ganzzahlen', () => {
  const a = xmur3('zeittraeger')
  const b = xmur3('zeittraeger')
  const first = a()
  assert.equal(first, 651695444)
  assert.equal(b(), first, 'gleicher String => gleicher erster Wert')
  for (let i = 0; i < 50; i++) {
    const v = a()
    assert.equal(v, b(), 'gleicher String muss dieselbe Folge liefern')
    assert.ok(Number.isInteger(v) && v >= 0 && v <= 0xffffffff, 'muss uint32 sein')
  }
})

test('mulberry32 liefert exakt bekannte Folge (Regression bei Umbau)', () => {
  const r = mulberry32(12345)
  const expected = [0.9797282677609473, 0.3067522644996643, 0.484205421525985, 0.817934412509203, 0.5094283693470061]
  for (const e of expected) assert.equal(r(), e)
})

test('makeRng ist reproduzierbar und Werte liegen in [0,1)', () => {
  const a = makeRng('zt-v2-2026-10-16')
  const b = makeRng('zt-v2-2026-10-16')
  const daily = [0.376124928239733, 0.40598490415140986, 0.32806282048113644, 0.7933115267660469, 0.279241087147966]
  for (let i = 0; i < 1000; i++) {
    const va = a()
    const vb = b()
    assert.equal(va, vb)
    assert.ok(va >= 0 && va < 1)
    if (i < daily.length) assert.equal(va, daily[i])
  }
})

test('verschiedene Seeds divergieren', () => {
  const a = makeRng('seed-a')
  const b = makeRng('seed-b')
  let equal = 0
  for (let i = 0; i < 100; i++) if (a() === b()) equal++
  assert.ok(equal < 5, `zu viele identische Werte: ${equal}`)
})

test('randInt respektiert Grenzen inkl. n=1 und Nicht-Zweierpotenzen', () => {
  const rng = makeRng('randint')
  assert.equal(randInt(rng, 1), 0)
  const seen = new Set<number>()
  for (let i = 0; i < 10000; i++) {
    const v = randInt(rng, 7)
    assert.ok(Number.isInteger(v) && v >= 0 && v < 7, `ausserhalb: ${v}`)
    seen.add(v)
  }
  assert.equal(seen.size, 7, 'alle Reste muessen vorkommen')
})

test('randRange bleibt in [min,max)', () => {
  const rng = makeRng('randrange')
  for (let i = 0; i < 5000; i++) {
    const v = randRange(rng, -3, 12)
    assert.ok(v >= -3 && v < 12, `ausserhalb: ${v}`)
  }
})

test('shuffle ist eine Permutation und deterministisch', () => {
  const original = [1, 2, 3, 4, 5, 6, 7, 8]
  const a = shuffle(makeRng('mix'), original)
  const b = shuffle(makeRng('mix'), original)
  assert.deepEqual(a, b, 'gleicher Seed => gleiche Reihenfolge')
  assert.deepEqual(original, [1, 2, 3, 4, 5, 6, 7, 8], 'Original darf nicht mutiert werden')
  assert.deepEqual([...a].sort((x, y) => x - y), original, 'muss Permutation sein')
})
