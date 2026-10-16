/**
 * Geometrie: Kreis-vs-Rechteck, Push-Out, Normalisierung, Sichtlinie.
 * Alles rein rechnerisch, ohne Seiteneffekte.
 */

import type { AABB, Vec } from './types.ts'

export const TAU = Math.PI * 2

/**
 * Kontakt-Epsilon beim Herauschieben. Ohne diesen Wert bleibt ein Koerper
 * nach dem Push rechnerisch exakt auf der Kante kleben (Fliesskomma) und
 * wuerde jeden Frame erneut als Aufprall gezaehlt. 1e-6 px ist unsichtbar.
 */
export const CONTACT_EPSILON = 1e-6

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

export function length(x: number, y: number): number {
  return Math.sqrt(x * x + y * y)
}

/**
 * Normalisiert einen Vektor. Liefert immer einen Einheitsvektor
 * (oder {0,0} bei Nullvektor) — verhindert den 1,41x-Diagonalbug.
 */
export function normalizeVector(v: Vec): Vec {
  const len = length(v.x, v.y)
  if (len === 0) return { x: 0, y: 0 }
  return { x: v.x / len, y: v.y / len }
}

/** Liefert den naechsten Punkt auf einem Rechteck zum Kreismittelpunkt. */
export function closestPointOnRect(cx: number, cy: number, r: AABB): Vec {
  return {
    x: clamp(cx, r.x, r.x + r.w),
    y: clamp(cy, r.y, r.y + r.h),
  }
}

/** Ueberlappt der Kreis das Rechteck? */
export function circleRectOverlap(cx: number, cy: number, radius: number, r: AABB): boolean {
  const p = closestPointOnRect(cx, cy, r)
  const dx = cx - p.x
  const dy = cy - p.y
  return dx * dx + dy * dy < radius * radius
}

/**
 * Schiebt einen Kreis aus einem Rechteck heraus.
 * Liefert die korrigierte Position und ob ueberhaupt korrigiert wurde.
 *
 * Das ist der Push-Out, der in der alten Version fehlte: dort wurde nur
 * geprueft, nie aufgeloest, wodurch der Spieler dauerhaft feststecken konnte.
 */
export function pushOutOfRect(
  cx: number,
  cy: number,
  radius: number,
  r: AABB,
): { x: number; y: number; pushed: boolean } {
  const p = closestPointOnRect(cx, cy, r)
  let dx = cx - p.x
  let dy = cy - p.y
  const distSq = dx * dx + dy * dy

  if (distSq >= radius * radius) return { x: cx, y: cy, pushed: false }

  if (distSq > 1e-9) {
    const dist = Math.sqrt(distSq)
    const push = radius - dist + CONTACT_EPSILON
    return { x: cx + (dx / dist) * push, y: cy + (dy / dist) * push, pushed: true }
  }

  // Mittelpunkt liegt exakt im Rechteck: entlang der kleinsten Ueberlappung schieben.
  const toLeft = cx - r.x
  const toRight = r.x + r.w - cx
  const toTop = cy - r.y
  const toBottom = r.y + r.h - cy
  const min = Math.min(toLeft, toRight, toTop, toBottom)

  dx = 0
  dy = 0
  if (min === toLeft) dx = -(toLeft + radius + CONTACT_EPSILON)
  else if (min === toRight) dx = toRight + radius + CONTACT_EPSILON
  else if (min === toTop) dy = -(toTop + radius + CONTACT_EPSILON)
  else dy = toBottom + radius + CONTACT_EPSILON

  return { x: cx + dx, y: cy + dy, pushed: true }
}

/**
 * Sichtlinie zwischen zwei Punkten, die Waende beruecksichtigt.
 * Getastet mit fester Schrittweite -> deterministisch und billig.
 * margin ist der Radius des Objekts, das "schauen" will.
 */
export function segmentClear(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  walls: readonly AABB[],
  margin: number,
): boolean {
  const dx = x1 - x0
  const dy = y1 - y0
  const dist = length(dx, dy)
  if (dist < 1e-6) return true

  const steps = Math.max(1, Math.ceil(dist / 4))
  const stepX = dx / steps
  const stepY = dy / steps

  for (let i = 1; i <= steps; i++) {
    const px = x0 + stepX * i
    const py = y0 + stepY * i
    for (let w = 0; w < walls.length; w++) {
      const wall = walls[w]
      if (wall && circleRectOverlap(px, py, margin, wall)) return false
    }
  }
  return true
}

/** Kuerzeste Distanz eines Punktes zu einem Rechteck (0 wenn innen). */
export function distanceToRect(cx: number, cy: number, r: AABB): number {
  const p = closestPointOnRect(cx, cy, r)
  return length(cx - p.x, cy - p.y)
}

export function distance(ax: number, ay: number, bx: number, by: number): number {
  return length(ax - bx, ay - by)
}
