import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CONFIG } from '../src/core/config.ts'
import { validateConfig } from '../src/core/validate.ts'

function broken(mutate: (cfg: Record<string, unknown>) => void): string[] {
  const clone = structuredClone(CONFIG) as Record<string, unknown>
  mutate(clone)
  return validateConfig(clone as unknown as typeof CONFIG).map((v) => v.key)
}

test('die ausgelieferte Konfiguration ist fehlerfrei', () => {
  assert.deepEqual(validateConfig(), [], 'config.ts verletzt eine Design-Invariante')
})

test('validateConfig erkennt eine Schadensschwelle unterhalb der Gehgeschwindigkeit', () => {
  // Genau der Bug der alten Version: Gehen verursachte bereits Schaden.
  const keys = broken((cfg) => {
    ;(cfg.player as Record<string, unknown>).walkSpeed = 200
  })
  assert.ok(keys.includes('damage.thresholdSpeed'), `erwartet Schwellenverletzung, war ${keys.join(',')}`)
})

test('validateConfig erkennt einen wachsenden statt schrumpfenden Nebel', () => {
  const keys = broken((cfg) => {
    ;(cfg.fog as Record<string, unknown>).endRadius = 999
  })
  assert.ok(keys.includes('fog.endRadius'))
})

test('validateConfig erkennt ein Raster, in das jede Form passen wuerde', () => {
  // Ohne diesen Check waere die Packentscheidung tot (alter 6x5-Fehler).
  const keys = broken((cfg) => {
    cfg.backpack = { cols: 20, rows: 20 }
  })
  assert.ok(keys.includes('backpack.capacity'))
})

test('validateConfig erkennt einen Combo ohne erreichbare Familie', () => {
  const keys = broken((cfg) => {
    cfg.scoring = { comboPerMember: 0.15, comboMinSize: 5 }
  })
  assert.ok(keys.includes('scoring.reachable'))
})

test('validateConfig erkennt negative Cooldowns und Zufallsfaktoren', () => {
  const keys = broken((cfg) => {
    ;(cfg.damage as Record<string, unknown>).cooldownSteps = -1
    ;(cfg.player as Record<string, unknown>).minSpeedFactor = 0
  })
  assert.ok(keys.includes('damage.cooldownSteps'))
  assert.ok(keys.includes('player.minSpeedFactor'))
})
