import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CONFIG } from '../src/core/config.ts'
import { ECHO_DEFS, FAMILY_COLOR, FAMILY_LABEL } from '../src/core/echoes.ts'
import { SHAPES } from '../src/core/shapes.ts'
import type { Family } from '../src/core/types.ts'

const FAMILIES: Family[] = ['warm', 'cool', 'nature']

test('genau acht Echos mit eindeutigen Ids und Namen', () => {
  assert.equal(ECHO_DEFS.length, 8)
  assert.equal(new Set(ECHO_DEFS.map((e) => e.id)).size, ECHO_DEFS.length, 'Ids muessen eindeutig sein')
  assert.equal(new Set(ECHO_DEFS.map((e) => e.name)).size, ECHO_DEFS.length, 'Namen muessen eindeutig sein')
  for (const e of ECHO_DEFS) {
    assert.ok(Number.isInteger(e.id) && e.id >= 0, `Id ungueltig: ${e.id}`)
  }
})

test('jede Familie hat genug Mitglieder fuer einen Combo', () => {
  for (const family of FAMILIES) {
    const members = ECHO_DEFS.filter((e) => e.family === family)
    assert.ok(
      members.length >= CONFIG.scoring.comboMinSize,
      `Familie ${family} hat nur ${members.length} Echos, Combo braucht >= ${CONFIG.scoring.comboMinSize}`,
    )
  }
})

test('Familienverteilung ist 3 warm / 3 cool / 2 nature', () => {
  assert.equal(ECHO_DEFS.filter((e) => e.family === 'warm').length, 3)
  assert.equal(ECHO_DEFS.filter((e) => e.family === 'cool').length, 3)
  assert.equal(ECHO_DEFS.filter((e) => e.family === 'nature').length, 2)
})

test('jede Form ist definiert, Werte sind positiv, Farben sind gueltige Hex-Werte', () => {
  for (const e of ECHO_DEFS) {
    assert.ok(e.shape in SHAPES, `${e.name}: unbekannte Form ${e.shape}`)
    assert.ok(e.baseValue > 0, `${e.name}: baseValue muss > 0 sein`)
    assert.ok(e.fragility > 0, `${e.name}: fragility muss > 0 sein`)
    assert.match(e.color, /^#[0-9a-f]{6}$/i, `${e.name}: Farbe ${e.color} ist kein gutes Hex`)
  }
})

test('FAMILY_LABEL und FAMILY_COLOR decken alle Familien ab', () => {
  for (const family of FAMILIES) {
    assert.ok(FAMILY_LABEL[family], `Label fuer ${family} fehlt`)
    assert.match(FAMILY_COLOR[family] ?? '', /^#[0-9a-f]{6}$/i, `Farbe fuer ${family} fehlt/ungueltig`)
  }
})
