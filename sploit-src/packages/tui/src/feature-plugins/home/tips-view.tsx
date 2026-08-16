import type { TuiPluginApi } from "@sploit-ai/plugin/tui"
import { createMemo, For, type Accessor } from "solid-js"
import { DEFAULT_THEMES, useTheme } from "../../context/theme"
import { useCommandShortcut } from "../../keymap"

const themeCount = Object.keys(DEFAULT_THEMES).length

type TipPart = { text: string; highlight: boolean }
type TipShortcut = Accessor<string>
type Shortcuts = {
  agentCycle: TipShortcut
  childFirst: TipShortcut
  childNext: TipShortcut
  childPrevious: TipShortcut
  commandList: TipShortcut
  editorOpen: TipShortcut
  helpShow: TipShortcut
  inputClear: TipShortcut
  inputNewline: TipShortcut
  inputPaste: TipShortcut
  inputUndo: TipShortcut
  leader: TipShortcut
  messagesCopy: TipShortcut
  messagesFirst: TipShortcut
  messagesLast: TipShortcut
  messagesPageDown: TipShortcut
  messagesPageUp: TipShortcut
  messagesToggleConceal: TipShortcut
  modelCycleRecent: TipShortcut
  modelList: TipShortcut
  sessionExport: TipShortcut
  sessionInterrupt: TipShortcut
  sessionList: TipShortcut
  sessionNew: TipShortcut
  sessionParent: TipShortcut
  sessionPinToggle: TipShortcut
  sessionQuickSwitch1: TipShortcut
  sessionQuickSwitch9: TipShortcut
  sessionSidebarToggle: TipShortcut
  sessionTimeline: TipShortcut
  statusView: TipShortcut
  terminalSuspend: TipShortcut
  themeList: TipShortcut
}
type Tip = string | ((shortcuts: Shortcuts) => string | undefined)

function parse(tip: string): TipPart[] {
  const parts: TipPart[] = []
  const regex = /\{highlight\}(.*?)\{\/highlight\}/g
  const found = Array.from(tip.matchAll(regex))
  const state = found.reduce(
    (acc, match) => {
      const start = match.index ?? 0
      if (start > acc.index) {
        acc.parts.push({ text: tip.slice(acc.index, start), highlight: false })
      }
      acc.parts.push({ text: match[1], highlight: true })
      acc.index = start + match[0].length
      return acc
    },
    { parts, index: 0 },
  )

  if (state.index < tip.length) {
    parts.push({ text: tip.slice(state.index), highlight: false })
  }

  return parts
}

const NO_MODELS_TIP = "Execute {highlight}/connect{/highlight} para adicionar um provedor de IA e começar a codar"
const NO_MODELS_PARTS = parse(NO_MODELS_TIP)

function shortcutText(value: string) {
  return `{highlight}${value}{/highlight}`
}

function commandText(command: string, shortcut: string) {
  if (!shortcut) return shortcutText(command)
  return `${shortcutText(command)} ou ${shortcutText(shortcut)}`
}

function press(shortcut: string, text: string) {
  if (!shortcut) return undefined
  return `Pressione ${shortcutText(shortcut)} ${text}`
}

function configShortcut(api: TuiPluginApi, command: string): TipShortcut {
  return () =>
    api.tuiConfig.keybinds
      .get(command)
      .map((binding) => api.keys.formatSequence(Array.from(api.keymap.parseKeySequence(binding.key))))
      .filter(Boolean)
      .join(", ")
}

export function Tips(props: { api: TuiPluginApi; connected?: boolean }) {
  const theme = useTheme().theme
  const tipOffset = Math.random()
  const shortcuts: Shortcuts = {
    agentCycle: useCommandShortcut("agent.cycle"),
    childFirst: configShortcut(props.api, "session.child.first"),
    childNext: configShortcut(props.api, "session.child.next"),
    childPrevious: configShortcut(props.api, "session.child.previous"),
    commandList: useCommandShortcut("command.palette.show"),
    editorOpen: useCommandShortcut("prompt.editor"),
    helpShow: useCommandShortcut("help.show"),
    inputClear: useCommandShortcut("prompt.clear"),
    inputNewline: useCommandShortcut("input.newline"),
    inputPaste: useCommandShortcut("prompt.paste"),
    inputUndo: useCommandShortcut("input.undo"),
    leader: configShortcut(props.api, "leader"),
    messagesCopy: configShortcut(props.api, "messages.copy"),
    messagesFirst: configShortcut(props.api, "session.first"),
    messagesLast: configShortcut(props.api, "session.last"),
    messagesPageDown: configShortcut(props.api, "session.page.down"),
    messagesPageUp: configShortcut(props.api, "session.page.up"),
    messagesToggleConceal: configShortcut(props.api, "session.toggle.conceal"),
    modelCycleRecent: useCommandShortcut("model.cycle_recent"),
    modelList: useCommandShortcut("model.list"),
    sessionExport: configShortcut(props.api, "session.export"),
    sessionInterrupt: configShortcut(props.api, "session.interrupt"),
    sessionList: useCommandShortcut("session.list"),
    sessionNew: useCommandShortcut("session.new"),
    sessionParent: configShortcut(props.api, "session.parent"),
    sessionPinToggle: configShortcut(props.api, "session.pin.toggle"),
    sessionQuickSwitch1: useCommandShortcut("session.quick_switch.1"),
    sessionQuickSwitch9: useCommandShortcut("session.quick_switch.9"),
    sessionSidebarToggle: configShortcut(props.api, "session.sidebar.toggle"),
    sessionTimeline: configShortcut(props.api, "session.timeline"),
    statusView: useCommandShortcut("sploit.status"),
    terminalSuspend: useCommandShortcut("terminal.suspend"),
    themeList: useCommandShortcut("theme.switch"),
  }
  const tip = createMemo(() => {
    if (props.connected === false) return NO_MODELS_TIP
    const tips = [...TIPS, process.platform !== "win32" ? TERMINAL_SUSPEND_TIP : INPUT_UNDO_TIP].flatMap((item) => {
      const value = typeof item === "string" ? item : item(shortcuts)
      return value ? [value] : []
    })
    return tips[Math.floor(tipOffset * tips.length)] ?? NO_MODELS_TIP
  }, NO_MODELS_TIP)
  // Solid can expose a memo's initial value while a pure computation is pending.
  const parts = createMemo(() => {
    const value = tip()
    if (typeof value === "string") return parse(value)
    return NO_MODELS_PARTS
  }, NO_MODELS_PARTS)

  return (
    <box flexDirection="row" maxWidth="100%">
      <text flexShrink={0} style={{ fg: theme.warning }}>
        ● Dica{" "}
      </text>
      <text flexShrink={1} wrapMode="word">
        <For each={parts()}>
          {(part) => <span style={{ fg: part.highlight ? theme.text : theme.textMuted }}>{part.text}</span>}
        </For>
      </text>
    </box>
  )
}

const TIPS: Tip[] = [
  "Digite {highlight}@{/highlight} seguido do nome de um arquivo para buscar e anexar arquivos",
  "Comece uma mensagem com {highlight}!{/highlight} para executar comandos de shell (ex.: {highlight}!ls -la{/highlight})",
  (shortcuts) => press(shortcuts.agentCycle(), "para alternar entre os agentes Build e Plan"),
  "Use {highlight}/undo{/highlight} para desfazer a última mensagem e as alterações de arquivos",
  "Use {highlight}/redo{/highlight} para refazer mensagens e alterações de arquivos desfeitas",
  "Use {highlight}@arquivo{/highlight} nos prompts para anexar o conteúdo de arquivos como contexto",
  "Arraste e solte imagens ou PDFs no terminal como contexto",
  (shortcuts) => press(shortcuts.inputPaste(), "para colar imagens da área de transferência no prompt"),
  (shortcuts) => `Use ${commandText("/editor", shortcuts.editorOpen())} para compor mensagens no seu editor externo`,
  "Execute {highlight}/init{/highlight} para gerar regras do projeto automaticamente a partir do seu código",
  (shortcuts) => `Use ${commandText("/models", shortcuts.modelList())} para alternar entre os modelos de IA disponíveis`,
  (shortcuts) => `Use ${commandText("/themes", shortcuts.themeList())} para alternar entre os ${themeCount} temas nativos`,
  (shortcuts) => `Use ${commandText("/new", shortcuts.sessionNew())} para iniciar uma nova sessão de conversa`,
  (shortcuts) => `Use ${commandText("/sessions", shortcuts.sessionList())} para listar, fixar e continuar sessões`,
  (shortcuts) => press(shortcuts.sessionPinToggle(), "na lista de sessões para fixar uma no topo"),
  (shortcuts) =>
    shortcuts.sessionQuickSwitch1() && shortcuts.sessionQuickSwitch9()
      ? `Use ${shortcutText(shortcuts.sessionQuickSwitch1())} até ${shortcutText(shortcuts.sessionQuickSwitch9())} para alternar entre sessões fixadas`
      : undefined,
  "Execute {highlight}/compact{/highlight} para resumir sessões longas próximas do limite de contexto",
  (shortcuts) => `Use ${commandText("/export", shortcuts.sessionExport())} para salvar a conversa como Markdown`,
  (shortcuts) => press(shortcuts.messagesCopy(), "para copiar a última mensagem do assistente para a área de transferência"),
  (shortcuts) => press(shortcuts.commandList(), "para ver todas as ações e comandos disponíveis"),
  "Execute {highlight}/connect{/highlight} para adicionar chaves de API de 75+ provedores de LLM",
  (shortcuts) => `A tecla líder é ${shortcutText(shortcuts.leader())}; combine com outras teclas para ações rápidas`,
  (shortcuts) => press(shortcuts.modelCycleRecent(), "para alternar rapidamente entre modelos usados recentemente"),
  (shortcuts) => press(shortcuts.sessionSidebarToggle(), "em uma sessão para mostrar ou ocultar o painel lateral"),
  (shortcuts) =>
    shortcuts.messagesPageUp() && shortcuts.messagesPageDown()
      ? `Use ${shortcutText(shortcuts.messagesPageUp())}/${shortcutText(shortcuts.messagesPageDown())} para navegar pelo histórico da conversa`
      : undefined,
  (shortcuts) => press(shortcuts.messagesFirst(), "para ir ao início da conversa"),
  (shortcuts) => press(shortcuts.messagesLast(), "para ir à mensagem mais recente"),
  (shortcuts) => press(shortcuts.inputNewline(), "para adicionar quebras de linha no seu prompt"),
  (shortcuts) => press(shortcuts.inputClear(), "ao digitar, para limpar o campo de entrada"),
  (shortcuts) => press(shortcuts.sessionInterrupt(), "para interromper a IA no meio da resposta"),
  "Mude para o agente {highlight}Plan{/highlight} para sugestões sem fazer alterações",
  "Use {highlight}@nome-do-agente{/highlight} nos prompts para invocar subagentes especializados",
  (shortcuts) => {
    const items = [
      shortcuts.sessionParent(),
      shortcuts.childFirst(),
      shortcuts.childPrevious(),
      shortcuts.childNext(),
    ].filter(Boolean)
    if (!items.length) return undefined
    return `Use ${items.map(shortcutText).join(" / ")} para sessões pai/filho`
  },
  "Adicione arquivos {highlight}AGENTS.md{/highlight} em qualquer pasta para carregar regras específicas do projeto no Sploit",
  "Coloque as configurações da TUI em {highlight}~/.config/sploit/tui.json{/highlight} para config global",
  "Adicione {highlight}$schema{/highlight} à sua config para autocomplete no editor",
  "Configure {highlight}model{/highlight} na config para definir seu modelo padrão",
  "Sobrescreva qualquer atalho em {highlight}tui.json{/highlight} pela seção {highlight}keybinds{/highlight}",
  "Defina qualquer atalho como {highlight}none{/highlight} para desativá-lo completamente",
  "Configure servidores MCP locais ou remotos na seção {highlight}mcp{/highlight} da config",
  "Adicione arquivos {highlight}.md{/highlight} em {highlight}.sploit/commands/{/highlight} para prompts reutilizáveis",
  "Use {highlight}$ARGUMENTS{/highlight}, {highlight}$1{/highlight}, {highlight}$2{/highlight} em comandos personalizados para entrada dinâmica",
  "Use crases para injetar a saída do shell (ex.: {highlight}`git status`{/highlight})",
  "Adicione arquivos {highlight}.md{/highlight} em {highlight}.sploit/agents/{/highlight} para personas de IA especializadas",
  "Configure permissões por agente para as ferramentas {highlight}edit{/highlight}, {highlight}bash{/highlight} e {highlight}webfetch{/highlight}",
  'Use padrões como {highlight}"git *": "allow"{/highlight} para permissões bash granulares',
  'Defina {highlight}"rm -rf *": "deny"{/highlight} para bloquear comandos destrutivos',
  'Configure {highlight}"git push": "ask"{/highlight} para exigir aprovação antes do push',
  'Defina {highlight}"formatter": true{/highlight} para ativar formatadores nativos',
  'Defina {highlight}"formatter": false{/highlight} para desativar formatadores herdados',
  "Defina comandos de formatação personalizados com extensões de arquivo na config",
  'Defina {highlight}"lsp": true{/highlight} para ativar a análise de código LSP nativa',
  "Crie arquivos {highlight}.ts{/highlight} em {highlight}.sploit/tools/{/highlight} para definir novas ferramentas de LLM",
  "Definições de ferramentas podem invocar scripts em Python, Go, etc.",
  "Adicione arquivos {highlight}.ts{/highlight} em {highlight}.sploit/plugins/{/highlight} para hooks de eventos",
  "Use plugins para enviar notificações do sistema quando as sessões terminarem",
  "Crie um plugin para impedir o Sploit de ler arquivos sensíveis",
  "Use {highlight}sploit run{/highlight} para scripts não interativos",
  "Use {highlight}sploit --continue{/highlight} para retomar a última sessão",
  "Use {highlight}sploit run -f arquivo.ts{/highlight} para anexar arquivos via CLI",
  "Use {highlight}--format json{/highlight} para saída legível por máquina em scripts",
  "Execute {highlight}sploit serve{/highlight} para acesso headless via API ao Sploit",
  "Use {highlight}sploit run --attach{/highlight} para conectar a um servidor em execução",
  "Recompile o {highlight}sploit{/highlight} após mudanças de código com {highlight}scripts/build-sploit.ps1{/highlight}",
  "Use {highlight}context7{/highlight} para documentação atualizada de bibliotecas",
  "Use o MCP {highlight}graphify{/highlight} para consultar o grafo de conhecimento do código",
  "Execute {highlight}sploit auth list{/highlight} para ver todos os provedores configurados",
  "Execute {highlight}sploit agent create{/highlight} para criação guiada de agentes",
  "Execute {highlight}sploit github install{/highlight} para configurar o workflow do GitHub",
  'Use {highlight}"theme": "system"{/highlight} para combinar com as cores do seu terminal',
  "Crie arquivos JSON de tema no diretório {highlight}.sploit/themes/{/highlight}",
  "Os temas suportam variantes dark/light em ambos os modos",
  "Use códigos de cor xterm numéricos de 0-255 em JSON de tema personalizado",
  "Use {highlight}{env:NOME_VAR}{/highlight} para variáveis de ambiente na config",
  "Use {highlight}{file:caminho}{/highlight} para incluir o conteúdo de arquivos em valores de config",
  "Use {highlight}instructions{/highlight} na config para carregar arquivos de regras adicionais",
  "Defina a {highlight}temperature{/highlight} do agente de 0.0 (focado) a 1.0 (criativo)",
  "Configure {highlight}steps{/highlight} para limitar iterações agentivas por requisição",
  'Defina {highlight}"tools": {"bash": false}{/highlight} para desativar ferramentas específicas',
  'Defina {highlight}"mcp_*": false{/highlight} para desativar todas as ferramentas de um servidor MCP',
  "Sobrescreva as configurações globais de ferramentas por agente",
  "A permissão {highlight}doom_loop{/highlight} impede loops infinitos de chamadas de ferramentas",
  "A permissão {highlight}external_directory{/highlight} protege arquivos fora do projeto",
  "Execute {highlight}sploit debug config{/highlight} para diagnosticar a configuração",
  "Use a flag {highlight}--print-logs{/highlight} para ver logs detalhados no stderr",
  (shortcuts) => `Use ${commandText("/timeline", shortcuts.sessionTimeline())} para pular para mensagens específicas`,
  (shortcuts) => press(shortcuts.messagesToggleConceal(), "para alternar a visibilidade dos blocos de código nas mensagens"),
  (shortcuts) => `Use ${commandText("/status", shortcuts.statusView())} para ver as informações de status do sistema`,
  "Ative {highlight}scroll_acceleration{/highlight} em {highlight}tui.json{/highlight} para rolagem suave",
  (shortcuts) =>
    shortcuts.commandList()
      ? `Alterne a exibição do nome de usuário no chat pela paleta de comandos (${shortcutText(shortcuts.commandList())})`
      : "Alterne a exibição do nome de usuário no chat pela paleta de comandos",
  "Use {highlight}/connect{/highlight} com o OpenCode Zen para modelos selecionados e testados",
  "Faça commit do {highlight}AGENTS.md{/highlight} do seu projeto no Git para compartilhar com o time",
  "Use {highlight}/review{/highlight} para revisar mudanças não commitadas, branches ou PRs",
  (shortcuts) => `Use ${commandText("/help", shortcuts.helpShow())} para mostrar o diálogo de ajuda`,
  "Use {highlight}/rename{/highlight} para renomear a sessão atual",
  "O Sploit se auto-melhora: use {highlight}/retomar{/highlight} para continuar do próximo passo registrado em {highlight}SPLOIT_STATE.md{/highlight}",
  "Use {highlight}/atualizar{/highlight} para aplicar novas versões com segurança (backup + rollback automático)",
  "Depois de mudar {highlight}sploit.json{/highlight}, reinicie o Sploit — a config não é recarregada a quente",
  "Consulte o grafo do projeto com o MCP {highlight}graphify{/highlight} (ou {highlight}/graphify{/highlight}) antes de explorar o código",
  "Mudanças em {highlight}sploit-src{/highlight} exigem typecheck, build e reinício do binário para valerem",
]

const INPUT_UNDO_TIP: Tip = (shortcuts) => press(shortcuts.inputUndo(), "para desfazer alterações no seu prompt")
const TERMINAL_SUSPEND_TIP: Tip = (shortcuts) =>
  press(shortcuts.terminalSuspend(), "para suspender o terminal e voltar ao seu shell")
