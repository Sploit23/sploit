// SPLOIT wordmark and "SP" monogram. Each glyph is 5 columns by 5 rows,
// plus a shared glow row underneath echoing each letter's footprint.
//
// `_` = hole (background, painted dark)      `█` = solid block
// `▀` = top half-block (rounds a top corner)  `▄` = bottom half-block (rounds a bottom corner / tapers a stem foot)
// `^` = accent shine (top half-block, letter color blended with bg)
// `~` = shadow glow (top half-block, shadow color) — used only in the extra floor row
const S = ["▀^██▀", "█____", "█████", "____█", "▄███▄"]
const P = ["▀^██▀", "█___█", "█████", "█____", "▀____"]
const L = ["▄____", "█____", "█____", "█____", "▄███▄"]
const O = ["▀^██▀", "█___█", "█___█", "█___█", "▄███▄"]
const I = ["▀^██▀", "__█__", "__█__", "__█__", "▄███▄"]
const T = ["▀^██▀", "__█__", "__█__", "__█__", "__▀__"]

// Traces a letter's base row as a soft glow beneath it: solid/rounded cells
// become shadow-colored half-blocks, holes fall away to transparent space.
const glow = (row: string) => row.replace(/[█▀▄]/g, "~").replace(/_/g, " ")
const foot = (glyph: string[]) => glyph[glyph.length - 1]

export const logo = {
  left: [
    "                 ",
    ...S.map((_, index) => `${S[index]} ${P[index]} ${L[index]}`),
    `${glow(foot(S))} ${glow(foot(P))} ${glow(foot(L))}`,
  ],
  right: [
    "                 ",
    ...O.map((_, index) => `${O[index]} ${I[index]} ${T[index]}`),
    `${glow(foot(O))} ${glow(foot(I))} ${glow(foot(T))}`,
  ],
}

export const mark = {
  left: ["     ", ...S, glow(foot(S))],
  right: ["     ", ...P, glow(foot(P))],
}

// Per-letter ANSI gradient for SPLOIT: hot pink, ember orange, gold, neon
// lime, electric cyan, violet.
export const sploitColors = [
  "\x1b[38;2;255;55;175m",
  "\x1b[38;2;255;110;35m",
  "\x1b[38;2;255;205;30m",
  "\x1b[38;2;70;235;120m",
  "\x1b[38;2;35;215;255m",
  "\x1b[38;2;175;90;255m",
]

// Same gradient as hex (for RGBA renderers that can't parse ANSI escapes).
export const sploitColorsHex = [
  "#ff37af",
  "#ff6e23",
  "#ffcd1e",
  "#46eb78",
  "#23d7ff",
  "#af5aff",
]

export const marks = "_^~,"
