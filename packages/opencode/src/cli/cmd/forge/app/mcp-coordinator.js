// Servidor MCP que o FORGE expõe pra qualquer CLI oficial (opencode ou
// Claude Code) conectar como MCP remoto -- ver ensureCoordinatorMcpConfig
// em server.js, que grava isso no opencode.json/.mcp.json de .coordinator.
// Sem fork, sem `--agent` especial: a partir do momento que o CLI tem essa
// config, uma sessão normal (`opencode --continue`/`claude --continue`) já
// ganha as 3 ferramentas abaixo, iguais em qualquer máquina do mesh.
//
// Dispatch local e remoto são tratados igual de propósito: ambos batem em
// POST /api/coordinator/prompt (local em 127.0.0.1, remoto em
// https://<device>), nunca chamando uma função de server.js direto -- isso
// evita acoplamento entre os dois arquivos e mantém o /mcp testável sozinho
// (um curl com o protocolo certo já exercita tudo, sem precisar do resto).
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { z } = require('zod');

async function fetchJson(url, token, opts) {
  try {
    const res = await fetch(url, { ...opts, headers: { Authorization: 'Bearer ' + token, ...(opts && opts.headers) }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return undefined;
    return await res.json();
  } catch { return undefined; }
}

// descoberta ao vivo: este FORGE + todo FORGE já anunciado (ver
// /api/known-devices em server.js) -- nunca precisa registrar nada na mão,
// todo projeto de toda máquina do mesh já aparece aqui.
async function listAllProjects(ctx) {
  const out = [];
  const local = await fetchJson(`http://127.0.0.1:${ctx.port}/api/projects`, ctx.token);
  for (const p of local || []) out.push({ alias: p.name, directory: p.path, machine: 'local' });
  const known = await fetchJson(`http://127.0.0.1:${ctx.port}/api/known-devices`, ctx.token);
  for (const d of known || []) {
    const remote = await fetchJson(`https://${d.dnsName}/api/projects`, d.token);
    for (const p of remote || []) out.push({ alias: p.name, directory: p.path, machine: d.dnsName, token: d.token });
  }
  return out;
}

function createMcpServer(ctx) {
  const server = new McpServer({ name: 'sploit-forge', version: '1.0.0' });

  server.registerTool('list_projects', {
    description: 'Lista todo projeto conhecido em todas as máquinas Sploit-Forge na rede (esta e as outras já anunciadas), cada um marcado com a máquina onde vive ("local" ou o hostname).',
    inputSchema: {},
  }, async () => {
    const entries = await listAllProjects(ctx);
    const text = entries.length === 0
      ? '(nenhum projeto encontrado)'
      : entries.map(e => `${e.alias} -> ${e.machine === 'local' ? '' : `[${e.machine}] `}${e.directory}`).join('\n');
    return { content: [{ type: 'text', text }] };
  });

  server.registerTool('dispatch', {
    description: "Envia uma instrução em linguagem natural pra sessão de outro projeto -- funciona igual esteja o projeto nesta máquina ou em outra do Sploit-Forge (resolvido automaticamente via list_projects). Reaproveita a sessão existente daquele projeto ou cria uma nova. Use pra 'continuar/trabalhar/ajustar o projeto X' -- não pra mover arquivos entre máquinas (use transfer_project).",
    inputSchema: { project: z.string(), instruction: z.string() },
  }, async ({ project, instruction }) => {
    const entries = await listAllProjects(ctx);
    const entry = entries.find(e => e.alias === project);
    if (!entry) {
      const names = entries.map(e => e.alias).join(', ') || '(nenhum)';
      return { content: [{ type: 'text', text: `Projeto "${project}" não encontrado. Conhecidos: ${names}` }], isError: true };
    }
    const base = entry.machine === 'local' ? `http://127.0.0.1:${ctx.port}` : `https://${entry.machine}`;
    const token = entry.machine === 'local' ? ctx.token : entry.token;
    try {
      const res = await fetch(`${base}/api/coordinator/prompt`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: entry.directory, instruction }),
        signal: AbortSignal.timeout(120000),
      });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      return { content: [{ type: 'text', text: j.reply || '(sem resposta)' }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `"${project}" (${entry.machine}) falhou: ${String(e.message || e)}` }], isError: true };
    }
  });

  server.registerTool('transfer_project', {
    description: "Move os arquivos de um projeto inteiro de uma máquina Sploit-Forge pra outra. Use pra 'mandar/mover/copiar o projeto X pra máquina Y' -- não pra despachar uma instrução (use dispatch).",
    inputSchema: { alias: z.string(), toMachine: z.string() },
  }, async ({ alias, toMachine }) => {
    const entries = await listAllProjects(ctx);
    const entry = entries.find(e => e.alias === alias);
    if (!entry) return { content: [{ type: 'text', text: `Projeto "${alias}" não encontrado.` }], isError: true };
    const known = (await fetchJson(`http://127.0.0.1:${ctx.port}/api/known-devices`, ctx.token)) || [];
    const dest = known.find(m => m.hostname === toMachine || m.dnsName === toMachine || m.dnsName.startsWith(toMachine + '.'));
    if (!dest) {
      const names = known.map(m => m.hostname).join(', ') || '(nenhuma)';
      return { content: [{ type: 'text', text: `Máquina "${toMachine}" não encontrada. Conhecidas: ${names}` }], isError: true };
    }
    const sourceBase = entry.machine === 'local' ? `http://127.0.0.1:${ctx.port}` : `https://${entry.machine}`;
    const sourceToken = entry.machine === 'local' ? ctx.token : entry.token;
    try {
      const res = await fetch(`${sourceBase}/api/relay-send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sourceToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: entry.directory, targetUrl: `https://${dest.dnsName}`, targetToken: dest.token, name: entry.alias }),
        signal: AbortSignal.timeout(120000),
      });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      return { content: [{ type: 'text', text: `"${alias}" transferido de ${entry.machine === 'local' ? 'esta máquina' : entry.machine} pra ${dest.hostname}.` }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Transferência de "${alias}" falhou: ${String(e.message || e)}` }], isError: true };
    }
  });

  return server;
}

// uma instância de McpServer+transport por requisição (modo stateless do
// SDK -- sessionIdGenerator: undefined) -- sem estado pra gerenciar entre
// chamadas, condizente com o resto do FORGE (tudo request/response simples).
async function handleMcpRequest(req, res, ctx) {
  const server = createMcpServer(ctx);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => { void transport.close(); void server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res);
}

module.exports = { handleMcpRequest };
