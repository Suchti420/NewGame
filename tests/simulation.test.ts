import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CONFIG, DAY_STEPS, STEP_SECONDS } from '../src/core/config.ts'
import {
  canExtract,
  carriedValue,
  closePack,
  createRunState,
  currentSpeed,
  extractFromBackpack,
  fogRadius,
  isAtPortal,
  isPhaseTransitionAllowed,
  openPack,
  packEcho,
  pauseRun,
  resetRun,
  resumeRun,
  setPhase,
  speedFactor,
  startRun,
  stepRun,
  unpackEcho,
} from '../src/core/simulation.ts'
import { createBackpack, scoreBackpack } from '../src/core/backpack.ts'
import type { RunState, StepInput } from '../src/core/types.ts'
import { carryEcho, makeEcho, testWorld } from './helpers/factory.ts'

const IDLE: StepInput = { move: { x: 0, y: 0 }, sprint: false, interact: false, drop: false }
const RIGHT: StepInput = { move: { x: 1, y: 0 }, sprint: false, interact: false, drop: false }
const SPRINT_RIGHT: StepInput = { move: { x: 1, y: 0 }, sprint: true, interact: false, drop: false }

function playingState(): RunState {
  const state = createRunState(testWorld())
  startRun(state)
  return state
}

test('Intro/Pause/Over frieren die Simulation ein', () => {
  const state = createRunState(testWorld())
  assert.equal(state.phase, 'intro')
  assert.deepEqual(stepRun(state, RIGHT), [])
  assert.equal(state.stepCount, 0, 'Intro darf keine Schritte zaehlen')

  startRun(state)
  pauseRun(state)
  assert.deepEqual(stepRun(state, RIGHT), [])
  assert.equal(state.stepCount, 0, 'Pause friert die Zeit ein')

  resumeRun(state)
  stepRun(state, RIGHT)
  assert.equal(state.stepCount, 1)

  setPhase(state, 'over')
  assert.deepEqual(stepRun(state, RIGHT), [])
})

test('setPhase lehnt ungueltige Uebergaenge ab', () => {
  const state = createRunState(testWorld())
  assert.equal(setPhase(state, 'pack'), false, 'intro -> pack ist verboten')
  assert.equal(state.phase, 'intro')
  assert.equal(setPhase(state, 'play'), true)
  assert.equal(setPhase(state, 'paused'), true)
  assert.equal(setPhase(state, 'pack'), false, 'paused -> pack ist verboten')
})

test('isPhaseTransitionAllowed Wahrheitstabelle', () => {
  assert.equal(isPhaseTransitionAllowed('intro', 'play'), true)
  assert.equal(isPhaseTransitionAllowed('intro', 'paused'), false)
  assert.equal(isPhaseTransitionAllowed('play', 'pack'), true)
  assert.equal(isPhaseTransitionAllowed('play', 'paused'), true)
  assert.equal(isPhaseTransitionAllowed('play', 'over'), true)
  assert.equal(isPhaseTransitionAllowed('pack', 'paused'), false)
  assert.equal(isPhaseTransitionAllowed('paused', 'pack'), false)
  assert.equal(isPhaseTransitionAllowed('over', 'intro'), true)
  assert.equal(isPhaseTransitionAllowed('over', 'play'), false)
})

test('Bewegung: ein Schritt bewegt um speed*STEP_SECONDS', () => {
  const state = playingState()
  const startX = state.player.x
  stepRun(state, RIGHT)
  const expected = CONFIG.player.walkSpeed * STEP_SECONDS
  assert.ok(state.player.x > startX, 'Spieler muss sich bewegt haben')
  assert.ok(Math.abs(state.player.x - startX - expected) < 0.5, `Bewegung war ${state.player.x - startX}, erwartet ~${expected}`)
  assert.equal(state.stepsLeft, DAY_STEPS - 1)
})

test('Diagonale Bewegung ist nicht 1,41x schneller (Regression)', () => {
  const a = playingState()
  const b = playingState()
  stepRun(a, RIGHT)
  stepRun(b, { move: { x: 1, y: 1 }, sprint: false, interact: false, drop: false })
  const distA = Math.hypot(a.player.x - a.world.spawn.x, a.player.y - a.world.spawn.y)
  const distB = Math.hypot(b.player.x - b.world.spawn.x, b.player.y - b.world.spawn.y)
  assert.ok(Math.abs(distA - distB) < 1e-6, `gerade ${distA} vs diagonal ${distB}`)
})

test('Sprint in die Wand verletzt getragene Echos', () => {
  const state = playingState()
  carryEcho(state, 0)
  state.player.x = CONFIG.arena.width - (CONFIG.player.radius + CONFIG.player.wallInset) - 4
  state.player.y = CONFIG.arena.height / 2

  const events = stepRun(state, SPRINT_RIGHT)
  assert.ok(events.some((e) => e.kind === 'bump'), 'Sprint-Aufprall muss bumpe ausloesen')
  const echo = state.carry[0]
  assert.ok(echo && echo.integrity < 100, 'Integritaet muss sinken')
  assert.ok(state.damageCooldown > 0, 'Cooldown muss gesetzt sein')
  assert.equal(state.bumps, 1)
})

test('Gehen in die Wand verletzt NICHT (langsam = sicher)', () => {
  const state = playingState()
  carryEcho(state, 0)
  state.player.x = CONFIG.arena.width - (CONFIG.player.radius + CONFIG.player.wallInset) - 4
  state.player.y = CONFIG.arena.height / 2

  for (let i = 0; i < 30; i++) stepRun(state, RIGHT)
  const echo = state.carry[0]
  assert.ok(echo)
  assert.equal(echo.integrity, 100, 'Gehgeschwindigkeit liegt unter der Schadensschwelle')
  assert.equal(state.bumps, 0)
})

test('Tangentales Streifen an der Wand verursacht keinen Schaden', () => {
  const state = playingState()
  carryEcho(state, 0)
  // In der oberen Randwand steckend, aber nur seitlich (nach rechts) unterwegs.
  state.player.x = CONFIG.arena.width / 2
  state.player.y = CONFIG.player.radius + CONFIG.player.wallInset - 6

  for (let i = 0; i < 20; i++) stepRun(state, SPRINT_RIGHT)
  const echo = state.carry[0]
  assert.ok(echo)
  assert.equal(echo.integrity, 100, 'v . n ~ 0 darf keinen Schaden geben')
  assert.equal(state.bumps, 0)
})

test('Damage-Cooldown blockt den zweiten Treffer', () => {
  const state = playingState()
  carryEcho(state, 0)
  const wall = CONFIG.arena.width - (CONFIG.player.radius + CONFIG.player.wallInset)
  state.player.y = CONFIG.arena.height / 2

  state.player.x = wall - 4
  stepRun(state, SPRINT_RIGHT)
  const afterFirst = state.carry[0]?.integrity ?? 100
  assert.ok(state.damageCooldown > 0)

  state.player.x = wall - 4
  stepRun(state, SPRINT_RIGHT)
  assert.equal(state.carry[0]?.integrity, afterFirst, 'innerhalb des Cooldowns kein zweiter Treffer')
  assert.equal(state.bumps, 1)
})

test('Cooldown laeuft exakt ab und der naechste Treffer zaehlt wieder', () => {
  const state = playingState()
  carryEcho(state, 0)
  const wall = CONFIG.arena.width - (CONFIG.player.radius + CONFIG.player.wallInset)
  state.player.y = CONFIG.arena.height / 2

  state.player.x = wall - 4
  stepRun(state, SPRINT_RIGHT)
  const afterFirst = state.carry[0]?.integrity ?? 100
  assert.ok(afterFirst < 100)

  state.player.x = CONFIG.arena.width / 2
  for (let i = 0; i < CONFIG.damage.cooldownSteps; i++) stepRun(state, IDLE)
  assert.equal(state.damageCooldown, 0, 'nach cooldownSteps muss der Schutz weg sein')

  state.player.x = wall - 4
  stepRun(state, SPRINT_RIGHT)
  assert.ok((state.carry[0]?.integrity ?? 100) < afterFirst, 'nach Cooldown zaehlt der Treffer wieder')
  assert.equal(state.bumps, 2)
})

test('Ein Treffer verletzt ALLE getragenen Echos, skaliert mit jedem fragility', () => {
  const state = playingState()
  const soft = carryEcho(state, 0) // fragility 1.0
  const fragile = carryEcho(state, 6) // fragility 1.5
  state.player.x = CONFIG.arena.width - (CONFIG.player.radius + CONFIG.player.wallInset) - 4
  state.player.y = CONFIG.arena.height / 2

  const impact = currentSpeed(state, true)
  const excess = impact - CONFIG.damage.thresholdSpeed
  const amount = Math.min(CONFIG.damage.maxPerHit, excess * CONFIG.damage.scalePerEcho)

  stepRun(state, SPRINT_RIGHT)
  assert.ok(Math.abs(soft.integrity - (100 - amount * soft.fragility)) < 1e-6, `soft=${soft.integrity}`)
  assert.ok(
    Math.abs(fragile.integrity - (100 - amount * fragile.fragility)) < 1e-6,
    `fragile=${fragile.integrity}`,
  )
  assert.ok(100 - fragile.integrity > 100 - soft.integrity, 'das zerbrechlichere Echo verliert mehr')
})

test('maxPerHit ist ein Sicherheitsnetz: der schlimmste Sprint-Treffer liegt darunter', () => {
  const maxImpact = CONFIG.player.walkSpeed * CONFIG.player.sprintMultiplier * speedFactor(1)
  const maxDamage = (maxImpact - CONFIG.damage.thresholdSpeed) * CONFIG.damage.scalePerEcho
  assert.ok(maxDamage > 0, 'ein Sprint-Aufprall muss ueberhaupt schaden')
  assert.ok(
    maxDamage < CONFIG.damage.maxPerHit,
    `maximaler Einzeltreffer ${maxDamage} muss unter dem Deckel ${CONFIG.damage.maxPerHit} liegen`,
  )
})

test('Im Packmodus am Portal gibt es keinen Nebelschaden', () => {
  const state = playingState()
  carryEcho(state, 0)
  state.player.x = state.world.portal.x
  state.player.y = state.world.portal.y
  openPack(state)
  state.stepCount = DAY_STEPS - 10

  const before = state.carry[0]?.integrity ?? 100
  for (let i = 0; i < 9; i++) stepRun(state, IDLE)
  assert.equal(state.phase, 'pack', 'solange am Portal bleibt PACK offen')
  assert.equal(state.carry[0]?.integrity, before, 'Nebel braucht Portal-Distanz, die es im PACK nicht gibt')
})

test('Nebel schaedigt nur weit vom Portal und nur spaet im Tag', () => {
  const state = playingState()
  carryEcho(state, 0)
  assert.ok(fogRadius(state) > 400, 'zu Tagesbeginn ist der Nebel weit offen')

  // Zu Tagesbeginn in der Ecke: noch kein Nebel.
  state.player.x = CONFIG.player.radius + CONFIG.player.wallInset
  state.player.y = CONFIG.player.radius + CONFIG.player.wallInset
  stepRun(state, IDLE)
  assert.equal(state.carry[0]?.integrity, 100, 'frueh im Tag kein Nebelschaden')

  // Kurz vor Tagesende ist der Nebel eng -> Ecke liegt darin.
  state.stepCount = DAY_STEPS - 20
  const before = state.carry[0]?.integrity ?? 100
  const events = stepRun(state, IDLE)
  assert.ok(events.some((e) => e.kind === 'fog'), 'spaeter Nebel muss schaden')
  assert.ok((state.carry[0]?.integrity ?? 100) < before)
})

test('Nebel am Portal schadet nie', () => {
  const state = playingState()
  carryEcho(state, 0)
  state.stepCount = DAY_STEPS - 5
  state.player.x = state.world.portal.x
  state.player.y = state.world.portal.y
  assert.equal(isAtPortal(state), true)
  const before = state.carry[0]?.integrity ?? 100
  stepRun(state, IDLE)
  assert.equal(state.carry[0]?.integrity, before, 'am Portal ist man sicher')
})

test('Aufnehmen respektiert Radius und Sichtlinie', () => {
  const echoNear = makeEcho(0, { x: 400, y: 318 })
  const state = playingState()
  state.world = testWorld([echoNear])
  state.player.x = 400
  state.player.y = 346
  stepRun(state, { ...IDLE, interact: true })
  assert.equal(state.carry.length, 1, 'Echo in Reichweite ohne Wand wird aufgenommen')

  // Wand dazwischen -> Sichtlinie blockiert.
  const blocked = makeEcho(0, { x: 400, y: 316 })
  const wall = { x: 360, y: 322, w: 80, h: 6 }
  const s2 = playingState()
  s2.world = testWorld([blocked], [wall])
  s2.player.x = 400
  s2.player.y = 344
  stepRun(s2, { ...IDLE, interact: true })
  assert.equal(s2.carry.length, 0, 'durch die Wand darf nicht aufgenommen werden')

  // Ausserhalb des Radius.
  const far = makeEcho(1, { x: 400, y: 300 })
  const s3 = playingState()
  s3.world = testWorld([far])
  s3.player.x = 400
  s3.player.y = 346
  stepRun(s3, { ...IDLE, interact: true })
  assert.equal(s3.carry.length, 0, 'ausserhalb des Radius kein Aufnehmen')
})

test('Carry-Limit loest carryFull aus', () => {
  const state = playingState()
  for (let i = 0; i < CONFIG.carry.max; i++) carryEcho(state, i)
  state.world = testWorld([makeEcho(7, { x: state.player.x, y: state.player.y })])
  const events = stepRun(state, { ...IDLE, interact: true })
  assert.ok(events.some((e) => e.kind === 'carryFull'))
  assert.equal(state.carry.length, CONFIG.carry.max)
})

test('Ablegen legt das Echo frei ab und kostet Integritaet', () => {
  const state = playingState()
  const echo = carryEcho(state, 0)
  const events = stepRun(state, { ...IDLE, drop: true })
  assert.ok(events.some((e) => e.kind === 'drop'))
  assert.equal(state.carry.length, 0)
  assert.equal(echo.state, 'ground')
  assert.equal(echo.integrity, 100 - CONFIG.drop.integrityPenalty)
  assert.ok(echo.x > 0 && echo.x < CONFIG.arena.width && echo.y > 0 && echo.y < CONFIG.arena.height)
})

test('Zerbrechen beim Ablegen entfernt das Echo endgueltig', () => {
  const state = playingState()
  const echo = carryEcho(state, 0)
  echo.integrity = 2
  const events = stepRun(state, { ...IDLE, drop: true })
  assert.ok(events.some((e) => e.kind === 'broke'))
  assert.equal(echo.state, 'extracted')
  assert.equal(state.carry.length, 0)
})

test('Tagesende: Zeitbduget laeuft ab und Phase wird over', () => {
  const state = playingState()
  state.stepCount = DAY_STEPS - 1
  state.stepsLeft = 1
  const events = stepRun(state, IDLE)
  assert.ok(events.some((e) => e.kind === 'dayEnd'))
  assert.equal(state.phase, 'over')
  assert.equal(state.stepsLeft, 0)
  assert.equal(state.simulating, false)
})

test('openPack nur am Portal, sonst notAtPortal', () => {
  const state = playingState()
  state.player.x = state.world.spawn.x
  state.player.y = state.world.spawn.y
  const away = openPack(state)
  assert.deepEqual(away, [{ kind: 'notAtPortal' }])
  assert.equal(state.phase, 'play')

  state.player.x = state.world.portal.x
  state.player.y = state.world.portal.y
  assert.deepEqual(openPack(state), [])
  assert.equal(state.phase, 'pack')
  assert.equal(state.simulating, true, 'Zeit laeuft im Packmodus')
})

test('Packen kostet Zeit, Bewegung ist gesperrt', () => {
  const state = playingState()
  state.player.x = state.world.portal.x
  state.player.y = state.world.portal.y
  openPack(state)

  const x0 = state.player.x
  const steps0 = state.stepCount
  for (let i = 0; i < 10; i++) stepRun(state, SPRINT_RIGHT)
  assert.equal(state.stepCount, steps0 + 10, 'Die Uhr laeuft beim Packen weiter')
  assert.equal(state.player.x, x0, 'Bewegung ist im Packmodus gesperrt')
})

test('Verlaesst man das Portal, schliesst PACK zwangsweise', () => {
  const state = playingState()
  state.player.x = state.world.portal.x
  state.player.y = state.world.portal.y
  openPack(state)
  state.player.x = CONFIG.player.radius + CONFIG.player.wallInset + 1
  state.player.y = CONFIG.player.radius + CONFIG.player.wallInset + 1
  stepRun(state, IDLE)
  assert.equal(state.phase, 'play')
})

test('Tamper-Schutz: Extraktion nur im Packmodus am Portal', () => {
  const state = playingState()
  assert.equal(canExtract(state), false)
  state.player.x = state.world.portal.x
  state.player.y = state.world.portal.y
  assert.equal(canExtract(state), false, 'nicht im Packmodus')
  openPack(state)
  assert.equal(canExtract(state), true)

  state.player.x = 60
  state.player.y = 60
  assert.equal(canExtract(state), false, 'weggelaufen -> keine Extraktion')
  stepRun(state, IDLE)
  assert.equal(state.phase, 'play')
})

test('packEcho/unpackEcho verschieben echte Echos zwischen Hand und Rucksack', () => {
  const state = playingState()
  state.player.x = state.world.portal.x
  state.player.y = state.world.portal.y
  openPack(state)
  const echo = carryEcho(state, 0)
  const bp = createBackpack()

  const packed = packEcho(state, bp, echo, 0, 0, 0)
  assert.deepEqual(packed, [{ kind: 'packed', name: echo.name }])
  assert.equal(state.carry.length, 0)
  assert.equal(echo.state, 'packed')

  const unpacked = unpackEcho(state, bp, echo.id)
  assert.deepEqual(unpacked, [{ kind: 'unpacked', name: echo.name }])
  assert.equal(state.carry.length, 1)
  assert.equal(echo.state, 'carried')
})

test('packEcho ausserhalb des Portals wird abgelehnt', () => {
  const state = playingState()
  const echo = carryEcho(state, 0)
  const bp = createBackpack()
  const events = packEcho(state, bp, echo, 0, 0, 0)
  assert.deepEqual(events, [{ kind: 'notAtPortal' }])
  assert.equal(state.carry.length, 1)
})

test('extractFromBackpack schreibt Score gut und leert den Rucksack', () => {
  const state = playingState()
  state.player.x = state.world.portal.x
  state.player.y = state.world.portal.y
  openPack(state)
  const bp = createBackpack()
  const a = carryEcho(state, 0)
  const b = carryEcho(state, 3)
  packEcho(state, bp, a, 0, 0, 0)
  // Signatur ist (rot, gx, gy). I-Form auf (gx=0, gy=2) -> (0,2)(1,2)(2,2), keine Kollision mit dem O.
  packEcho(state, bp, b, 0, 0, 2)
  // (0,0)-O und (0,2)-I sind vertikal benachbart, aber verschiedene Familien -> kein Combo.
  const expected = scoreBackpack(bp)

  const result = extractFromBackpack(state, bp)
  assert.deepEqual(result, expected)
  assert.equal(state.score, expected.total)
  assert.equal(state.extracted, 2)
  assert.equal(a.state, 'extracted')
  assert.equal(b.state, 'extracted')
  assert.equal(bp.placements.length, 0)
  assert.ok(bp.grid.every((c) => c === null))
})

test('Hilfsfunktionen: speedFactor, currentSpeed, carriedValue', () => {
  assert.equal(speedFactor(0), 1)
  assert.ok(speedFactor(5) < speedFactor(0))
  assert.ok(speedFactor(100) >= CONFIG.player.minSpeedFactor)
  const state = playingState()
  assert.equal(currentSpeed(state, false), CONFIG.player.walkSpeed)
  assert.ok(currentSpeed(state, true) > currentSpeed(state, false))
  carryEcho(state, 0)
  assert.equal(carriedValue(state), 120, 'Kinderlachen hat Basiswert 120 bei voller Integritaet')
})

test('resetRun setzt alles zurueck', () => {
  const state = playingState()
  carryEcho(state, 0)
  state.stepCount = 500
  state.score = 999
  state.bumps = 3
  resetRun(state, testWorld())
  assert.equal(state.phase, 'intro')
  assert.equal(state.stepCount, 0)
  assert.equal(state.stepsLeft, DAY_STEPS)
  assert.equal(state.score, 0)
  assert.equal(state.carry.length, 0)
  assert.equal(state.bumps, 0)
})

test('closePack fuehrt zurueck in play', () => {
  const state = playingState()
  state.player.x = state.world.portal.x
  state.player.y = state.world.portal.y
  openPack(state)
  assert.equal(closePack(state), true)
  assert.equal(state.phase, 'play')
})
