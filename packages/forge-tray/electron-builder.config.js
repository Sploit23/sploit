// Config minima -- sem icone proprio ainda (electron-builder usa um
// generico), sem auto-update, sem code signing. Builda local, o .exe
// gerado e levado manualmente pro PC novo por enquanto (ver plano).
module.exports = {
  appId: "com.sploit.forge-tray",
  productName: "FORGE Tray",
  directories: { output: "dist" },
  files: ["src/**/*.js", "assets/**/*", "package.json"],
  win: {
    target: "nsis",
  },
  nsis: {
    oneClick: true,
    perMachine: false,
  },
}
