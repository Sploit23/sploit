import { logo, sploitColors } from "../logo"

const reset = "\x1b[0m"
const bold = "\x1b[1m"
const dim = "\x1b[90m"
const hole = "\x1b[48;5;235m"
const shadow = "\x1b[38;5;238m"

function drawColored(line: string, start: number) {
  return line
    .split(" ")
    .map((glyph, index) => {
      const fg = sploitColors[start + index] ?? dim
      return [...glyph]
        .map((char) => {
          if (char === "_") return `${hole} ${reset}`
          if (char === "^") return `${fg}${hole}▀${reset}`
          if (char === "~") return `${shadow}▀${reset}`
          if (char === " ") return " "
          return `${fg}${char}${reset}`
        })
        .join("")
    })
    .join(" ")
}

function wordmark(pad = "") {
  return logo.left.map((line, index) => {
    const left = drawColored(line, 0)
    const right = drawColored(logo.right[index] ?? "", 3)
    return `${pad}${left} ${right}`
  })
}

export function sessionEpilogue(input: { title: string; sessionID?: string }) {
  const weak = (text: string) => `${dim}${text.padEnd(10, " ")}${reset}`
  return [
    ...wordmark("  "),
    "",
    `  ${weak("Session")}${bold}${input.title}${reset}`,
    `  ${weak("Continue")}${bold}sploit -s ${input.sessionID}${reset}`,
    "",
  ].join("\n")
}
