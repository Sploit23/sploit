export const EmptyBorder = {
  topLeft: "",
  bottomLeft: "",
  vertical: "",
  topRight: "",
  bottomRight: "",
  horizontal: " ",
  bottomT: "",
  topT: "",
  cross: "",
  leftT: "",
  rightT: "",
}

export const SplitBorder = {
  border: ["left" as const, "right" as const],
  customBorderChars: {
    ...EmptyBorder,
    vertical: "┃",
  },
}

// Sploit's signature frame: angular corner nodes instead of the plain
// box-drawing default, used anywhere the app wants to look like a terminal
// panel rather than a generic rounded dialog.
export const CircuitBorder = {
  border: true as const,
  customBorderChars: {
    topLeft: "┌",
    topRight: "◆",
    bottomLeft: "└",
    bottomRight: "◆",
    vertical: "│",
    horizontal: "─",
    bottomT: "┬",
    topT: "┴",
    cross: "┼",
    leftT: "├",
    rightT: "┤",
  },
}
