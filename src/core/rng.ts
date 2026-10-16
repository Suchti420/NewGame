/**
 * Deterministischer Zufallsgenerator.
 *
 * xmur3 (String -> Seed) + mulberry32 (Seed -> float in [0,1)).
 * Beide sind kanonisch implementiert und rein integer-basiert.
 *
 * Regeln:
 *  - Im gesamten Spiel darf Math.random() NICHT vorkommen.
 *  - Pro Runde existiert genau EINE Instanz. Die Aufrufreihenfolge
 *    muss deterministisch bleiben, sonst bricht die Reproduzierbarkeit.
 */

export type Rng = () => number

/** Wandelt einen String in eine 32-Bit-Seed-Funktion. */
export function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return h >>> 0
  }
}

/** Erzeugt aus einer 32-Bit-Zahl einen schnellen, deterministischen PRNG. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Erzeugt eine RNG-Instanz aus einem String-Seed. */
export function makeRng(seed: string): Rng {
  const hashed = xmur3(seed)
  return mulberry32(hashed())
}

/** Ganzzahl in [0, n). */
export function randInt(rng: Rng, n: number): number {
  return Math.floor(rng() * n) % n
}

/** Fliesskommazahl in [min, max). */
export function randRange(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min)
}

/** Deterministisches Mischen (Fisher-Yates) — mutiert die Kopie. */
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const a = out[i] as T
    const b = out[j] as T
    out[i] = b
    out[j] = a
  }
  return out
}
