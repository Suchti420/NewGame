/**
 * Laufzeit-Invarianten der Konfiguration.
 *
 * config.ts ist `as const` — tippt man dort eine Zahl falsch, meckert der
 * Compiler nicht (jede Zahl ist ein gueltiger Literaltyp). validateConfig()
 * kodiert deshalb das DESIGN-Ziel als pruefbare Bedingungen, damit eine
 * versehentliche Aenderung (z. B. Schwelle unter Gehgeschwindigkeit) sofort
 * auffaellt statt still das Spiel zu brechen.
 */

import { CONFIG, MAX_STEPS_PER_FRAME, STEP_US } from './config.ts'
import { ECHO_DEFS } from './echoes.ts'
import { SHAPES, shapeCellCount } from './shapes.ts'
import type { Family, ShapeId } from './types.ts'
import { ECHO_RADIUS } from './world.ts'

export interface ConfigViolation {
  key: string
  message: string
}

const FAMILIES: readonly Family[] = ['warm', 'cool', 'nature']

export function validateConfig(cfg: typeof CONFIG = CONFIG): ConfigViolation[] {
  const violations: ConfigViolation[] = []
  const check = (key: string, ok: boolean, message: string): void => {
    if (!ok) violations.push({ key, message })
  }

  check('arena', cfg.arena.width > 0 && cfg.arena.height > 0, 'Arena muss positive Masse haben')
  check('day.seconds', cfg.day.seconds > 0, 'Der Tag braucht ein positives Zeitbudget')
  check('STEP_US', STEP_US > 0, 'Simulationsschritt muss positiv sein')
  check('MAX_STEPS_PER_FRAME', MAX_STEPS_PER_FRAME >= 1, 'Spiral-of-Death-Klammer muss greifen')

  check('player.radius', cfg.player.radius > 0, 'Spielerradius muss positiv sein')
  check('player.walkSpeed', cfg.player.walkSpeed > 0, 'Gehgeschwindigkeit muss positiv sein')
  check('player.sprintMultiplier', cfg.player.sprintMultiplier > 1, 'Sprint muss schneller als Gehen sein')
  check(
    'player.carrySlowdown',
    cfg.player.carrySlowdown >= 0 && cfg.player.carrySlowdown < 1,
    'Trageabzug muss in [0,1) liegen',
  )
  check(
    'player.minSpeedFactor',
    cfg.player.minSpeedFactor > 0 && cfg.player.minSpeedFactor <= 1,
    'Trage-Untergrenze muss in (0,1] liegen',
  )

  const walk = cfg.player.walkSpeed
  const sprint = cfg.player.walkSpeed * cfg.player.sprintMultiplier
  check(
    'damage.thresholdSpeed',
    cfg.damage.thresholdSpeed > walk && cfg.damage.thresholdSpeed < sprint,
    `Schwelle (${cfg.damage.thresholdSpeed}) muss strikt zwischen Geh- (${walk}) und Sprintgeschwindigkeit (${sprint}) liegen, sonst ist "langsam = sicher" falsch`,
  )
  check('damage.maxPerHit', cfg.damage.maxPerHit > 0 && cfg.damage.maxPerHit <= 100, 'Trefferdeckel in (0,100]')
  check('damage.scalePerEcho', cfg.damage.scalePerEcho > 0, 'Schadensskala muss positiv sein')
  check('damage.cooldownSteps', cfg.damage.cooldownSteps >= 0, 'Cooldown darf nicht negativ sein')

  check('carry.max', cfg.carry.max >= 1, 'Man muss mindestens ein Echo tragen koennen')
  check(
    'pickup.radius',
    cfg.pickup.radius >= cfg.player.radius + ECHO_RADIUS,
    `Aufnahmeradius (${cfg.pickup.radius}) muss Spieler- + Echoradius (${cfg.player.radius + ECHO_RADIUS}) abdecken`,
  )
  check('drop.backOffset', cfg.drop.backOffset > cfg.player.radius, 'Ablegepunkt muss hinter dem Spieler liegen')
  check(
    'drop.integrityPenalty',
    cfg.drop.integrityPenalty >= 0 && cfg.drop.integrityPenalty <= 100,
    'Ablegeabzug in [0,100]',
  )

  check('backpack', cfg.backpack.cols > 0 && cfg.backpack.rows > 0, 'Das Raster braucht Zellen')
  check('scoring.comboMinSize', cfg.scoring.comboMinSize >= 2, 'Ein Combo braucht mindestens 2 Mitglieder')
  check(
    'scoring.comboPerMember',
    cfg.scoring.comboPerMember > 0 && cfg.scoring.comboPerMember < 1,
    'Bonus pro Mitglied in (0,1)',
  )

  check(
    'fog.endRadius',
    cfg.fog.endRadius > 0 && cfg.fog.endRadius < cfg.fog.startRadius,
    'Der Nebel muss sich zusammenziehen (end < start)',
  )
  check('fog.damagePerSecond', cfg.fog.damagePerSecond >= 0, 'Nebel-Schaden darf nicht negativ sein')

  check('world.wallCount', cfg.world.wallCount >= 0, 'Wandzahl darf nicht negativ sein')
  check(
    'world.echoCount',
    cfg.world.echoCount >= 1 && cfg.world.echoCount <= ECHO_DEFS.length,
    `Echo-Zahl muss in [1,${ECHO_DEFS.length}] liegen`,
  )
  check('world.maxSaltAttempts', cfg.world.maxSaltAttempts >= 1, 'Der Generator braucht mindestens einen Versuch')

  // DESIGN-INVARIANTE: die fuenf groessten Formen passen nicht ins Raster.
  const shapeIds = Object.keys(SHAPES) as ShapeId[]
  const counts = shapeIds.map(shapeCellCount).sort((a, b) => b - a)
  const topFive = counts.slice(0, 5).reduce((a, b) => a + b, 0)
  const area = cfg.backpack.cols * cfg.backpack.rows
  check(
    'backpack.capacity',
    topFive > area,
    `Die fuenf groessten Formen (${topFive} Zellen) muessen das Raster (${area}) sprengen, sonst gibt es keine Packentscheidung`,
  )

  // Combo muss ueberhaupt erreichbar sein: eine Familie mit >= comboMinSize Mitgliedern.
  const comboReachable = FAMILIES.some(
    (family) => ECHO_DEFS.filter((e) => e.family === family).length >= cfg.scoring.comboMinSize,
  )
  check('scoring.reachable', comboReachable, 'Mindestens eine Farbfamilie muss einen Combo bilden koennen')

  return violations
}
