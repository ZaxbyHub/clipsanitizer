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
import { TRANSLITERATION_FALLBACK } from '../src/sanitizer/sanitizer.js'

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

  test('micro compatibility characters read as micro, never milli (critic round-2 BLOCKER)', () => {
    // U+338D/U+3395/U+339B decompose at NFKD into mu sequences AFTER CHARMAP;
    // the post-NFKD micro pass maps them to the clinical reading. Mutation
    // bite-proof: deleting the post-NFKD micro pass fails these legs.
    const cases = [['50㎍', '50mcg'], ['5㎕', '5ul'], ['10㎛', '10um']]
    for (const [input, expected] of cases) {
      const r = sanitize(input)
      expect(r.text).toBe(expected)
      expect(r.warnings).toEqual([])
      expect(r.text).not.toMatch(/mg|ml|mm/) // the 1000x misread class
    }
  })

  test('gamma/lambda directly after a digit drop WITH a warning (unit-letter class)', () => {
    // '50gamma' is clinical shorthand for micrograms; mapping gamma->g next
    // to a digit silently turned a 10^6x misread into confident text. The
    // digit-adjacent letter is left to the final strip: dropped, warned.
    const g = sanitize('50γ IV')
    expect(g.text).toBe('50 IV')
    expect(g.warnings.length).toBe(1)
    expect(g.warnings[0].chars).toContain('γ')
    const l = sanitize('5λ')
    expect(l.text).toBe('5')
    expect(l.warnings.length).toBe(1)
    // prose gamma/lambda (not after a digit) still transliterate
    expect(sanitize('λόγος').text).toBe('logos')
    expect(sanitize('γαμβ').text).toBe('gauv')
  })

  test('STRUCTURAL: gamma/lambda map ONLY inside a Greek word (round-5)', () => {
    // Unit positions, separators, headers - every non-word occurrence drops
    // WITH a warning; only Greek-word neighbors map. This ends the
    // per-variant whack-a-mole (critic round-4 structural fix).
    const unitCases = [
      ['γ/kg/min 3', '/kg/min 3'],
      ['Dose (γ)', 'Dose ()'],
      ['3-γ', '3-'],
      ['3, γ', '3, '],
      ['γ-GTP', '-GTP'],
    ]
    for (const [input, expected] of unitCases) {
      const r = sanitize(input)
      expect(r.text).toBe(expected) // gamma dropped, never mapped to g
      expect(r.text).not.toContain('γ')
      expect(r.warnings.length).toBe(1)
    }
    // word contexts still transliterate
    expect(sanitize('λόγος').text).toBe('logos')
    expect(sanitize('γαμβ').text).toBe('gauv')
  })

  test('a SPACE between the digit and gamma/lambda still drops WITH a warning (round-4)', () => {
    // 'Dopamine 3 gamma' is at least as common as '3gamma'; the whitespace
    // stage runs AFTER the Greek stage, so raw Unicode spaces still count.
    const cases = ['3γ', '3 γ', '5 λ']
    for (const input of cases) {
      const r = sanitize(input + ' IV')
      expect(r.text).not.toContain('g IV')
      expect(r.text).not.toContain('l IV')
      expect(r.warnings.length).toBe(1)
    }
  })

  test('polytonic precomposed forms survive (NFKD decomposes them BEFORE the Greek table runs)', () => {
    // 'ᾶ' (U+1FB6) decomposes at NFKD to α + combining perispomeni; the Greek
    // table runs AFTER that strip, so the base α maps. Before the ordering
    // fix these forms were still dropped — this leg is the ordering pin.
    const r = sanitize('ᾶβα') // ᾶβα
    expect(r.text).toBe('ava')  // beta maps v (modern convention; the fold table documents it)
    expect(r.warnings).toEqual([])
  })

  test('a breathing-form word survives (ἀγγελία -> aggelia)', () => {
    const r = sanitize('ἀγγελία') // ἀγγελία
    expect(r.text).toBe('aggelia')
    expect(r.warnings).toEqual([])
  })

  test('the change summary reports the Greek category with real counts', () => {
    const r = sanitize('ΔΔΔ')
    const greek = r.changes.find(c => c.category === 'greek_translit')
    expect(greek).toBeDefined()
    expect(greek.count).toBe(3)
  })

  test('fold-table.json stays in sync with the live tables and records the stages', () => {
    // Committed artifact: missing = someone deleted it -> hard fail, not skip
    // (critic round 1: the fold table is the clinician-review contract).
    const ftPath = path.resolve(__dirname, '..', 'docs', 'fold-table.json')
    expect(fs.existsSync(ftPath)).toBe(true)
    const ft = JSON.parse(fs.readFileSync(ftPath, 'utf-8'))
    for (const [from, to] of CHARMAP) {
      expect(ft.substitutions[from]).toBe(to)
    }
    for (const [from, to] of GREEK_TRANSLIT) {
      expect(ft.greekTransliterations[from]).toBe(to)
    }
    for (const [from, to] of TRANSLITERATION_FALLBACK) {
      expect(ft.fallbackTransliterations[from]).toBe(to)
    }
    // mu ownership: CHARMAP substitutions carry it; the Greek table must not.
    expect(ft.substitutions['μ']).toBe('u')
    expect(ft.greekTransliterations['μ']).toBeUndefined()
    expect(ft.microSubstitutions['μg']).toBe('mcg')
    // stage order + the fraction guard + NFKD semantics are recorded
    expect(Array.isArray(ft.stageOrder)).toBe(true)
    expect(ft.stageOrder.join(' ')).toContain('fraction adjacency guard')
    expect(ft.stageOrder.join(' ')).toContain('COMPATIBILITY characters fold')
    const qItems = ft.knownOpenQuestion.items.map(i => i.item)
    expect(qItems.some(i => i.includes('mu'))).toBe(true)
    expect(qItems.some(i => i.includes('gamma/lambda'))).toBe(true)
  })
})

// ── Gate 2: chunk-split defect is a drift tripwire ───────────────────────────
describe('gate 2: no chunker exists (clinician gate tripwire)', () => {
  test('BEHAVIORAL: 10k characters survive sanitize with no truncation', () => {
    // Primary re-arming leg for the chunk-split defect: if ANY chunker or
    // truncation is introduced on the sanitize path, length diverges here.
    // (The copy-side half of this leg lives in issue-357-copy.test.js.)
    const long = 'Patient takes medication daily. '.repeat(320) // ~10k chars
    const { text } = sanitize(long)
    expect(text.length).toBe(long.length)
  })

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
