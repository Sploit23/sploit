// sploit-conhecimento — Worker do Cloudflare para o conhecimento coletivo.
//
// O conhecimento (APRENDIZADO.md) vive em um KV persistente do Cloudflare —
// sobrevive a tudo (sono, reinicio, queda de qualquer PC). O servidor aqui
// so faz o papel de ponte HTTP:
//
//   GET  /aprendizado.md   -> qualquer PC baixa o conhecimento (sem senha)
//   POST /aprendizado.md   -> dono publica/atualiza o conhecimento (com senha)
//   GET  /licoes           -> dono consulta as licoes enviadas pelos PCs
//   POST /licoes           -> um PC envia uma licao nova (com senha)
//
// A senha vai no header "X-Senha" e e comparada com a secret SENHA do Worker
// (definida com `wrangler secret put SENHA`). Nada sensivel fica no codigo.

const CHAVE_CONHECIMENTO = "aprendizado"
const CHAVE_LICOES = "licoes"

function texto(body, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  })
}

function senhaOk(request, env) {
  if (!env.SENHA) return false
  const recebida = request.headers.get("X-Senha") || ""
  return recebida === env.SENHA
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const path = url.pathname
    const method = request.method

    // Baixar o conhecimento (publico — qualquer PC pode ler)
    if (method === "GET" && path === "/aprendizado.md") {
      const conteudo = (await env.CONHECIMENTO.get(CHAVE_CONHECIMENTO)) || ""
      return texto(conteudo)
    }

    // Publicar/atualizar o conhecimento (dono, com senha)
    if (method === "POST" && path === "/aprendizado.md") {
      if (!senhaOk(request, env)) return texto("senha invalida", 401)
      const corpo = await request.text()
      await env.CONHECIMENTO.put(CHAVE_CONHECIMENTO, corpo)
      return texto("ok: conhecimento atualizado")
    }

    // Consultar licoes pendentes (dono, com senha)
    if (method === "GET" && path === "/licoes") {
      if (!senhaOk(request, env)) return texto("senha invalida", 401)
      const conteudo = (await env.CONHECIMENTO.get(CHAVE_LICOES)) || ""
      return texto(conteudo)
    }

    // Enviar licao nova (qualquer PC, com senha compartilhada)
    if (method === "POST" && path === "/licoes") {
      if (!senhaOk(request, env)) return texto("senha invalida", 401)
      const corpo = await request.text()
      const anterior = (await env.CONHECIMENTO.get(CHAVE_LICOES)) || ""
      const marcador = `[${new Date().toISOString()}]`
      await env.CONHECIMENTO.put(CHAVE_LICOES, anterior + `\n${marcador} ${corpo}`)
      return texto("ok: licao recebida")
    }

    // Rota raiz: status simples (teste rapido)
    if (method === "GET" && path === "/") {
      return texto("sploit-conhecimento OK")
    }

    return texto("rota nao encontrada", 404)
  },
}
