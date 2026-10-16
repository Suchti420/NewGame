import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Der Pure-Core verspricht: gleicher Seed -> gleiche Karte, auf jedem Geraet.
 * Das gilt nur, wenn die Mathematik IEEE-genau ist. `Math.sqrt`, `+`, `-`, `*`
 * sind es; `Math.hypot/pow/exp/log` und der `**`-Operator sind es NICHT
 * (implementierungsabhaengig, koennen sich in der letzten ULP unterscheiden).
 *
 * Dieses Gate prueft den Quelltext statisch, damit so ein Aufruf nicht
 * versehentlich wieder einzieht.
 */

const coreDir = fileURLToPath(new URL('../src/core/', import.meta.url))

const FORBIDDEN: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: 'Math.hypot', re: /Math\.hypot\s*\(/ },
  { name: 'Math.pow', re: /Math\.pow\s*\(/ },
  { name: 'Exponent-Operator', re: /[A-Za-z0-9_)\]]\s*\*\*\s*[A-Za-z0-9_(]/ },
  { name: 'Math.exp/log/cbrt', re: /Math\.(exp|log|cbrt|log2|log10)\s*\(/ },
]

test('Pure-Core nutzt ausschliesslich IEEE-genaue Mathematik', () => {
  const files = readdirSync(coreDir).filter((f) => f.endsWith('.ts'))
  assert.ok(files.length > 0, 'keine Core-Dateien gefunden')

  const violations: string[] = []
  for (const file of files) {
    const lines = readFileSync(path.join(coreDir, file), 'utf8').split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] as string
      for (const { name, re } of FORBIDDEN) {
        if (re.test(line)) violations.push(`${file}:${i + 1} -> ${name}`)
      }
    }
  }

  assert.deepEqual(violations, [], `Engine-abhaengige Mathematik im Pure-Core:\n${violations.join('\n')}`)
})
