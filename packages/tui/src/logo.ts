// Sploit wordmark, captured verbatim from the known-good rebranded build
// (C:\Users\Hp\Desktop\sploitbin\Sploit\bin\sploit.exe --version => 0.1.12-sploit)
// so the letterforms match exactly. Kept as a single-tone wordmark (all in
// `left`, `right` left blank) rather than guessing an original left/right
// color split -- splitting at the wrong column would still be legible, but
// there is no way to confirm the original two-tone boundary without seeing
// the rendered terminal, so this avoids an unverifiable guess.
export const logo = {
  left: [
    "                                    ",
    "▀^██▀ ▀^██▀ ▄      ▀^██▀ ▀^██▀ ▀^██▀",
    "█     █   █ █      █   █   █     █  ",
    "█████ █████ █      █   █   █     █  ",
    "    █ █     █      █   █   █     █  ",
    "▄███▄ ▀     ▄███▄  ▄███▄ ▄███▄   ▀  ",
    "~~~~~ ~     ~~~~~  ~~~~~ ~~~~~   ~  ",
  ],
  right: ["", "", "", "", "", "", ""],
}

export const go = {
  left: ["    ", "█▀▀▀", "█_^█", "▀▀▀▀"],
  right: ["    ", "█▀▀█", "█__█", "▀▀▀▀"],
}

export const marks = "_^~,"
