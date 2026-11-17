// src/sanitizer/sanitizer.js
import { CHARMAP } from './charmap.js'
import { GREEK_TRANSLIT } from './greek.js'

// Transliteration fallback (issue history): Latin letters that do NOT
// decompose under NFKD at all, mapped by hand. Module-level + exported so
// scripts/export-foldtable.js ships the SAME table (single source of truth;
// the sync test pins it). Keep in sync with the pipeline order: applied
// BEFORE NFKD.
export const TRANSLITERATION_FALLBACK = [
  ['ø', 'o'],   // ø -> o
  ['Ø', 'O'],   // Ø -> O
  ['ł', 'l'],   // ł -> l
  ['Ł', 'L'],   // Ł -> L
  ['ß', 'ss'],  // ß -> ss
  ['đ', 'd'],   // đ -> d
  ['Đ', 'D'],   // Đ -> D
  ['þ', 'th'],  // þ -> th
  ['Þ', 'Th'],  // Þ -> Th
  ['ð', 'd'],   // ð -> d
  ['Ð', 'D'],   // Ð -> D
]

/**
 * sanitize(input)
 *
 * Returns { text: string, changes: ChangeRecord[], warnings: Warning[] }
 *
 * ChangeRecord: { category: string, label: string, count: number }
 * Warning:      { type: string, count: number, chars: string[], message: string }
 *
 * Pipeline (order is mandatory):
 *  0. Fraction adjacency guard (digit + fraction char → insert space)
 *  1. Named substitutions from CHARMAP
 *  2. Fallback transliteration (non-NFKD-decomposable Latin)
 *  3. NFKD normalization + combining mark strip (COMPATIBILITY chars fold here)
 *  4. Post-NFKD micro re-application (CHARMAP's μg/μ rules over NFKD-produced μ)
 *  5. Greek transliteration (after the strip, so polytonic bases are caught)
 *  6. Unicode whitespace variants → regular space
 *  7. C0/C1 control char removal (keep \t \n \r)
 *  8. CRLF normalization → \n
 *  9. Final strip: remove anything outside printable ASCII (32-126) + \t\n\r
 */
export function sanitize(input) {
  if (typeof input !== 'string') return { text: '', changes: [], warnings: [] }
  if (input.length === 0) return { text: '', changes: [], warnings: [] }

  let text = input
  const changeCounts = new Map()

  // ── Step 0: Fraction adjacency guard ──────────────────────────────────────
  // When a fraction character directly follows a digit, insert a space to
  // prevent '87½' → '871/2'. Must run before CHARMAP replaces fraction chars.
  const FRACTION_CHARS_GUARD = [
    '\u00BD', '\u00BC', '\u00BE', '\u2153', '\u2154',
    '\u215B', '\u215C', '\u215D', '\u215E',
  ]
  for (const frac of FRACTION_CHARS_GUARD) {
    if (text.includes(frac)) {
      text = text.replace(new RegExp(`(\\d)${frac}`, 'g'), `$1 ${frac}`)
    }
  }

  // ── Step 1: Named substitutions ────────────────────────────────────────────
  for (const [from, to] of CHARMAP) {
    if (!text.includes(from)) continue
    const before = text
    text = text.split(from).join(to)
    if (text !== before) {
      const count = (before.split(from).length - 1)
      const key = `${from}→${to}`
      changeCounts.set(key, (changeCounts.get(key) ?? 0) + count)
    }
  }

  // ── Step 2: NFKD normalization + combining mark strip + fallback transliteration ──
  // Replaces the former NFKC-only step.
  // NFKD decomposes é → e + ́  (combining acute). Strip combining marks → e.
  // Fallback map handles chars that don't decompose under NFKD at all.
  // (TRANSLITERATION_FALLBACK is the exported module-level table above.)

  // Apply fallback BEFORE NFKD so these chars don't survive into the final strip
  const beforeTranslit = text
  for (const [from, to] of TRANSLITERATION_FALLBACK) {
    if (text.includes(from)) text = text.split(from).join(to)
  }

  // NFKD decomposition + combining mark removal (handles é, ñ, ü, â, etc.)
  // Use \p{Mn} (Mark, Nonspacing) — combining marks only — to avoid stripping
  // ASCII chars like ^ and ` which also have the Diacritic Unicode property.
  const beforeNFKD = text
  text = text.normalize('NFKD').replace(/\p{Mn}/gu, '')

  // Track whether any transliteration occurred
  if (text !== beforeNFKD || text !== beforeTranslit) {
    changeCounts.set('nfkd_normalize', 1)
  }

  // Post-NFKD micro re-application (critic BLOCKER fix, 2026-11-17): NFKD
  // decomposes compatibility characters (U+338D SQUARE MU G, U+3395 SQUARE MU L,
  // U+339B, U+339C, U+33B2, U+33B3...) into mu sequences AFTER CHARMAP has run.
  // Re-apply CHARMAP's clinical micro rules here (same order: ug first, then
  // standalone mu), so '50' + U+338D becomes '50mcg' — never '50mg'. Counted
  // under the substitutions category, where CHARMAP's own pass reports.
  const microRules = CHARMAP.filter(([from]) => from === 'μg' || from === 'μ')
  for (const [from, to] of microRules) {
    if (!text.includes(from)) continue
    const before = text
    text = text.split(from).join(to)
    if (text !== before) {
      const count = before.split(from).length - 1
      changeCounts.set(`micro:${from}→${to}`, (changeCounts.get(`micro:${from}→${to}`) ?? 0) + count)
    }
  }

  // Greek transliteration (issue #357 gate — the 'Greek letter drop' fix):
  // without this, every Greek letter outside CHARMAP's lone μ was silently
  // destroyed by the final ASCII strip ('Δόση 5mg' → '5mg'). Runs AFTER the
  // NFKD + mark strip: polytonic precomposed forms (ᾶ, ἀ-ώ breathing forms)
  // decompose AT NFKD to base letters + marks, so running the table here
  // catches every decomposed base letter — running it before NFKD missed
  // them. Each replacement is counted so the change summary stays honest.
  const beforeGreek = text
  for (const [from, to] of GREEK_TRANSLIT) {
    if (!text.includes(from)) continue
    const greekBefore = text
    // gamma/lambda digit-adjacency (critic round-2): '50γ' is
    // clinical shorthand for micrograms and '5λ' for microlitres -
    // mapping them to g/l next to a digit silently produced a 10^6x misread
    // with no warning. A gamma/lambda DIRECTLY AFTER A DIGIT stays unmapped:
    // the final strip drops it WITH the unmapped-chars warning (pre-PR
    // behavior restored). Everywhere else they transliterate normally.
    if (from === 'γ' || from === 'λ') {
      const re = new RegExp(`(?<!\\d)${from}`, 'g')
      const matches = text.match(re)
      if (!matches) continue
      text = text.replace(re, to)
      changeCounts.set(`greek:${from}→${to}`,
        (changeCounts.get(`greek:${from}→${to}`) ?? 0) + matches.length)
      continue
    }
    text = text.split(from).join(to)
    if (text !== greekBefore) {
      const key = `greek:${from}→${to}`
      changeCounts.set(key, (changeCounts.get(key) ?? 0) + (greekBefore.split(from).length - 1))
    }
  }

  // ── Step 3: Unicode whitespace → regular space ────────────────────────────
  const wsRegex = /[\u1680\u2000-\u200A\u205F\u3000]/g
  const wsMatches = text.match(wsRegex)
  if (wsMatches && wsMatches.length > 0) {
    changeCounts.set('whitespace_normalized',
      (changeCounts.get('whitespace_normalized') ?? 0) + wsMatches.length)
  }
  text = text.replace(wsRegex, ' ')

  // ── Step 4: C0/C1 control characters (keep \t \n \r) ─────────────────────
  const ctrlBefore = text
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x80-\x9F]/g, '')
  const ctrlRemoved = ctrlBefore.length - text.length
  if (ctrlRemoved > 0) {
    changeCounts.set('control_chars_removed',
      (changeCounts.get('control_chars_removed') ?? 0) + ctrlRemoved)
  }

  // ── Step 5: Normalize line endings → \n ───────────────────────────────────
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // ── Step 6: Final strip — remove anything outside printable ASCII ──────────
  const finalBefore = text
  const droppedChars = []
  text = finalBefore.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, (char) => {
    droppedChars.push(char)
    return ''
  })
  if (droppedChars.length > 0) {
    changeCounts.set('final_strip',
      (changeCounts.get('final_strip') ?? 0) + droppedChars.length)
  }

  // Build warnings from unique unmapped dropped chars
  const uniqueDropped = [...new Set(droppedChars)]
  const warnings = uniqueDropped.length > 0
    ? [{
        type: 'unmapped_chars_dropped',
        count: droppedChars.length,
        chars: uniqueDropped.slice(0, 20), // cap at 20 for display
        message: `${droppedChars.length} unmapped character${droppedChars.length === 1 ? '' : 's'} removed: ${uniqueDropped.slice(0, 5).join(', ')}${uniqueDropped.length > 5 ? ` (+${uniqueDropped.length - 5} more)` : ''}`
      }]
    : []

  // ── Build change summary ───────────────────────────────────────────────────
  const changes = buildChangeSummary(changeCounts)

  return { text, changes, warnings }
}

/**
 * buildChangeSummary
 * Converts internal change map into human-readable records grouped by category.
 */
function buildChangeSummary(changeCounts) {
  if (changeCounts.size === 0) return []

  const categoryMap = {
    quotes:       ['\u2018', '\u2019', '\u201A', '\u201B', '\u201C', '\u201D', '\u201E', '\u201F', '\u2039', '\u203A', '\u00AB', '\u00BB'],
    dashes:       ['\u2013', '\u2014', '\u2015', '\u2212', '\u2011', '\u00AD'],
    ellipsis:     ['\u2026'],
    spaces:       ['\u00A0', '\u202F', '\u2007', '\u2008', '\u2009', '\u200A', '\u3000'],
    invisible:    ['\u200B', '\u200C', '\u200D', '\u2060', '\uFEFF', '\u200E', '\u200F', '\u202A', '\u202B', '\u202C', '\u202D', '\u202E'],
    symbols:      ['\u2022', '\u2023', '\u2024', '\u2025', '\u00B7', '\u2122', '\u00AE', '\u00A9', '\u00B0', '\u2103', '\u2109', '\u00A7', '\u00B6', '\u2020', '\u2021', '\u2044'],
    fractions:    ['\u00BD', '\u00BC', '\u00BE', '\u2153', '\u2154', '\u215B', '\u215C', '\u215D', '\u215E'],
    superscript:  ['\u00B9', '\u00B2', '\u00B3', '\u2070', '\u2074', '\u2075', '\u2076', '\u2077', '\u2078', '\u2079', '\u2080', '\u2081', '\u2082', '\u2083', '\u2084', '\u2085', '\u2086', '\u2087', '\u2088', '\u2089'],
    ligatures:    ['\uFB00', '\uFB01', '\uFB02', '\uFB03', '\uFB04', '\uFB05', '\uFB06', '\u0153', '\u0152', '\u00E6', '\u00C6'],
    arrows:       ['\u2192', '\u2190', '\u2191', '\u2193', '\u21D2', '\u21D4'],
    math:         ['\u00D7', '\u00F7', '\u00B1', '\u2260', '\u2264', '\u2265', '\u2248', '\u221E', '\u03BC', '\u00B5'],
  }

  const labelMap = {
    quotes:      'smart quotes → straight',
    dashes:      'dashes → hyphen(s)',
    ellipsis:    'ellipsis → ...',
    spaces:      'non-standard spaces → space',
    invisible:   'invisible characters removed',
    symbols:     'typographic symbols converted',
    fractions:   'fraction characters converted',
    superscript: 'superscript/subscript digits flattened',
    ligatures:   'ligatures expanded',
    arrows:      'arrow characters converted',
    math:        'math symbols converted',
    nfkd_normalize: 'Latin/Greek characters transliterated to ASCII',
    greek_translit: 'Greek characters transliterated to ASCII',
    whitespace_normalized: 'non-standard whitespace normalized',
    control_chars_removed: 'control characters removed',
    final_strip: 'remaining non-ASCII characters stripped',
  }

  const categoryCounts = {}

  for (const [key, count] of changeCounts.entries()) {
    if (key === 'nfkd_normalize' || key === 'whitespace_normalized' || key === 'control_chars_removed' || key === 'final_strip') {
      if (!categoryCounts[key]) categoryCounts[key] = 0
      categoryCounts[key] += count
      continue
    }
    if (key.startsWith('micro:')) {
      // fold into the math category where CHARMAP's mu already reports,
      // so the two passes read as one.
      if (!categoryCounts['math']) categoryCounts['math'] = 0
      categoryCounts['math'] += count
      continue
    }
    if (key.startsWith('greek:') || key === 'greek_translit') {
      if (!categoryCounts['greek_translit']) categoryCounts['greek_translit'] = 0
      categoryCounts['greek_translit'] += count
      continue
    }
    const from = key.split('→')[0]
    let matched = false
    for (const [cat, chars] of Object.entries(categoryMap)) {
      if (chars.includes(from)) {
        if (!categoryCounts[cat]) categoryCounts[cat] = 0
        categoryCounts[cat] += count
        matched = true
        break
      }
    }
    if (!matched) {
      if (!categoryCounts['final_strip']) categoryCounts['final_strip'] = 0
      categoryCounts['final_strip'] += count
    }
  }

  return Object.entries(categoryCounts)
    .filter(([, count]) => count > 0)
    .map(([category, count]) => ({
      category,
      label: labelMap[category] ?? category,
      count,
    }))
}
