/**
 * Simulation — der deterministische Kern.
 *
 * Repariert vier kritische Bugs der alten Version:
 *  1. `dt` wurde berechnet und nie benutzt -> 144 Hz war 4,8x so schnell wie
 *     30 Hz. Jetzt: fester Schritt, alles rechnet in STEP_SECONDS.
 *  2. Kein Damage-Cooldown -> ein Echo starb in 3 Frames (0,05 s). Jetzt:
 *     450-ms-Cooldown und Schaden aus der ECHTEN Aufprallgeschwindigkeit.
 *  3. Diagonale war 1,41x zu schnell. Jetzt: normalizeVector.
 *  4. Schadensschwelle lag UNTER der Gehgeschwindigkeit, "langsam = sicher"
 *     war widerlegt. Jetzt liegt sie zwischen Geh- und Sprintgeschwindigkeit.
 *
 * Zusaetzlich: Schaden entsteht nur bei einem Aufprall MIT Normalenkomponente.
 * Wer an einer Wand entlangstreift (tangential), nimmt keinen Schaden.
 */

import { CONFIG, DAY_STEPS, STEP_SECONDS } from './config.ts'
import { ECHO_RADIUS } from './world.ts'
import {
  circleRectOverlap,
  normalizeVector,
  pushOutOfRect,
  segmentClear,
  distance as dist2,
} from './geometry.ts'
import { placeEcho, removeEcho, scoreBackpack, type BackpackState } from './backpack.ts'
import type { ActionContext, BackpackScore, Echo, RunEvent, RunPhase, RunState, StepInput, World } from './types.ts'

/** Untere/obere Positionsgrenze — identisch zur Kollisionsgrenze (frueher: 20 vs 26). */
const INSET = CONFIG.player.radius + CONFIG.player.wallInset + CONFIG.player.radius

export function createRunState(world: World): RunState {
  return {
    phase: 'intro',
    simulating: false,
    world,
    player: { x: world.spawn.x, y: world.spawn.y, vx: 0, vy: 0, facing: CONFIG.player.startFacing },
    carry: [],
    stepsLeft: DAY_STEPS,
    stepCount: 0,
    damageCooldown: 0,
    score: 0,
    extracted: 0,
    bumps: 0,
    lastEvent: null,
  }
}

/** Setzt eine bestehende Instanz auf einen neuen Tag zurueck (kein Reload noetig). */
export function resetRun(state: RunState, world: World): void {
  state.phase = 'intro'
  state.simulating = false
  state.world = world
  state.player.x = world.spawn.x
  state.player.y = world.spawn.y
  state.player.vx = 0
  state.player.vy = 0
  state.player.facing = CONFIG.player.startFacing
  state.carry = []
  state.stepsLeft = DAY_STEPS
  state.stepCount = 0
  state.damageCooldown = 0
  state.score = 0
  state.extracted = 0
  state.bumps = 0
  state.lastEvent = null
}

/** Spielt der Zustand gerade Physik? Zeit laeuft in play UND pack. */
export function isSimulating(phase: RunPhase): boolean {
  return phase === 'play' || phase === 'pack'
}

/**
 * Einziger Pfad, der die Phase aendert. Ungueltige Uebergaenge werden
 * abgelehnt (Rueckgabe false) — illegale Zustaende sind nicht darstellbar.
 */
export function setPhase(state: RunState, next: RunPhase): boolean {
  if (next === state.phase) return true
  if (!isPhaseTransitionAllowed(state.phase, next)) return false
  state.phase = next
  state.simulating = isSimulating(next)
  return true
}

/** Startet den Tag: intro -> play. */
export function startRun(state: RunState): boolean {
  return setPhase(state, 'play')
}

export function pauseRun(state: RunState): boolean {
  return setPhase(state, 'paused')
}

export function resumeRun(state: RunState): boolean {
  return setPhase(state, 'play')
}

/**
 * Oeffnet den Rucksack. Nur am Portal und nur aus play.
 * Sonst kommt 'notAtPortal' zurueck -> die UI zeigt genau das an.
 */
export function openPack(state: RunState): RunEvent[] {
  if (!isAtPortal(state)) return [{ kind: 'notAtPortal' }]
  setPhase(state, 'pack')
  return []
}

export function closePack(state: RunState): boolean {
  return setPhase(state, 'play')
}

export function actionContext(state: RunState): ActionContext {
  return { phase: state.phase, atPortal: isAtPortal(state) }
}

export function isAtPortal(state: RunState): boolean {
  const p = state.world.portal
  const reach = p.r + CONFIG.player.radius + CONFIG.portal.reachPadding
  return dist2(state.player.x, state.player.y, p.x, p.y) <= reach
}

/** Nebelradius zum aktuellen Zeitpunkt. Rein deterministisch, kein Zufall. */
export function fogRadius(state: RunState): number {
  const t = state.stepCount / DAY_STEPS
  const { startRadius, endRadius } = CONFIG.fog
  return startRadius + (endRadius - startRadius) * t
}

export function distanceToPortal(state: RunState): number {
  return dist2(state.player.x, state.player.y, state.world.portal.x, state.world.portal.y)
}

/** Masse-Faktor: mehr Getragenes verlangsamt, macht das Buendel aber nicht unverwundbar. */
export function speedFactor(carryCount: number): number {
  return Math.max(CONFIG.player.minSpeedFactor, 1 - CONFIG.player.carrySlowdown * carryCount)
}

export function currentSpeed(state: RunState, sprint: boolean): number {
  const base = CONFIG.player.walkSpeed * (sprint ? CONFIG.player.sprintMultiplier : 1)
  return base * speedFactor(state.carry.length)
}

export function carriedValue(state: RunState): number {
  let sum = 0
  for (const echo of state.carry) sum += Math.round((echo.baseValue * echo.integrity) / 100)
  return sum
}

interface ResolveResult {
  x: number
  y: number
  normalX: number
  normalY: number
  hit: boolean
}

/**
 * Position aufloesen: Kreis aus allen Waenden herausschieben und die
 * Summe der Verschiebungen als Wandnormale zurueckgeben.
 *
 * Die alte Version pruefte nur (`collide`), ohne aufzuloesen — dadurch
 * blieb der Spieler in 11,8 % der Tage fuer 180 Sekunden eingesperrt.
 */
function resolvePosition(state: RunState, nx: number, ny: number): ResolveResult {
  const r = CONFIG.player.radius
  let px = nx
  let py = ny
  let accX = 0
  let accY = 0
  let hit = false

  for (let pass = 0; pass < 3; pass++) {
    let moved = false
    for (const wall of state.world.walls) {
      const res = pushOutOfRect(px, py, r, wall)
      if (res.pushed) {
        accX += res.x - px
        accY += res.y - py
        px = res.x
        py = res.y
        moved = true
        hit = true
      }
    }
    if (!moved) break
  }

  // Sicherheitsnetz: harte Grenzen, identisch mit der Kollisionsgrenze.
  const cx = px < INSET ? INSET : px > CONFIG.arena.width - INSET ? CONFIG.arena.width - INSET : px
  const cy = py < INSET ? INSET : py > CONFIG.arena.height - INSET ? CONFIG.arena.height - INSET : py
  if (cx !== px || cy !== py) hit = true

  const n = normalizeVector({ x: accX, y: accY })
  return { x: cx, y: cy, normalX: n.x, normalY: n.y, hit }
}

function applyDamage(state: RunState, amount: number, events: RunEvent[]): void {
  if (amount <= 0 || state.carry.length === 0) return
  for (const echo of state.carry) {
    echo.integrity = Math.max(0, echo.integrity - amount * echo.fragility)
  }
  // Zerbrochene Echos sind verloren.
  for (let i = state.carry.length - 1; i >= 0; i--) {
    const echo = state.carry[i] as Echo
    if (echo.integrity <= 0) {
      echo.state = 'extracted'
      state.carry.splice(i, 1)
      events.push({ kind: 'broke', name: echo.name })
    }
  }
}

function nearestPickup(state: RunState): Echo | null {
  let best: Echo | null = null
  let bestDist: number = CONFIG.pickup.radius
  for (const echo of state.world.echoes) {
    if (echo.state !== 'ground') continue
    const d = dist2(state.player.x, state.player.y, echo.x, echo.y)
    if (d > bestDist) continue
    if (CONFIG.pickup.requireLineOfSight) {
      const clear = segmentClear(
        state.player.x,
        state.player.y,
        echo.x,
        echo.y,
        state.world.walls,
        CONFIG.player.radius * 0.5,
      )
      if (!clear) continue
    }
    best = echo
    bestDist = d
  }
  return best
}

function doPickup(state: RunState, events: RunEvent[]): void {
  if (state.carry.length >= CONFIG.carry.max) {
    events.push({ kind: 'carryFull' })
    state.lastEvent = { kind: 'carryFull' }
    return
  }
  const echo = nearestPickup(state)
  if (!echo) return
  echo.state = 'carried'
  state.carry.push(echo)
  events.push({ kind: 'pickup', name: echo.name })
  state.lastEvent = { kind: 'pickup', name: echo.name }
}

function doDrop(state: RunState, events: RunEvent[]): void {
  const echo = state.carry.pop()
  if (!echo) return

  const back = CONFIG.drop.backOffset
  let x = state.player.x - Math.cos(state.player.facing) * back
  let y = state.player.y - Math.sin(state.player.facing) * back

  // Aus Waenden herausschieben; wenn dann noch ueberlappt, am Spieler ablegen.
  for (let pass = 0; pass < 3; pass++) {
    let moved = false
    for (const wall of state.world.walls) {
      const res = pushOutOfRect(x, y, ECHO_RADIUS, wall)
      if (res.pushed) {
        x = res.x
        y = res.y
        moved = true
      }
    }
    if (!moved) break
  }

  let overlapping = false
  for (const wall of state.world.walls) {
    if (circleRectOverlap(x, y, ECHO_RADIUS, wall)) {
      overlapping = true
      break
    }
  }
  if (overlapping) {
    x = state.player.x
    y = state.player.y
  }

  echo.x = x
  echo.y = y
  echo.integrity = Math.max(0, echo.integrity - CONFIG.drop.integrityPenalty)
  echo.state = 'ground'

  if (echo.integrity <= 0) {
    echo.state = 'extracted'
    events.push({ kind: 'broke', name: echo.name })
    state.lastEvent = { kind: 'broke', name: echo.name }
  } else {
    events.push({ kind: 'drop', name: echo.name, integrity: echo.integrity })
    state.lastEvent = { kind: 'drop', name: echo.name, integrity: echo.integrity }
  }
}

/**
 * Ein einzelner Simulationsschritt. Mutiert state, liefert die Events.
 * Der Aufrufer (Shell) entscheidet ueber Audio/Haptik/Toast.
 */
export function stepRun(state: RunState, input: StepInput): RunEvent[] {
  const events: RunEvent[] = []

  // Intro, Pause und Tagesende frieren die Simulation ein.
  // Im Packmodus laeuft sie weiter (nur ohne Bewegung) -> Packen kostet Zeit.
  const moveAllowed = state.phase === 'play'
  if (state.phase === 'intro' || state.phase === 'paused' || state.phase === 'over') {
    return events
  }

  // Packmodus nur solange man am Portal steht. Verlaesst man den Radius
  // (oder laeuft die Zeit ab), schliesst PACK zwangsweise.
  if (state.phase === 'pack' && !isAtPortal(state)) {
    setPhase(state, 'play')
  }

  const sprint = moveAllowed && input.sprint
  const dir = moveAllowed ? normalizeVector(input.move) : { x: 0, y: 0 }
  const speed = currentSpeed(state, sprint)
  const vx = dir.x * speed
  const vy = dir.y * speed

  state.player.vx = vx
  state.player.vy = vy
  if (dir.x !== 0 || dir.y !== 0) state.player.facing = Math.atan2(dir.y, dir.x)

  const nx = state.player.x + vx * STEP_SECONDS
  const ny = state.player.y + vy * STEP_SECONDS
  const resolved = resolvePosition(state, nx, ny)
  state.player.x = resolved.x
  state.player.y = resolved.y

  if (state.damageCooldown > 0) state.damageCooldown--

  // Aufprall: nur die Komponente der Geschwindigkeit GEGEN die Wand zaehlt.
  // Tangentiales Streifen hat v . n ~ 0 -> kein Schaden.
  if (resolved.hit && state.damageCooldown === 0 && state.carry.length > 0) {
    const impact = -(vx * resolved.normalX + vy * resolved.normalY)
    if (impact > CONFIG.damage.thresholdSpeed) {
      const excess = impact - CONFIG.damage.thresholdSpeed
      const damage = Math.min(CONFIG.damage.maxPerHit, excess * CONFIG.damage.scalePerEcho)
      state.bumps++
      const before = state.carry.map((e) => e.integrity)
      applyDamage(state, damage, events)
      state.damageCooldown = CONFIG.damage.cooldownSteps
      const worst = Math.max(...state.carry.map((e, i) => (before[i] ?? 100) - e.integrity), damage)
      state.lastEvent = { kind: 'bump', damage: worst }
      events.push({ kind: 'bump', damage: worst })
    }
  }

  // Nebel: deterministischer Dauerschaden, wenn man sich vom Portal entfernt
  // und etwas traegt. Der Radius ist sichtbar -> nie ein "warum sterbe ich".
  if (state.carry.length > 0 && distanceToPortal(state) > fogRadius(state)) {
    const fogDamage = CONFIG.fog.damagePerSecond * STEP_SECONDS
    applyDamage(state, fogDamage, events)
    state.lastEvent = { kind: 'fog', damage: fogDamage }
    events.push({ kind: 'fog', damage: fogDamage })
  }

  // Flankenaktionen nur im Spielmodus.
  if (moveAllowed) {
    if (input.interact) doPickup(state, events)
    if (input.drop) doDrop(state, events)
  }

  state.stepCount++
  state.stepsLeft = Math.max(0, DAY_STEPS - state.stepCount)

  if (state.stepsLeft === 0) {
    setPhase(state, 'over')
    events.push({ kind: 'dayEnd' })
    state.lastEvent = { kind: 'dayEnd' }
  }

  return events
}

/** Extraktion: der Rucksackinhalt wird in Score umgewandelt. */
export function extractFromBackpack(state: RunState, bp: BackpackState): BackpackScore {
  const score = scoreBackpack(bp)
  if (score.base === 0 && score.total === 0) return score

  for (let i = 0; i < bp.grid.length; i++) {
    const echo = bp.grid[i]
    if (echo && echo.state === 'packed') {
      echo.state = 'extracted'
      if (!state.carry.includes(echo)) state.carry = state.carry.filter((e) => e !== echo)
    }
  }
  state.score += score.total
  state.extracted += bp.placements.length
  bp.grid.fill(null)
  bp.placements.length = 0

  state.lastEvent = { kind: 'extracted', score: score.total, base: score.base, combo: score.combo }
  return score
}

export function isPhaseTransitionAllowed(from: RunPhase, to: RunPhase): boolean {
  const table: Record<RunPhase, RunPhase[]> = {
    intro: ['play'],
    play: ['pack', 'paused', 'over'],
    pack: ['play', 'over'],
    paused: ['play', 'over'],
    over: ['intro'],
  }
  return table[from].includes(to)
}

/** Extraktion ist nur im Packmodus und nur am Portal erlaubt. */
export function canExtract(state: RunState): boolean {
  return state.phase === 'pack' && isAtPortal(state)
}

/**
 * Legt ein getragenes Echo in den Rucksack. Nur am Portal, nur im Packmodus.
 * Entfernt es aus der Hand und markiert es als 'packed'.
 */
export function packEcho(
  state: RunState,
  bp: BackpackState,
  echo: Echo,
  rot: number,
  gx: number,
  gy: number,
): RunEvent[] {
  if (!canExtract(state)) return [{ kind: 'notAtPortal' }]
  const idx = state.carry.indexOf(echo)
  if (idx < 0) return []
  if (!placeEcho(bp, echo, rot, gx, gy)) return []

  state.carry.splice(idx, 1)
  echo.state = 'packed'
  state.lastEvent = { kind: 'packed', name: echo.name }
  return [{ kind: 'packed', name: echo.name }]
}

/** Nimmt ein Echo aus dem Rucksack zurück in die Hand. */
export function unpackEcho(state: RunState, bp: BackpackState, echoId: number): RunEvent[] {
  if (state.phase !== 'pack') return [{ kind: 'notAtPortal' }]
  if (state.carry.length >= CONFIG.carry.max) {
    state.lastEvent = { kind: 'carryFull' }
    return [{ kind: 'carryFull' }]
  }
  const echo = removeEcho(bp, echoId)
  if (!echo) return []

  echo.state = 'carried'
  state.carry.push(echo)
  state.lastEvent = { kind: 'unpacked', name: echo.name }
  return [{ kind: 'unpacked', name: echo.name }]
}
