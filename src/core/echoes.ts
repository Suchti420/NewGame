/**
 * Die acht Echos. Farben sind in drei Familien gruppiert — das ist die
 * Grundlage des Rucksack-Combos.
 *
 * Wichtig: In der alten Version waren alle Farben eindeutig, wodurch
 * "gleiche Farbe nebeneinander" unerfuellbar war. Jetzt teilen sich
 * mehrere Echos eine Familie, Combo ist also tatsaechlich erreichbar.
 */

import type { EchoDef } from './types.ts'

export const ECHO_DEFS: readonly EchoDef[] = [
  { id: 0, name: 'Kinderlachen', color: '#ffd166', family: 'warm', shape: 'O', baseValue: 120, fragility: 1.0 },
  { id: 1, name: 'Ofenwärme', color: '#fb923c', family: 'warm', shape: 'T', baseValue: 110, fragility: 0.9 },
  { id: 2, name: 'Sommerfest', color: '#f472b6', family: 'warm', shape: 'S', baseValue: 140, fragility: 1.2 },

  { id: 3, name: 'Regengeruch', color: '#6ff7d6', family: 'cool', shape: 'I', baseValue: 90, fragility: 0.8 },
  { id: 4, name: 'Handschrift', color: '#93c5fd', family: 'cool', shape: 'dot', baseValue: 60, fragility: 0.5 },
  { id: 5, name: 'Bahnhofs-Abschied', color: '#a78bfa', family: 'cool', shape: 'L', baseValue: 150, fragility: 1.3 },

  { id: 6, name: 'Gute Nacht', color: '#4ade80', family: 'nature', shape: 'P', baseValue: 170, fragility: 1.5 },
  { id: 7, name: 'Waldlicht', color: '#facc15', family: 'nature', shape: 'O', baseValue: 100, fragility: 1.0 },
] as const

export const FAMILY_LABEL: Record<string, string> = {
  warm: 'Wärme',
  cool: 'Kühle',
  nature: 'Natur',
}

export const FAMILY_COLOR: Record<string, string> = {
  warm: '#fb7185',
  cool: '#38bdf8',
  nature: '#4ade80',
}
