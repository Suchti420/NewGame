import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dateKey, isValidSeed, MAX_SEED_LENGTH, parseSeedInput, pickSeed, seedForDate } from '../src/core/seeds.ts'
import { SEED_VERSION } from '../src/core/config.ts'

test('dateKey nutzt das lokale Datum (nicht UTC)', () => {
  assert.equal(dateKey(new Date(2026, 9, 16)), '2026-10-16')
  assert.equal(dateKey(new Date(2026, 0, 3)), '2026-01-03')
  // Lokale Mitternacht: bei toISOString() waere das je nach Zone der Vortag.
  assert.equal(dateKey(new Date(2026, 0, 1, 0, 30)), '2026-01-01')
})

test('seedForDate ist stabil und enthaelt Versionssalt + Datum', () => {
  const d = new Date(2026, 9, 16)
  const a = seedForDate(d)
  const b = seedForDate(new Date(2026, 9, 16, 23, 59))
  assert.equal(a, b, 'gleicher Kalendertag => gleicher Seed')
  assert.equal(a, `${SEED_VERSION}-2026-10-16`)
})

test('verschiedene Tage erzeugen verschiedene Seeds', () => {
  assert.notEqual(seedForDate(new Date(2026, 9, 16)), seedForDate(new Date(2026, 9, 17)))
})

test('isValidSeed akzeptiert nur den erlaubten Zeichenvorrat', () => {
  assert.equal(isValidSeed('abc-123'), true)
  assert.equal(isValidSeed(''), false)
  assert.equal(isValidSeed('ABC'), false, 'Grossbuchstaben sind nicht normalisiert')
  assert.equal(isValidSeed('a b'), false)
  assert.equal(isValidSeed('x'.repeat(MAX_SEED_LENGTH + 1)), false)
})

test('parseSeedInput normalisiert Nutzereingaben', () => {
  assert.equal(parseSeedInput('  Hello World!! '), 'hello-world')
  assert.equal(parseSeedInput('-abc-'), 'abc')
  assert.equal(parseSeedInput('Regen   &   Wind'), 'regen-wind')
  assert.equal(parseSeedInput('###'), null)
  assert.equal(parseSeedInput('   '), null)
  assert.equal(parseSeedInput('ÄÖÜ'), null, 'Umlaute ergeben nach der Filterung nichts Verwertbares')
  assert.equal(parseSeedInput('a'.repeat(100))?.length, MAX_SEED_LENGTH, 'wird gekuerzt')
})

test('pickSeed: gueltiger Override gewinnt, sonst Tages-Seed', () => {
  const d = new Date(2026, 9, 16)
  assert.equal(pickSeed(d), seedForDate(d))
  assert.equal(pickSeed(d, 'Mein Seed'), 'mein-seed')
  assert.equal(pickSeed(d, '!!!'), seedForDate(d), 'ungueltiger Override faellt auf Tages-Seed zurueck')
  assert.equal(pickSeed(d, null), seedForDate(d))
  assert.equal(pickSeed(d, undefined), seedForDate(d))
})
