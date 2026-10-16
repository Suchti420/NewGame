import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CONFIG, DAY_SECONDS } from '../src/core/config.ts'
import { generateWorld } from '../src/core/world.ts'
import { testWorld, makeEcho } from './helpers/factory.ts'
import { isRouteFeasible, PACK_OVERHEAD_SECONDS, routeFeasibility } from './helpers/route-bot.ts'

test('Route-Bot: Sanity der konservativen Obergrenze', () => {
  const world = generateWorld('route-sanity')
  const r = routeFeasibility(world)
  assert.equal(r.unreachable, 0)
  assert.equal(r.trips, Math.ceil(world.echoes.length / CONFIG.carry.max))
  assert.ok(r.pixels > 0, 'es muss Wegstrecke anfallen')
  assert.ok(r.seconds > r.trips * PACK_OVERHEAD_SECONDS, 'Packoverhead ist enthalten')
})

test('Route-Bot erkennt ein eingemauertes Echo als unschaffbar', () => {
  const box = [
    { x: 260, y: 200, w: 20, h: 120 },
    { x: 360, y: 200, w: 20, h: 120 },
    { x: 260, y: 200, w: 120, h: 20 },
    { x: 260, y: 300, w: 120, h: 20 },
  ]
  const trapped = makeEcho(0, { x: 320, y: 260 })
  const world = testWorld([trapped], box)
  const r = routeFeasibility(world)
  assert.equal(r.unreachable, 1, 'das eingemauerte Echo ist im Graphen nicht erreichbar')
  assert.equal(isRouteFeasible(world), false)
})

test('REGRESSION: 300 Seeds sind im Zeitbudget schaffbar', () => {
  let maxRatio = 0
  for (let i = 0; i < 300; i++) {
    const world = generateWorld(`feasible-${i}`)
    const r = routeFeasibility(world)
    assert.equal(r.unreachable, 0, `Seed ${i}: unerreichbares Echo`)
    assert.ok(
      r.seconds <= DAY_SECONDS,
      `Seed ${i}: Selbst die konservative Obergrenze (${r.seconds.toFixed(1)}s) sprengt das Budget (${DAY_SECONDS.toFixed(1)}s)`,
    )
    maxRatio = Math.max(maxRatio, r.seconds / DAY_SECONDS)
  }
  // Die Obergrenze ist absichtlich pessimistisch; echte Spieler sind schneller.
  assert.ok(maxRatio < 0.9, `Die schlimmste Obergrenze nutzt bereits ${(maxRatio * 100).toFixed(0)} % des Budgets`)
})
