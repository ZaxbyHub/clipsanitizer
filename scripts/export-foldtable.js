// scripts/export-foldtable.js
// Issue #357 gate: emit the complete fold table (what character maps to what)
// as docs/fold-table.json — the artifact the clinician reviews and signs off.
// Sources: CHARMAP (named substitutions), TRANSLITERATION_FALLBACK + GREEK
// (transliterations), and the strip classes (what is removed, not mapped).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHARMAP } from '../src/sanitizer/charmap.js'
import { GREEK_TRANSLIT } from '../src/sanitizer/greek.js'
import { TRANSLITERATION_FALLBACK } from '../src/sanitizer/sanitizer.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const fold = {
  generated: new Date().toISOString().slice(0, 10),
  substitutions: Object.fromEntries(CHARMAP.map(([from, to]) => [from, to])),
  transliterations: Object.fromEntries(
    [...TRANSLITERATION_FALLBACK, ...GREEK_TRANSLIT].map(([from, to]) => [from, to]),
  ),
  removals: {
    description:
      'Characters NOT in the tables above that are removed: NFKD combining marks, Unicode whitespace variants (mapped to space), C0/C1 control chars (kept: tab/newline/CR), and any remaining non-printable-ASCII character. Unmapped removals surface as warnings at run time.',
    combining_marks: 'stripped after NFKD decomposition',
    unicode_whitespace: 'mapped to regular space',
    c0_c1_controls: 'removed (tab/newline/CR kept)',
    remaining_non_ascii: 'removed with an unmapped-chars warning',
  },
}

const outDir = path.join(root, 'docs')
fs.mkdirSync(outDir, { recursive: true })
const out = path.join(outDir, 'fold-table.json')
fs.writeFileSync(out, JSON.stringify(fold, null, 2) + '\n', 'utf-8')
console.log(`wrote ${out} (${Object.keys(fold.substitutions).length} substitutions, ${Object.keys(fold.transliterations).length} transliterations)`)
