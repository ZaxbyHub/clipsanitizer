// src/sanitizer/greek.js
// Greek transliteration table (issue #357 gate — the 'Greek letter drop' fix).
//
// Before this table, any Greek letter that survived the CHARMAP (only μ was
// mapped) was silently DESTROYED by the final ASCII strip — e.g. 'Δόση 5mg'
// lost its word entirely. Now Greek transliterates to printable ASCII:
// monophthong-style (η→i, ω→o, θ→th, χ→ch, ψ→ps, φ→f, β→v, γ→g, δ→d), with
// the tonos-vowel precomposed forms mapped explicitly. Polytonic accented
// forms decompose under NFKD to a mapped base letter + a combining mark that
// the existing mark-strip already removes.
//
// Order matters: longer sources first (none currently multi-char, but keep
// the discipline). μg→mcg stays in CHARMAP and runs before this table.

export const GREEK_TRANSLIT = [
  // tonos vowels (precomposed) — map before base letters
  ['ά', 'a'], ['έ', 'e'], ['ή', 'i'], ['ί', 'i'], ['ό', 'o'], ['ύ', 'y'], ['ώ', 'o'],
  ['ϊ', 'i'], ['ϋ', 'y'], ['ΐ', 'i'], ['ΰ', 'y'],
  ['Ά', 'A'], ['Έ', 'E'], ['Ή', 'I'], ['Ί', 'I'], ['Ό', 'O'], ['Ύ', 'Y'], ['Ώ', 'O'],
  // lowercase
  ['α', 'a'], ['β', 'v'], ['γ', 'g'], ['δ', 'd'], ['ε', 'e'], ['ζ', 'z'],
  ['η', 'i'], ['θ', 'th'], ['ι', 'i'], ['κ', 'k'], ['λ', 'l'], ['μ', 'm'],
  ['ν', 'n'], ['ξ', 'x'], ['ο', 'o'], ['π', 'p'], ['ρ', 'r'],
  ['σ', 's'], ['ς', 's'], ['τ', 't'], ['υ', 'y'], ['φ', 'f'], ['χ', 'ch'],
  ['ψ', 'ps'], ['ω', 'o'],
  // uppercase (final sigma has no uppercase; ς lowercase-only)
  ['Α', 'A'], ['Β', 'V'], ['Γ', 'G'], ['Δ', 'D'], ['Ε', 'E'], ['Ζ', 'Z'],
  ['Η', 'I'], ['Θ', 'Th'], ['Ι', 'I'], ['Κ', 'K'], ['Λ', 'L'], ['Μ', 'M'],
  ['Ν', 'N'], ['Ξ', 'X'], ['Ο', 'O'], ['Π', 'P'], ['Ρ', 'R'], ['Σ', 'S'],
  ['Τ', 'T'], ['Υ', 'Y'], ['Φ', 'F'], ['Χ', 'Ch'], ['Ψ', 'Ps'], ['Ω', 'O'],
]
