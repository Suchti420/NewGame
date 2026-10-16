/**
 * Simulationsuhr: Fixed-Timestep-Akkumulator.
 *
 * Repariert den Fatalfehler der alten Version: dort wurde `dt` berechnet
 * und nie benutzt, wodurch 144 Hz exakt 4,8x so schnell lief wie 30 Hz.
 *
 * Hier ist die Simulationsrate eine Konstante (STEP_US). Die Bildrate
 * liefert nur noch Mikrosekunden; der Akkumulator entscheidet, wie viele
 * feste Schritte daraus folgen. Nach jeder vollen Runde gilt:
 *   Gesamtschritte == floor(gesamte_Mikrosekunden / STEP_US)
 * unabhaengig davon, wie die Zeit in Frames aufgeteilt war.
 *
 * Die Spiral-of-Death-Klammer verwirft bei einem Lag den Ueberhang,
 * statt ihn in immer mehr Schritte zu verwandeln.
 */

import { MAX_STEPS_PER_FRAME, STEP_US } from './config.ts'

export interface Clock {
  /** Ungenutzte Restzeit in Mikrosekunden. */
  accumulatorUs: number
  /** Insgesamt ausgefuehrte Schritte — fuer deterministische Abrechnung. */
  steps: number
}

export function createClock(): Clock {
  return { accumulatorUs: 0, steps: 0 }
}

export function resetClock(clock: Clock): void {
  clock.accumulatorUs = 0
  clock.steps = 0
}

/**
 * Verrechnet eine Frame-Dauer und liefert die Anzahl auszufuehrender
 * Simulationsschritte. frameUs muss >= 0 sein.
 */
export function advance(clock: Clock, frameUs: number, maxSteps: number = MAX_STEPS_PER_FRAME): number {
  const frame = frameUs > 0 ? frameUs : 0
  clock.accumulatorUs += frame

  let steps = Math.floor(clock.accumulatorUs / STEP_US)
  if (steps > maxSteps) {
    // Lag: Ueberhang verwerfen statt nachholen.
    steps = maxSteps
    clock.accumulatorUs = 0
  } else {
    clock.accumulatorUs -= steps * STEP_US
  }

  clock.steps += steps
  return steps
}

/** Nur fuer Tests/Debug: aktuelle Interpolation zwischen zwei Schritten (0..1). */
export function interpolationAlpha(clock: Clock): number {
  return clock.accumulatorUs / STEP_US
}
