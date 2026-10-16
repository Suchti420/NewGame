import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createBackpack, scoreBackpack } from '../src/core/backpack.ts'
import { CONFIG } from '../src/core/config.ts'
import { dotEcho, makeEcho } from './helpers/factory.ts'

test('leerer Rucksack ergibt Score 0', () => {
  const bp = createBackpack()
  assert.deepEqual(scoreBackpack(bp), { base: 0, combo: 0, total: 0, largestCluster: 0 })
})

test('Basiswert skaliert mit Integritaet', () => {
  const bp = createBackpack()
  const e = dotEcho(0, 'warm', 100)
  e.integrity = 50
  bp.grid[0] = e
  const s = scoreBackpack(bp)
  assert.equal(s.base, 50)
})

test('KERN-REGRESSION: gleiche Familie benachbart gibt echten Combo-Bonus', () => {
  // Die alte Version verglich Objektidentitaet -> Bonus war konstant.
  const adjacent = createBackpack()
  const a1 = dotEcho(0, 'warm', 100)
  const a2 = dotEcho(1, 'warm', 100)
  adjacent.grid[0] = a1 // (0,0)
  adjacent.grid[1] = a2 // (1,0)
  const sAdj = scoreBackpack(adjacent)

  const apart = createBackpack()
  const b1 = dotEcho(0, 'warm', 100)
  const b2 = dotEcho(1, 'warm', 100)
  apart.grid[0] = b1 // (0,0)
  apart.grid[3 * 4 + 3] = b2 // (3,3) — Ecke gegenueber
  const sApart = scoreBackpack(apart)

  assert.equal(sApart.combo, 0, 'getrennt => kein Combo')
  assert.ok(sAdj.combo > 0, 'benachbart => Combo > 0')
  assert.ok(sAdj.total > sApart.total, 'Platzierung muss den Score veraendern')
})

test('Multiplikator-Formel: 1 + comboPerMember*(size-1)', () => {
  const bp = createBackpack()
  bp.grid[0] = dotEcho(0, 'warm', 100)
  bp.grid[1] = dotEcho(1, 'warm', 100)
  const s = scoreBackpack(bp)
  const expected = Math.round((100 + 100) * CONFIG.scoring.comboPerMember * (2 - 1))
  assert.equal(s.combo, expected)
  assert.equal(s.total, 200 + expected)
  assert.equal(s.largestCluster, 2)
})

test('andere Familie benachbart gibt KEINEN Combo', () => {
  const bp = createBackpack()
  bp.grid[0] = dotEcho(0, 'warm', 100)
  bp.grid[1] = dotEcho(3, 'cool', 100)
  const s = scoreBackpack(bp)
  assert.equal(s.combo, 0)
  assert.equal(s.largestCluster, 1)
})

test('3er-Kette hat groesseren Cluster und Multiplikator als 2er-Paar', () => {
  const pair = createBackpack()
  pair.grid[0] = dotEcho(0, 'cool', 100)
  pair.grid[1] = dotEcho(3, 'cool', 100)
  const sPair = scoreBackpack(pair)

  const tri = createBackpack()
  tri.grid[0] = dotEcho(0, 'cool', 100)
  tri.grid[1] = dotEcho(3, 'cool', 100)
  tri.grid[2] = dotEcho(4, 'cool', 100)
  const sTri = scoreBackpack(tri)

  assert.equal(sTri.largestCluster, 3)
  assert.ok(sTri.combo > sPair.combo, 'mehr Mitglieder => mehr Combo')
})

test('nur die groesste Region zaehlt fuer largestCluster', () => {
  const bp = createBackpack()
  // 2er warm bei (0,0),(1,0)
  bp.grid[0] = dotEcho(0, 'warm', 100)
  bp.grid[1] = dotEcho(1, 'warm', 100)
  // 3er cool bei (0,2),(1,2),(2,2) — drei EINDEUTIGE Echo-Ids (Flood-Fill keyed by id)
  bp.grid[2 * 4 + 0] = dotEcho(3, 'cool', 100)
  bp.grid[2 * 4 + 1] = dotEcho(4, 'cool', 100)
  bp.grid[2 * 4 + 2] = dotEcho(5, 'cool', 100)
  const s = scoreBackpack(bp)
  assert.equal(s.largestCluster, 3)
  assert.ok(s.combo > 0)
})

test('mehrfach belegte Zellen zaehlen als EIN Echo im Cluster', () => {
  // Eine O-Form belegt 4 zusammenhaengende Zellen desselben Echos.
  const bp = createBackpack()
  bp.grid[0] = makeEcho(0, { shape: 'O', family: 'warm' })
  bp.grid[1] = makeEcho(0, { shape: 'O', family: 'warm' })
  bp.grid[4] = makeEcho(0, { shape: 'O', family: 'warm' })
  bp.grid[5] = makeEcho(0, { shape: 'O', family: 'warm' })
  const s = scoreBackpack(bp)
  assert.equal(s.largestCluster, 1, 'eine O-Form ist EIN Echo, kein 4er-Cluster')
  assert.equal(s.combo, 0, 'ein einzelnes Echo kann keinen Familien-Combo bilden')
})
