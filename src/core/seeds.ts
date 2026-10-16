/**
 * Seeds: Tages-Seed und Nutzereingabe.
 *
 * Repariert den UTC-Bug der alten Version: `toISOString()` liess den Seed
 * zwischen 22:00 und 00:00 lokal bereits umspringen. Hier wird durchgehend
 * das LOKALE Kalenderdatum verwendet, damit "der Tag" dem Tag des Spielers
 * entspricht.
 *
 * Kein Zufall: der Seed ist eine reine Funktion von Datum + Versionssalt.
 */

import { SEED_VERSION } from './config.ts'

/** Maximal erlaubte Laenge eines Nutzer-Seeds. */
export const MAX_SEED_LENGTH = 40

/** Lokaler Schluessel im Format YYYY-MM-DD (nicht UTC). */
export function dateKey(date: Date): string {
  const y = String(date.getFullYear()).padStart(4, '0')
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Reiner Tages-Seed: gleicher Tag -> gleicher Seed, inkl. Versionssalt. */
export function seedForDate(date: Date): string {
  return `${SEED_VERSION}-${dateKey(date)}`
}

/** Erlaubtes Zeichenvorrat fuer Nutzer-Seeds. */
const SEED_PATTERN = /^[a-z0-9-]+$/

export function isValidSeed(seed: string): boolean {
  return seed.length > 0 && seed.length <= MAX_SEED_LENGTH && SEED_PATTERN.test(seed)
}

/**
 * Normalisiert eine Nutzereingabe: trimmt, kleinschreibt, ersetzt alles
 * Nicht-Erlaubte durch '-' und kuerzt auf MAX_SEED_LENGTH.
 * Liefert null, wenn danach nichts Verwertbares uebrig bleibt.
 */
export function parseSeedInput(raw: string): string | null {
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SEED_LENGTH)
    .replace(/-+$/g, '')

  if (normalized.length === 0) return null
  return isValidSeed(normalized) ? normalized : null
}

/** Override, falls gueltig; sonst der Tages-Seed. */
export function pickSeed(date: Date, override?: string | null): string {
  if (override) {
    const parsed = parseSeedInput(override)
    if (parsed) return parsed
  }
  return seedForDate(date)
}
