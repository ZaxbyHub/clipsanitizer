// src/sanitizer/greek.js
// Greek transliteration table (issue #357 gate — the 'Greek letter drop' fix).
//
// Before this table, any Greek letter that survived CHARMAP was silently
// DESTROYED by the final ASCII strip — e.g. 'Δόση 5mg' lost its word entirely.
// Now Greek transliterates to printable ASCII: monophthong-style (η→i, ω→o,
// θ→th, χ→ch, ψ→ps, φ→f, β→v, γ→g, δ→d). The pipeline runs this stage AFTER
// NFKD + mark-strip, so polytonic precomposed forms (ᾶ, breathing forms, and
// the tonos vowels) decompose first and are caught by their BASE letter's
// entry — the precomposed tonos entries below are a safety net.
//
// mu is DELIBERATELY ABSENT: CHARMAP owns it (μg→mcg, μ→u — the clinical
// micro symbol), including the post-NFKD re-application for compatibility
// characters like U+338D. Mapping μ→m here turned U+338D into 'mg' — a
// silent 1000× dose error (critic round-1 BLOCKER, 2026-11-17).
//
// The fold table the clinician reviews is generated from this table plus
// CHARMAP and the fallback: `npm run export-foldtable`.

export const GREEK_TRANSLIT = [
  // gamma/lambda FIRST: the word rule (adjacency to another Greek letter)
  // is evaluated against the pre-stage text; processing them first keeps
  // that context Greek. mu is absent (CHARMAP owns it, see above).
  ['γ', 'g'], ['λ', 'l'], ['Γ', 'G'],
  // tonos vowels (precomposed) — safety net; NFKD handles these first
  ['ά', 'a'], ['έ', 'e'], ['ή', 'i'], ['ί', 'i'], ['ό', 'o'], ['ύ', 'y'], ['ώ', 'o'],
  ['ϊ', 'i'], ['ϋ', 'y'], ['ΐ', 'i'], ['ΰ', 'y'],
  ['Ά', 'A'], ['Έ', 'E'], ['Ή', 'I'], ['Ί', 'I'], ['Ό', 'O'], ['Ύ', 'Y'], ['Ώ', 'O'],
  // lowercase
  ['α', 'a'], ['β', 'v'], ['δ', 'd'], ['ε', 'e'], ['ζ', 'z'],
  ['η', 'i'], ['θ', 'th'], ['ι', 'i'], ['κ', 'k'], ['λ', 'l'],
  ['ν', 'n'], ['ξ', 'x'], ['ο', 'o'], ['π', 'p'], ['ρ', 'r'],
  ['σ', 's'], ['ς', 's'], ['τ', 't'], ['υ', 'y'], ['φ', 'f'], ['χ', 'ch'],
  ['ψ', 'ps'], ['ω', 'o'],
  // uppercase (final sigma has no uppercase; ς lowercase-only)
  ['Α', 'A'], ['Β', 'V'], ['Γ', 'G'], ['Δ', 'D'], ['Ε', 'E'], ['Ζ', 'Z'],
  ['Η', 'I'], ['Θ', 'Th'], ['Ι', 'I'], ['Κ', 'K'], ['Λ', 'L'], ['Μ', 'M'],
  ['Ν', 'N'], ['Ξ', 'X'], ['Ο', 'O'], ['Π', 'P'], ['Ρ', 'R'], ['Σ', 'S'],
  ['Τ', 'T'], ['Υ', 'Y'], ['Φ', 'F'], ['Χ', 'Ch'], ['Ψ', 'Ps'], ['Ω', 'O'],
]
