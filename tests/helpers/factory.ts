/** Testfabrik: baut echte Echo-Objekte aus den echten Definitionen. Keine Mock-Daten. */

import { CONFIG } from '../../src/core/config.ts'
import { ECHO_DEFS } from '../../src/core/echoes.ts'
import { PORTAL } from '../../src/core/world.ts'
import type { AABB, Echo, Family, ShapeId, World } from '../../src/core/types.ts'

export interface EchoOverride {
  family?: Family
  shape?: ShapeId
  baseValue?: number
  fragility?: number
  integrity?: number
  x?: number
  y?: number
}

/** Baut ein Echo aus ECHO_DEFS[id] mit optionalen Overrides. */
export function makeEcho(id: number, override: EchoOverride = {}): Echo {
  const def = ECHO_DEFS[id]
  if (!def) throw new Error(`Unbekannte Echo-Definition: ${id}`)
  return {
    ...def,
    family: override.family ?? def.family,
    shape: override.shape ?? def.shape,
    baseValue: override.baseValue ?? def.baseValue,
    fragility: override.fragility ?? def.fragility,
    x: override.x ?? 0,
    y: override.y ?? 0,
    integrity: override.integrity ?? 100,
    phase: 0,
    state: 'ground',
  }
}

/** Einfaches Ein-Zellen-Echo — fuer Nachbarschaftstests ohne Formfrust. */
export function dotEcho(id: number, family: Family, baseValue: number): Echo {
  return makeEcho(id, { shape: 'dot', family, baseValue })
}

/** Rand-Arena mit optionalen Zusatzwaenden. Geometrie exakt wie world.ts. */
export function testWorld(echoes: Echo[] = [], extraWalls: AABB[] = []): World {
  const W = CONFIG.arena.width
  const H = CONFIG.arena.height
  const BORDER = CONFIG.player.radius + CONFIG.player.wallInset
  const border: AABB[] = [
    { x: 0, y: 0, w: W, h: BORDER },
    { x: 0, y: H - BORDER, w: W, h: BORDER },
    { x: 0, y: 0, w: BORDER, h: H },
    { x: W - BORDER, y: 0, w: BORDER, h: H },
  ]
  return {
    seed: 'test',
    salt: 0,
    walls: [...border, ...extraWalls],
    echoes,
    portal: { ...PORTAL },
    spawn: { x: W / 2, y: H / 2 + 110 },
  }
}

/** Steckt ein echtes Echo in die Hand — fuer gezielte Schadenstests. */
export function carryEcho(state: { carry: Echo[]; player: { x: number; y: number } }, id: number): Echo {
  const echo = makeEcho(id, { x: state.player.x, y: state.player.y })
  echo.state = 'carried'
  state.carry.push(echo)
  return echo
}
