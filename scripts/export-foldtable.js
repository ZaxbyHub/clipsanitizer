// scripts/export-foldtable.js
// Issue #357 gate: emit the complete fold record as docs/fold-table.json —
// the artifact the clinician reviews and signs off. Structure (critic round 1):
// an ORDERED stage list with precedence, so it is unambiguous which rule wins;
// the fraction-adjacency guard and the NFKD compatibility-folding semantics
// are recorded; entries that cannot fire in practice are annotated, not
// silently listed as live.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHARMAP } from '../src/sanitizer/charmap.js'
import { GREEK_TRANSLIT } from '../src/sanitizer/greek.js'
import { TRANSLITERATION_FALLBACK } from '../src/sanitizer/sanitizer.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

// Annotate GREEK_TRANSLIT entries that cannot fire in the shipped pipeline:
// the tonos/dialytika precomposed vowels decompose at NFKD into their base
// letters + a combining mark BEFORE the Greek stage, so the BASE letter's
// entry is what fires. Kept in the table as documentation + safety net
// (e.g. if NFKD were ever disabled), annotated here for the reviewer.
const DECOMPOSED_BEFORE_GREEK = new Set([
  'ά', 'έ', 'ή', 'ί', 'ό', 'ύ', 'ώ', 'ϊ', 'ϋ', 'ΐ', 'ΰ',
  'Ά', 'Έ', 'Ή', 'Ί', 'Ό', 'Ύ', 'Ώ',
])
const greekAnnotated = GREEK_TRANSLIT.map(([from, to]) => ({
  from,
  to,
  note: DECOMPOSED_BEFORE_GREEK.has(from)
    ? 'decomposed at NFKD before this stage; the base-letter entry applies (this entry is a safety net)'
    : null,
}))

// mu is deliberately absent from GREEK_TRANSLIT; CHARMAP owns it, and the
// post-NFKD micro pass re-applies CHARMAP's rules for NFKD-produced mu
// sequences (compatibility characters like U+338D SQUARE MU G).
const microSubstitutions = Object.fromEntries(
  CHARMAP.filter(([from]) => from.includes('μ')).map(([from, to]) => [from, to]),
)

const fold = {
  generated: new Date().toISOString().slice(0, 10),
  stageOrder: [
    '0. fraction adjacency guard: a digit directly followed by a fraction character gets a space inserted (87½ -> 87 1/2) so the fraction conversion cannot read as a decimal',
    '1. named substitutions (substitutions below; clinical micro multi-char rules first)',
    '2a. transliteration fallback (fallbackTransliterations below; Latin letters that do not decompose under NFKD)',
    '2b. NFKD decomposition: combining marks stripped; COMPATIBILITY characters fold (U+338D -> mu+g, circled digits -> digit, fullwidth -> ASCII) - this CHANGES content, it is not just mark-stripping',
    '2c. post-NFKD micro re-application: the clinical micro rules (microSubstitutions below) run AGAIN over NFKD-produced mu sequences, so U+338D reads mcg - never mg (critic round-1 BLOCKER fix)',
    '2d. Greek transliteration (greekTransliterations below; mu excluded - see the note)',
    '3. Unicode whitespace variants -> regular space',
    '4. C0/C1 control characters removed (tab/newline/CR kept)',
    '5. CRLF -> LF',
    '6. final strip: anything still outside printable ASCII is REMOVED and surfaces as an unmapped-chars warning',
  ],
  substitutions: Object.fromEntries(CHARMAP.map(([from, to]) => [from, to])),
  microSubstitutions,
  fallbackTransliterations: Object.fromEntries(
    TRANSLITERATION_FALLBACK.map(([from, to]) => [from, to]),
  ),
  greekTransliterations: Object.fromEntries(
    GREEK_TRANSLIT.map(([from, to]) => [from, to]),
  ),
  greekNotes: greekAnnotated.filter(g => g.note),
  knownOpenQuestion: {
    item: 'standalone mu inside Greek WORDS',
    behavior:
      'CHARMAP maps standalone mu to "u" (the clinical micro convention), so a Greek word containing mu reads with u where the Greek m sound is. For dose text this is the SAFE direction; for Greek prose it is a documented approximation.',
    decision:
      'CLINICIAN REVIEW at sign-off (trainingapp #357 AC2): keep, or add a context rule',
  },
  removals: {
    description:
      'Characters NOT in the tables above that are removed: NFKD combining marks, C0/C1 control chars (kept: tab/newline/CR), and any remaining non-printable-ASCII character. Unmapped removals surface as warnings at run time.',
    combining_marks: 'stripped after NFKD decomposition',
    c0_c1_controls: 'removed (tab/newline/CR kept)',
    remaining_non_ascii: 'removed with an unmapped-chars warning',
  },
}

const outDir = path.join(root, 'docs')
fs.mkdirSync(outDir, { recursive: true })
const out = path.join(outDir, 'fold-table.json')
fs.writeFileSync(out, JSON.stringify(fold, null, 2) + '\n', 'utf-8')
console.log(
  `wrote ${out} (${Object.keys(fold.substitutions).length} substitutions, ` +
    `${Object.keys(fold.fallbackTransliterations).length} fallback + ` +
    `${Object.keys(fold.greekTransliterations).length} greek transliterations, ` +
    `${greekAnnotated.filter(g => g.note).length} annotated)`,
)
