// Registra/remove o FORGE como Serviço do Windows de verdade (node-windows),
// substituindo o systemd do lado Linux. Serviço nativo: auto-start no boot,
// restart automático se cair, sem VM, sem truque de Startup/VBS. Requer
// executar como Administrador (o próprio Windows pede, não dá pra contornar
// -- registrar serviço é uma operação privilegiada por design).
//
// Uso: node win-service.js install   (ou) node win-service.js uninstall
//      node win-service.js safe-restart
//
// ARMADILHA CONFIRMADA NA PRÁTICA -- nunca rode `Restart-Service`/
// `Stop-Service` deste serviço de DENTRO de uma sessão de terminal que o
// próprio FORGE abriu (ou seja, de dentro do sessions-native.js): o
// comando de restart mata o processo node.exe (e com ele o pty/PowerShell
// que estava rodando o próprio comando) assim que a fase "stop" começa --
// a fase "start" nunca roda, porque quem ia chamá-la já morreu junto. O
// serviço fica parado (StartType continua Automatic, então um boot
// resolve, mas nada reinicia sozinho até lá). No lado Linux/tmux esse
// risco não existe: a sessão de terminal (tmux) é um processo separado
// do server.js, sobrevive ao restart dele.
//
// `safe-restart` existe por causa disso: agenda o restart via Task
// Scheduler (`schtasks /run`) em vez de chamar Restart-Service direto. O
// Task Scheduler é um serviço à parte do Windows -- o processo que ele
// dispara não é filho da nossa sessão/pty, então sobrevive sem problema a
// ela morrer no meio. É esse o comando certo pra rodar de dentro de um
// terminal do próprio FORGE; Restart-Service direto só é seguro vindo de
// uma sessão PowerShell externa (ex: RDP, ou fisicamente no PC).
const path = require('path')
const { execFileSync } = require('child_process')
const { Service } = require('node-windows')

if (process.argv[2] === 'safe-restart') {
  const taskName = 'SploitForgeSafeRestart'
  const cmd = 'powershell -NoProfile -Command "Start-Sleep -Seconds 1; Restart-Service sploitforge.exe"'
  execFileSync('schtasks', ['/create', '/tn', taskName, '/tr', cmd, '/sc', 'once', '/st', '00:00', '/ru', 'SYSTEM', '/f'])
  execFileSync('schtasks', ['/run', '/tn', taskName])
  console.log('==> Restart agendado via Task Scheduler -- roda em ~1s, sobrevive a esta sessão morrer.')
  process.exit(0)
}

const svc = new Service({
  name: 'SploitForge',
  description: 'FORGE (controle remoto do opencode/claude pelo celular)',
  script: path.join(__dirname, 'server.js'),
  env: Object.entries(process.env)
    .filter(([k]) => ['FORGE_TOKEN', 'FORGE_ROOT', 'PORT', 'HOST', 'OPENCODE_BIN', 'CLAUDE_BIN'].includes(k))
    .map(([name, value]) => ({ name, value })),
})

const action = process.argv[2]

svc.on('install', () => {
  console.log('==> Serviço instalado, iniciando...')
  svc.start()
})
svc.on('start', () => console.log('==> SploitForge rodando como Serviço do Windows.'))
svc.on('alreadyinstalled', () => {
  // node-windows grava env/caminho na config do serviço só na hora do
  // install -- um 'restart' simples reaplicaria a config VELHA (token/porta
  // antigos). Desinstala e reinstala do zero pra sempre pegar o que foi
  // passado nesta chamada.
  console.log('==> Já instalado, removendo pra reinstalar com a configuração atual...')
  svc.uninstall()
})
svc.on('uninstall', () => {
  if (action === 'uninstall') {
    console.log('==> Serviço removido.')
    return
  }
  console.log('==> Reinstalando...')
  svc.install()
})
svc.on('error', (e) => console.error('erro:', e))

if (action === 'uninstall') svc.uninstall()
else svc.install()
