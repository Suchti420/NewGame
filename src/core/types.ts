/** Gemeinsame Datentypen des Pure-Core. Kein DOM, kein Canvas. */

export interface Vec {
  x: number
  y: number
}

export interface AABB {
  x: number
  y: number
  w: number
  h: number
}

/** Farbfamilie — Grundlage des Rucksack-Combos. */
export type Family = 'warm' | 'cool' | 'nature'

/** Formkennung. Die konkreten Zellen stehen in shapes.ts. */
export type ShapeId = 'O' | 'I' | 'L' | 'T' | 'S' | 'dot' | 'P'

/** Zellen sind [dx, dy] relativ zum Ankerpunkt, normalisiert auf >= 0. */
export type Cell = readonly [number, number]

export interface Shape {
  id: ShapeId
  cells: readonly Cell[]
}

export interface EchoDef {
  id: number
  name: string
  color: string
  family: Family
  shape: ShapeId
  /** Grundwert in Punkten. */
  baseValue: number
  /** Zerbrechlichkeitsfaktor: multipliziert den Schaden. */
  fragility: number
}

export type EchoState = 'ground' | 'carried' | 'packed' | 'extracted'

export interface Echo extends EchoDef {
  x: number
  y: number
  /** 0..100 */
  integrity: number
  /** Rein kosmetische Phase fuers Schweben. */
  phase: number
  state: EchoState
}

export interface Portal {
  x: number
  y: number
  r: number
}

export interface World {
  /** Vollstaendiger Seed inkl. Versionssalt und Salt-Bump. */
  seed: string
  /** Wie oft der Generator den Salt erhoehen musste. */
  salt: number
  walls: AABB[]
  echoes: Echo[]
  portal: Portal
  spawn: Vec
}

/**
 * Zustandsmaschine. Ersetzt die drei unabhaengigen Booleans der
 * alten Version, die illegale Kombinationen erlaubten.
 */
export type RunPhase = 'intro' | 'play' | 'paused' | 'pack' | 'over'

/** Alles, was eine Aktion ueber den Zustand wissen muss. */
export interface ActionContext {
  phase: RunPhase
  atPortal: boolean
}

/** Eingabe fuer einen einzelnen Simulationsschritt. */
export interface StepInput {
  /** Bewegungsrichtung, unnormalisiert. Wird im Core normalisiert. */
  move: Vec
  sprint: boolean
  /** Flankengesteuert: nur im Schritt des Tastendrucks true. */
  interact: boolean
  /** Flankengesteuert. */
  drop: boolean
}

export interface RunState {
  phase: RunPhase
  /**
   * Läuft die Simulationsuhr gerade?
   * play und pack -> true (Packen kostet Zeit), sonst false.
   */
  simulating: boolean
  world: World
  player: {
    x: number
    y: number
    /** Echte Geschwindigkeit in px/s, aus der letzten Integration. */
    vx: number
    vy: number
    facing: number
  }
  carry: Echo[]
  /** Verbleibende Simulationsschritte des Tages. */
  stepsLeft: number
  /** Schritte seit Tagesbeginn (fuer Nebelkurve und Cooldowns). */
  stepCount: number
  /** Schritte, die das Traegen eines Echos noch unverwundbar ist. */
  damageCooldown: number
  score: number
  extracted: number
  /** Anzahl ausgeloester Vergehen — nur fuer Statistik/HUD. */
  bumps: number
  lastEvent: RunEvent | null
}

export type RunEvent =
  | { kind: 'pickup'; name: string }
  | { kind: 'drop'; name: string; integrity: number }
  | { kind: 'bump'; damage: number }
  | { kind: 'fog'; damage: number }
  | { kind: 'packed'; name: string }
  | { kind: 'unpacked'; name: string }
  | { kind: 'extracted'; score: number; base: number; combo: number }
  | { kind: 'dayEnd' }
  | { kind: 'carryFull' }
  | { kind: 'notAtPortal' }
  | { kind: 'broke'; name: string }

/** Rucksack-Raster. null = leer. */
export type BackpackGrid = (Echo | null)[]

export interface BackpackScore {
  base: number
  combo: number
  total: number
  /** Groesse der groessten Familie-Region — fuer UI-Feedback. */
  largestCluster: number
}
