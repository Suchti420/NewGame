import { test } from 'node:test'
import assert from 'node:assert/strict'
import { advance, createClock, interpolationAlpha, resetClock } from '../src/core/clock.ts'
import { DAY_STEPS, MAX_STEPS_PER_FRAME, STEP_PER_SECOND, STEP_US } from '../src/core/config.ts'
import { createRunState, startRun, stepRun } from '../src/core/simulation.ts'
import { generateWorld } from '../src/core/world.ts'
import type { RunState, StepInput, World } from '../src/core/types.ts'

const SEED = 'determinismus-2026-10-16'

/**
 * Eingabeskript. Rein aus dem Index abgeleitet -> selbst deterministisch.
 * Enthaelt Bewegung, Sprint, Aufnehmen und Ablegen.
 */
function buildScript(n: number): StepInput[] {
  const script: StepInput[] = []
  for (let i = 0; i < n; i++) {
    const angle = i * 0.031
    script.push({
      move: { x: Math.cos(angle), y: Math.sin(angle) },
      sprint: i % 7 === 0,
      interact: i % 13 === 0,
      drop: i % 97 === 0,
    })
  }
  return script
}

function snapshot(state: RunState) {
  return {
    phase: state.phase,
    player: { ...state.player },
    stepCount: state.stepCount,
    stepsLeft: state.stepsLeft,
    damageCooldown: state.damageCooldown,
    score: state.score,
    bumps: state.bumps,
    carry: state.carry.map((e) => ({ id: e.id, integrity: e.integrity })),
    echoes: state.world.echoes.map((e) => ({ id: e.id, x: e.x, y: e.y, integrity: e.integrity, state: e.state })),
  }
}

/**
 * Fuehrt das Skript mit einer festen Frame-Aufteilung aus.
 * frameUs * frames muss exakt die Gesamtdauer ergeben, damit die
 * akkumulierte Schrittzahl fuer alle Bildraten identisch ist.
 */
function runAt(frameUs: number, frames: number, script: StepInput[], world: World): RunState {
  const state = createRunState(world)
  startRun(state)
  const clock = createClock()
  const maxSteps = 64

  let fed = 0
  for (let f = 0; f < frames; f++) {
    const steps = advance(clock, frameUs, maxSteps)
    for (let s = 0; s < steps; s++) {
      const input = script[fed]
      assert.ok(input, 'Skript zu kurz — mehr Schritte als Eingaben')
      stepRun(state, input)
      fed++
    }
  }

  assert.equal(fed, script.length, `Es muessen exakt ${script.length} Schritte ausgefuehrt werden, waren ${fed}`)
  return state
}

test('Akkumulator: 30/60/144 Hz ergeben denselben Schrittbestand', () => {
  const N = 720
  const totalUs = N * STEP_US // = 5_999_760 us

  // Bildraten so waehlen, dass frameUs * frames == totalUs exakt gilt.
  const configs = [
    { name: '30 Hz', frames: 30, frameUs: totalUs / 30 },
    { name: '60 Hz', frames: 60, frameUs: totalUs / 60 },
    { name: '144 Hz', frames: 144, frameUs: totalUs / 144 },
  ]
  for (const c of configs) {
    assert.ok(Number.isInteger(c.frameUs), `${c.name}: frameUs muss ganzzahlig sein`)
    assert.equal(c.frameUs * c.frames, totalUs)
  }

  const script = buildScript(N)
  const results = configs.map((c) => {
    const world = generateWorld(SEED) // jede Runde eine frische, identische Welt
    const state = runAt(c.frameUs, c.frames, script, world)
    return { name: c.name, state: snapshot(state) }
  })

  const reference = results[0]
  assert.ok(reference)
  for (const r of results.slice(1)) {
    assert.deepEqual(r.state, reference.state, `${r.name} weicht von ${reference.name} ab`)
  }

  // Gegenprobe: der Spieler ist wirklich durch die Gegend gelaufen.
  assert.ok(reference.state.stepCount === N)
  const travelled = Math.hypot(
    reference.state.player.x - generateWorld(SEED).spawn.x,
    reference.state.player.y - generateWorld(SEED).spawn.y,
  )
  assert.ok(travelled > 50, `zu wenig Bewegung fuer einen echten Test: ${travelled}`)
})

test('Akkumulator: Schrittbestand == floor(Gesamtzeit / STEP_US)', () => {
  const N = 720
  const totalUs = N * STEP_US
  for (const frames of [1, 3, 7, 30, 60, 144, 359]) {
    const clock = createClock()
    const perFrame = Math.floor(totalUs / frames)
    let used = 0
    for (let f = 0; f < frames; f++) {
      const frame = f === frames - 1 ? totalUs - used : perFrame
      used += frame
      advance(clock, frame, 100000)
    }
    assert.equal(used, totalUs)
    assert.equal(clock.steps, N, `frames=${frames}`)
  }
})

test('MAX_STEPS_PER_FRAME verhindert die Spiral-of-Death', () => {
  const clock = createClock()
  const steps = advance(clock, 10_000_000, MAX_STEPS_PER_FRAME)
  assert.equal(steps, MAX_STEPS_PER_FRAME, 'der Ueberhang wird verworfen, nicht nachgeholt')
  assert.equal(clock.accumulatorUs, 0)
  assert.equal(clock.steps, MAX_STEPS_PER_FRAME)
})

test('interpolationAlpha liegt in [0,1) und resetClock leert', () => {
  const clock = createClock()
  advance(clock, STEP_US * 3 + Math.floor(STEP_US / 2), 100)
  const alpha = interpolationAlpha(clock)
  assert.ok(alpha >= 0 && alpha < 1, `alpha=${alpha}`)
  resetClock(clock)
  assert.equal(clock.steps, 0)
  assert.equal(clock.accumulatorUs, 0)
})

test('Tagesbudget passt zur abgeleiteten Rate', () => {
  assert.ok(Math.abs(STEP_PER_SECOND - 120) < 1, 'ca. 120 Hz')
  assert.ok(Math.abs(DAY_STEPS / STEP_PER_SECOND - 180) < 0.1, 'Der Tag dauert ~180 s')
})
