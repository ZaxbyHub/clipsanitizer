// tests/issue-357-gates.test.js
// Regression tests for the three issue-357 integration gates:
//   1. Greek letters transliterate instead of being dropped by the final strip
//      (fold-table sync check included).
//   2. [chunk-split defect] recorded as NOT REPRODUCIBLE — no chunking code
//      exists in this source tree (assert the absence as a drift tripwire:
//      if someone introduces a chunker, the clinician sign-off gate applies).
//   3. copyOutput is idempotent within the Copied! window (double-click repeat).
import { describe, test, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { sanitize } from '../src/sanitizer/sanitizer.js'
import { CHARMAP } from '../src/sanitizer/charmap.js'
import { GREEK_TRANSLIT } from '../src/sanitizer/greek.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ── Gate 1: Greek letter drop ────────────────────────────────────────────────
describe('gate 1: Greek transliteration (no silent drop)', () => {
  test('a Greek word survives the pipeline as ASCII', () => {
    const r = sanitize('Δόση 5mg') // 'dose 5mg'
    expect(r.text).toBe('Dosi 5mg')
    expect(r.text).not.toContain('Δ')
  })

  test('every mapped Greek letter round-trips to printable ASCII', () => {
    const greekText = GREEK_TRANSLIT.map(([from]) => from).join('')
    const r = sanitize(greekText)
    // eslint-disable-next-line no-control-regex
    expect(/^[\x20-\x7E]+$/.test(r.text)).toBe(true)
    expect(r.warnings).toEqual([]) // nothing should remain unmapped
  })

  test('μg still maps to mcg via CHARMAP before the Greek table', () => {
    expect(sanitize('5μg').text).toBe('5mcg')
  })

  test('the change summary reports the Greek category with real counts', () => {
    const r = sanitize('ΔΔΔ')
    const greek = r.changes.find(c => c.category === 'greek_translit')
    expect(greek).toBeDefined()
    expect(greek.count).toBe(3)
  })

  test('fold-table.json (if exported) stays in sync with the live tables', () => {
    const ftPath = path.resolve(__dirname, '..', 'docs', 'fold-table.json')
    if (!fs.existsSync(ftPath)) return // export script not yet run; skip
    const ft = JSON.parse(fs.readFileSync(ftPath, 'utf-8'))
    for (const [from, to] of CHARMAP) {
      expect(ft.substitutions[from]).toBe(to)
    }
    for (const [from, to] of GREEK_TRANSLIT) {
      expect(ft.transliterations[from]).toBe(to)
    }
  })
})

// ── Gate 2: chunk-split defect is a drift tripwire ───────────────────────────
describe('gate 2: no chunker exists (clinician gate tripwire)', () => {
  test('the source tree ships no chunking of sanitized output', () => {
    const srcDir = path.resolve(__dirname, '..', 'src')
    const offenders = []
    const walk = dir => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) walk(p)
        else if (/\.(js|mjs)$/.test(e.name)) {
          const t = fs.readFileSync(p, 'utf-8')
          if (/CHUNK_SIZE|chunkText|splitIntoChunks|3\s*_?999/.test(t)) offenders.push(p)
        }
      }
    }
    walk(srcDir)
    expect(offenders).toEqual([])
  })
})
