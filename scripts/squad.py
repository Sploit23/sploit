#!/usr/bin/env python3
"""squad.py — CLI do modo squad (agentes persistentes por area do projeto).

Gerencia o squad de um projeto: configuracoes em <dir>/squad/squad.json,
conversa compartilhada em <dir>/squad/quadro.md e memorias por agente em
<dir>/squad/memoria/<nome>.md.

Comandos:
  init     Cria a estrutura do squad (idempotente; nao sobrescreve agentes).
  add      Adiciona um agente (nome, pasta, papel).
  post     Posta uma mensagem no quadro com timestamp.
  status   Mostra o feed (quadro) legivel.
  list     Lista os agentes do squad.
  check    Valida a integridade do squad.

Uso: python scripts/squad.py <comando> [opcoes]
Ex.: python scripts/squad.py init --projeto demo
     python scripts/squad.py add --nome Maria --pasta backend --papel "API"
     python scripts/squad.py post --nome Maria --estado feito --msg "endpoint no ar"
     python scripts/squad.py status
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

ESTADOS = ("feito", "pendente", "bloqueado")

SPRITE = [
    "  1111  ",
    " 111111 ",
    " 111111 ",
    "  1111  ",
    "   11   ",
    " 111111 ",
    " 11  11 ",
    " 111111 ",
]

PALETA = [
    ("#e11d48", "161"),
    ("#2563eb", "27"),
    ("#16a34a", "34"),
    ("#d97706", "214"),
    ("#7c3aed", "93"),
    ("#0891b2", "38"),
    ("#db2777", "199"),
    ("#65a30d", "112"),
]

SIMBOLO = {"feito": "\u2713", "pendente": "\u25cb", "bloqueado": "\u2715"}
ESTADO_COR = {"feito": "34", "pendente": "214", "bloqueado": "196"}

QUADRO_RE = re.compile(
    r"^\*\*\[(.+)\] \((feito|pendente|bloqueado)\) (.*?)\s+[-\u2014]\s+\[(.+)\]\*\*$"
)

HEADER = (
    "# Quadro do squad - {projeto}\n"
    "\n"
    "> Conversa compartilhada entre os agentes. Formato:\n"
    "> `[nome] (feito|pendente|bloqueado) mensagem - [data hora]`\n"
    "> O coordenador l\u00ea este quadro para ordenar o pr\u00f3ximo ciclo.\n"
    "\n"
    "---\n"
)


def now():
    return datetime.now().strftime("%d/%m/%Y %H:%M")


def squad_dir(base):
    return Path(base) / "squad"


def cfg_path(base):
    return squad_dir(base) / "squad.json"


def quadro_path(base):
    return squad_dir(base) / "quadro.md"


def memoria_path(base, nome):
    return squad_dir(base) / "memoria" / f"{nome}.md"


def load_cfg(base, criar=False):
    p = cfg_path(base)
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception as e:  # noqa: BLE001
            sys.exit(f"ERRO: squad.json invalido em {p}: {e}")
    if criar:
        return {"projeto": Path(base).name, "agentes": []}
    sys.exit(f"ERRO: squad nao existe em {base} (rode 'squad init' primeiro)")


def save_cfg(base, cfg):
    p = cfg_path(base)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(
        json.dumps(cfg, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def cmd_init(args):
    base = args.dir
    sdir = squad_dir(base)
    sdir.mkdir(parents=True, exist_ok=True)
    (sdir / "memoria").mkdir(exist_ok=True)
    p = cfg_path(base)
    if p.exists():
        cfg = load_cfg(base)
        print(f"ja existe: squad em {base} ({len(cfg.get('agentes', []))} agentes)")
        return 0
    save_cfg(base, {"projeto": args.projeto, "agentes": []})
    q = quadro_path(base)
    if not q.exists():
        q.write_text(HEADER.format(projeto=args.projeto), encoding="utf-8")
    print(f"squad iniciado em {base} (projeto {args.projeto})")
    return 0


def cmd_add(args):
    base = args.dir
    cfg = load_cfg(base, criar=True)
    nome = args.nome.strip()
    if not nome:
        sys.exit("ERRO: --nome e obrigatorio")
    if any(a["nome"] == nome for a in cfg.get("agentes", [])):
        sys.exit(f"ERRO: agente '{nome}' ja existe no squad")
    pasta = args.pasta.strip()
    if not pasta:
        sys.exit("ERRO: --pasta e obrigatoria")
    agente = {
        "nome": nome,
        "pasta": pasta,
        "papel": args.papel.strip() if args.papel else "",
        "criado": now(),
        "memoria": f"squad/memoria/{nome}.md",
    }
    cfg.setdefault("agentes", []).append(agente)
    save_cfg(base, cfg)
    mp = memoria_path(base, nome)
    if not mp.exists():
        mp.write_text(
            f"# Memoria de {nome} - agente de {pasta}\n\n> Dono da pasta "
            f"`{pasta}`. O que {nome} sabe sobre o projeto:\n- (vazio)\n",
            encoding="utf-8",
        )
    print(f"agente {nome} adicionado (pasta {pasta})")
    return 0


def cmd_post(args):
    base = args.dir
    cfg = load_cfg(base)
    nome = args.nome.strip()
    nomes = {a["nome"] for a in cfg.get("agentes", [])} | {"Coordenador"}
    if nome not in nomes:
        sys.exit(
            f"ERRO: '{nome}' nao e um agente do squad "
            f"({sorted(nomes - {'Coordenador'})})"
        )
    if args.estado not in ESTADOS:
        sys.exit(f"ERRO: --estado deve ser um de {ESTADOS}")
    msg = args.msg.strip()
    if not msg:
        sys.exit("ERRO: --msg e obrigatoria")
    q = quadro_path(base)
    if not q.exists():
        q.write_text(HEADER.format(projeto=cfg.get("projeto", Path(base).name)), encoding="utf-8")
    linha = f"**[{nome}] ({args.estado}) {msg} - [{now()}]**\n"
    with q.open("a", encoding="utf-8") as fh:
        fh.write(linha)
    print(linha.rstrip())
    return 0


def cmd_status(args):
    base = args.dir
    q = quadro_path(base)
    if not q.exists():
        sys.exit(f"ERRO: quadro nao existe em {base} (rode 'squad init')")
    linhas = q.read_text(encoding="utf-8").splitlines()
    for ln in linhas:
        if ln.startswith("**["):
            print(ln)
    return 0


def cmd_list(args):
    cfg = load_cfg(args.dir)
    if not cfg.get("agentes"):
        print("(nenhum agente)")
        return 0
    for a in cfg["agentes"]:
        papel = f" - {a['papel']}" if a.get("papel") else ""
        print(f"- {a['nome']}: {a['pasta']}{papel}")
    return 0


def cmd_check(args):
    base = args.dir
    ok = True
    cfg = load_cfg(base)
    for a in cfg.get("agentes", []):
        mp = memoria_path(base, a["nome"])
        if not mp.exists():
            ok = False
            print(f"FALTA memoria de {a['nome']}: {mp}")
    if not quadro_path(base).exists():
        ok = False
        print(f"FALTA quadro: {quadro_path(base)}")
    if not cfg_path(base).exists():
        ok = False
        print(f"FALTA config: {cfg_path(base)}")
    if ok:
        print(f"OK: squad de {base} consistente ({len(cfg.get('agentes', []))} agentes)")
    return 0 if ok else 1


def binario_sploit():
    """Localiza o binario do Sploit: junto ao script (repo) ou no PATH."""
    raiz = Path(__file__).resolve().parent.parent
    exe = raiz / "sploit.exe"
    if exe.exists():
        return str(exe)
    achou = shutil.which("sploit")
    return achou or "sploit"


def montar_prompt(base, cfg, a):
    nome = a["nome"]
    papel = a.get("papel", "")
    projeto = cfg.get("projeto", Path(base).name)
    pasta = Path(base) / a["pasta"]
    quadro = quadro_path(base)
    memoria = memoria_path(base, nome)
    sp = Path(__file__).resolve()
    return (
        f"Voce e {nome}, agente do squad do projeto \"{projeto}\""
        + (f" (papel: {papel})." if papel else ".")
        + "\n"
        + "\n"
        + "SEU LUGAR NESTA RODADA:\n"
        + f"- Pasta de trabalho: {pasta} (trabalhe SOMENTE aqui)\n"
        + f"- Quadro do squad (leia antes de tudo): {quadro}\n"
        + f"- Sua memoria de longo prazo (leia e atualize ao final): {memoria}\n"
        + "\n"
        + "PROCEDIMENTO:\n"
        + f"1. Leia o quadro. Encontre o ultimo post pendente atribuido a voce, "
        + f"da forma **[{{nome}}] (pendente) ...**. Se nao houver tarefa pendente "
        + f"para voce, responda apenas \"aguardando\" e pare (NAO poste nada).\n"
        + f"2. Execute a tarefa na sua pasta, com o codigo existente. NAO edite "
        + f"arquivos fora dela.\n"
        + f"3. Ao terminar, atualize sua memoria (append de 2-3 linhas: o que fez/aprendeu) "
        + f"e POSTE o resultado no quadro rodando via bash exatamente um destes:\n"
        + f"   - Sucesso:  python {sp} --dir {base} post --nome {nome} --estado feito --msg \"RESUMO\"\n"
        + f"   - Parcial:  python {sp} --dir {base} post --nome {nome} --estado pendente --msg \"RESUMO\"\n"
        + f"   - Impedido: python {sp} --dir {base} post --nome {nome} --estado bloqueado --msg \"MOTIVO\"\n"
        + "   Regras da mensagem: resuma em ate 20 palavras; NAO use aspas duplas nem $ nela.\n"
        + f"4. Encerre respondendo ao usuario com um resumo de 1-2 linhas.\n"
    )


def cmd_run(args):
    base = Path(args.dir).resolve()
    cfg = load_cfg(base)
    alvo = args.nome.strip() if args.nome else None
    alvos = [
        a
        for a in cfg.get("agentes", [])
        if alvo is None or a["nome"] == alvo
    ]
    if not alvos:
        sys.exit(f"ERRO: nenhum agente encontrado (alvo: {alvo or 'todos'})")
    exe = binario_sploit()
    logs = squad_dir(base) / "logs"
    logs.mkdir(parents=True, exist_ok=True)
    for a in alvos:
        nome = a["nome"]
        pasta = Path(base) / a["pasta"]
        pasta.mkdir(parents=True, exist_ok=True)
        prompt = montar_prompt(base, cfg, a)
        log = logs / f"{nome}.log"
        with log.open("wb") as fh:
            p = subprocess.Popen(
                [exe, "run", prompt, "--dir", str(pasta), "--continue", "--title", f"squad: {nome}"],
                stdout=fh,
                stderr=fh,
                creationflags=(
                    subprocess.CREATE_NEW_PROCESS_GROUP
                    | subprocess.CREATE_NO_WINDOW
                    | subprocess.DETACHED_PROCESS
                ),
            )
        print(f"lançado: {nome} (PID {p.pid}) -> {log}")
    print(f"{len(alvos)} agente(s) lançado(s); acompanhe com: squad view --watch")
    return 0


def cmd_supervisor(args):
    """Monitora o quadro: lança quem tem tarefa pendente e relança até a fila zerar."""
    base = Path(args.dir).resolve()
    cfg = load_cfg(base)
    exe = binario_sploit()
    logs = squad_dir(base) / "logs"
    logs.mkdir(parents=True, exist_ok=True)
    try:
        sys.stdout.reconfigure(line_buffering=True)
    except Exception:  # noqa: BLE001
        pass
    procs = {}
    marcas = {}
    tent = {}
    idle = 0
    print(f"supervisor ativo em {base} (intervalo {args.intervalo}s; Ctrl+C encerra)")
    try:
        while True:
            posts = parse_quadro(base)
            n = len(posts)
            lancou = False
            for a in cfg.get("agentes", []):
                nome = a["nome"]
                pp = procs.get(nome)
                if pp is not None:
                    rc = pp.poll()
                    if rc is None:
                        continue
                    del procs[nome]
                    if tarefa_pendente(posts, nome)[0] is None:
                        tent[nome] = 0
                    print(f"[{now()}] {nome} terminou (exit {rc})")
                    continue
                tp, _ = tarefa_pendente(posts, nome)
                if tp is None:
                    continue
                if marcas.get(nome) == n:
                    continue
                if tent.get(nome, 0) >= 3:
                    print(f"[{now()}] {nome}: tentativas esgotadas, tarefa orfa")
                    continue
                pasta = Path(base) / a["pasta"]
                pasta.mkdir(parents=True, exist_ok=True)
                prompt = montar_prompt(base, cfg, a)
                log = logs / f"{nome}.log"
                fh = log.open("ab")
                pp = subprocess.Popen(
                    [exe, "run", prompt, "--dir", str(pasta), "--continue", "--title", f"squad: {nome}"],
                    stdout=fh,
                    stderr=fh,
                    creationflags=(subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NO_WINDOW),
                )
                procs[nome] = pp
                marcas[nome] = n
                tent[nome] = tent.get(nome, 0) + 1
                lancou = True
                print(f"[{now()}] {nome} lancado (PID {pp.pid}, tentativa {tent[nome]})")
            if procs or lancou:
                idle = 0
            else:
                idle += 1
                if idle >= 3:
                    pend = [
                        a["nome"]
                        for a in cfg.get("agentes", [])
                        if tarefa_pendente(posts, a["nome"])[0] is not None
                    ]
                    msg = "fila vazia; supervisor encerrando"
                    if pend:
                        msg += f" (orfas: {pend})"
                    print(f"[{now()}] {msg}")
                    break
            time.sleep(args.intervalo)
    except KeyboardInterrupt:
        print("\nsupervisor encerrado pelo usuario")
    return 0


def cor_agente(nome):
    if nome == "Coordenador":
        return ("#94a3b8", "250")
    idx = sum(ord(c) for c in nome) % len(PALETA)
    return PALETA[idx]


def cores_agentes(agentes):
    cores = {"Coordenador": ("#94a3b8", "250")}
    usadas = set()
    for a in agentes:
        nome = a["nome"]
        idx = sum(ord(c) for c in nome) % len(PALETA)
        while idx in usadas:
            idx = (idx + 1) % len(PALETA)
        usadas.add(idx)
        cores[nome] = PALETA[idx]
    return cores


def parse_quadro(base):
    q = quadro_path(base)
    if not q.exists():
        return []
    posts = []
    for ln in q.read_text(encoding="utf-8").splitlines():
        m = QUADRO_RE.match(ln)
        if m:
            posts.append(
                {
                    "nome": m.group(1),
                    "estado": m.group(2),
                    "msg": m.group(3),
                    "data": m.group(4),
                }
            )
    return posts


def ultimo_post(posts, nome):
    for p in reversed(posts):
        if p["nome"] == nome:
            return p
    return None


def tarefa_pendente(posts, nome):
    """Último post pendente em aberto: é do agente ou o menciona ('Nome: ...')
    e NÃO há resposta do agente depois dele (senão já foi tratado)."""
    rx = re.compile(re.escape(nome) + r"\s*:")
    for i in range(len(posts) - 1, -1, -1):
        p = posts[i]
        if p["estado"] != "pendente":
            continue
        if p["nome"] != nome and not rx.search(p["msg"]):
            continue
        if any(q["nome"] == nome for q in posts[i + 1 :]):
            continue
        return p, i
    return None, -1


def estado_agente(posts, nome):
    """Estado do agente no palco: trabalhando (pendente) se há tarefa em aberto."""
    up = ultimo_post(posts, nome)
    tp, i_tp = tarefa_pendente(posts, nome)
    i_up = posts.index(up) if up else -1
    if tp is not None and i_tp >= i_up:
        return "pendente", tp["msg"]
    if up:
        return up["estado"], up["msg"]
    return "pendente", "aguardando"


def ansi(cod, texto):
    return f"\x1b[38;5;{cod}m{texto}\x1b[0m"


def render_boneco_terminal(cor_ansi):
    linhas = []
    for row in SPRITE:
        out = ""
        for ch in row:
            if ch == "1":
                out += ansi(cor_ansi, "\u2588")
            else:
                out += " "
        linhas.append(out)
    return linhas


def construir_palco(cfg, posts, base=""):
    L = []
    projeto = cfg.get("projeto", Path(base).name if base else "?")
    titulo = f"SQUAD \u00b7 {projeto}"
    L.append("\x1b[1m" + titulo + "\x1b[0m")
    L.append("-" * 64)

    agentes = cfg.get("agentes", [])
    cores = cores_agentes(agentes)
    if not agentes:
        L.append("(nenhum agente no squad)")
    else:
        blocos = []
        for a in agentes:
            nome = a["nome"]
            hexc, ansi_c = cores.get(nome, cor_agente(nome))
            estado, acao = estado_agente(posts, nome)
            simb = SIMBOLO.get(estado, "\u25cb")
            if len(acao) > 24:
                acao = acao[:23] + "\u2026"
            b = render_boneco_terminal(ansi_c)
            b.append(ansi(ansi_c, nome))
            b.append(a["pasta"])
            b.append(ansi(ESTADO_COR.get(estado, "214"), f"{simb} {estado}"))
            b.append("   " + acao)
            blocos.append(b)
        altura = len(blocos[0])
        for i in range(altura):
            L.append("   ".join(b[i] for b in blocos))

    L.append("-" * 64)
    L.append("\x1b[1mConversa (quadro)\x1b[0m")
    for p in posts[-8:]:
        hexc, ansi_c = cores.get(p["nome"], cor_agente(p["nome"]))
        L.append(
            f"{ansi(ansi_c, p['nome'] + ':')} {p['msg']} "
            f"[{p['data']}]"
        )
    L.append("-" * 64)
    L.append("squad view --watch | squad web --port 4199")
    return "\n".join(L) + "\n"


def cmd_view(args):
    base = args.dir
    cfg = load_cfg(base)
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:  # noqa: BLE001
        pass
    if os.name == "nt":
        os.system("")
    try:
        while True:
            if args.watch:
                os.system("cls" if os.name == "nt" else "clear")
            sys.stdout.write(construir_palco(cfg, parse_quadro(base), base))
            if not args.watch:
                return 0
            time.sleep(args.intervalo)
    except KeyboardInterrupt:
        return 0


def dados_api(base, cfg):
    posts = parse_quadro(base)
    agentes = cfg.get("agentes", [])
    cores = cores_agentes(agentes)
    lista = []
    for a in agentes:
        nome = a["nome"]
        hexc, _ = cores.get(nome, cor_agente(nome))
        status, acao = estado_agente(posts, nome)
        lista.append(
            {
                "nome": nome,
                "pasta": a["pasta"],
                "papel": a.get("papel", ""),
                "cor": hexc,
                "status": status,
                "acao": acao,
            }
        )
    return {"projeto": cfg.get("projeto", Path(base).name), "agentes": lista, "posts": posts}


PAGINA_HTML = """<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SQUAD</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #0f172a; color: #e2e8f0;
         font-family: ui-monospace, Consolas, monospace; padding: 24px; }
  h1 { margin: 0 0 4px; font-size: 18px; }
  .sub { color: #64748b; font-size: 12px; margin-bottom: 20px; }
  .time { color: #64748b; font-size: 11px; }
  .palco { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 24px; }
  .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px;
          padding: 14px 16px; min-width: 190px; }
  .card .boneco { text-align: center; margin-bottom: 6px; }
  .card .nome { font-weight: bold; font-size: 15px; }
  .card .pasta { color: #94a3b8; font-size: 12px; }
  .card .status { font-size: 12px; margin: 6px 0; }
  .card .acao { font-size: 11px; color: #cbd5e1; background: #0f172a;
                border-radius: 8px; padding: 6px 8px; min-height: 30px; }
  .card.trabalhando { border-color: #facc15; box-shadow: 0 0 0 1px #facc15; }
  .card.trabalhando .acao::after { content: " ..."; animation: pisca 1s steps(2) infinite; }
  @keyframes pisca { 50% { opacity: 0; } }
  .feed { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 16px; }
  .feed .linha { padding: 6px 0; border-bottom: 1px solid #1e293b; font-size: 13px; }
  .feed .linha:last-child { border-bottom: none; }
  .feed .est { font-size: 11px; color: #64748b; }
</style>
</head>
<body>
<h1>SQUAD</h1>
<div class="sub" id="sub">carregando...</div>
<div class="palco" id="palco"></div>
<div class="feed" id="feed"></div>
<script>
const SPRITE = [
  "  1111  ", " 111111 ", " 111111 ", "  1111  ",
  "   11   ", " 111111 ", " 11  11 ", " 111111 ",
];
function boneco(canvas, cor) {
  const px = 5, w = 8 * px, h = 8 * px;
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, w, h);
  SPRITE.forEach((linha, y) => {
    [...linha].forEach((ch, x) => {
      if (ch === "1") { ctx.fillStyle = cor; ctx.fillRect(x * px, y * px, px, px); }
    });
  });
}
const SIMB = { feito: "✓", pendente: "○", bloqueado: "✕", aguardando: "○" };
async function tick() {
  try {
    const r = await fetch("/api");
    if (!r.ok) throw new Error(r.status);
    const d = await r.json();
    document.getElementById("sub").textContent =
      "SQUAD · " + d.projeto + " — " + d.agentes.length + " agentes";
    const palco = document.getElementById("palco");
    palco.innerHTML = "";
    for (const a of d.agentes) {
      const c = document.createElement("div");
      c.className = "card" + (a.status === "pendente" ? " trabalhando" : "");
      const cv = document.createElement("canvas");
      cv.className = "boneco";
      c.innerHTML =
        "<div class='boneco'></div>" +
        "<div class='nome' style='color:" + a.cor + "'>" + a.nome + "</div>" +
        "<div class='pasta'>" + a.pasta + (a.papel ? " · " + a.papel : "") + "</div>" +
        "<div class='status'>" + SIMB[a.status] + " " + a.status + "</div>" +
        "<div class='acao'></div>";
      c.querySelector(".boneco").appendChild(cv);
      c.querySelector(".acao").textContent = a.acao;
      boneco(cv, a.cor);
      palco.appendChild(c);
    }
    const feed = document.getElementById("feed");
    feed.innerHTML = d.posts.slice(-10).map(p =>
      "<div class='linha'><b>" + p.nome + "</b> <span class='est'>[" + p.estado + "]</span> " +
      p.msg + " <span class='time'>" + p.data + "</span></div>"
    ).join("");
  } catch (e) { /* servidor ainda subindo */ }
}
tick();
setInterval(tick, 2000);
</script>
</body>
</html>
"""


def cmd_web(args):
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

    base = args.dir
    cfg = load_cfg(base)

    class Handler(BaseHTTPRequestHandler):
        def _send(self, code, ctype, body):
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path in ("/api", "/api/"):
                data = json.dumps(dados_api(base, cfg), ensure_ascii=False).encode("utf-8")
                self._send(200, "application/json; charset=utf-8", data)
            elif self.path == "/favicon.ico":
                self._send(204, "text/plain", b"")
            else:
                self._send(200, "text/html; charset=utf-8", PAGINA_HTML.encode("utf-8"))

        def log_message(self, *a):  # noqa: D401
            pass

    srv = ThreadingHTTPServer(("0.0.0.0", args.port), Handler)
    print(f"SQUAD web em http://localhost:{args.port} (Ctrl+C para encerrar)")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        return 0
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(prog="squad.py", description="CLI do modo squad")
    ap.add_argument("--dir", default=".", help="diretorio do projeto (padrao: .)")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("init", help="cria a estrutura do squad")
    p.add_argument("--projeto", default=None, help="nome do projeto")

    p = sub.add_parser("add", help="adiciona um agente")
    p.add_argument("--nome", required=True)
    p.add_argument("--pasta", required=True)
    p.add_argument("--papel", default="")

    p = sub.add_parser("post", help="posta no quadro")
    p.add_argument("--nome", required=True)
    p.add_argument("--estado", choices=ESTADOS, default="feito")
    p.add_argument("--msg", required=True)

    for c in ("status", "list", "check"):
        sub.add_parser(c, help=f"{c} do squad")

    p = sub.add_parser("view", help="palco do squad no terminal")
    p.add_argument("--watch", action="store_true", help="atualiza a cada --intervalo s")
    p.add_argument("--intervalo", type=float, default=2.0)

    p = sub.add_parser("web", help="palco do squad na web (HTML + API)")
    p.add_argument("--port", type=int, default=4199)

    p = sub.add_parser("run", help="lança os agentes como sessões headless do Sploit")
    p.add_argument("--nome", default="", help="agente específico (padrão: todos)")

    p = sub.add_parser("supervisor", help="monitora o quadro e relança agentes até a fila zerar")
    p.add_argument("--intervalo", type=float, default=5.0, help="checagem em segundos (padrão: 5)")

    args = ap.parse_args(argv)

    if args.cmd == "init":
        if not args.projeto:
            args.projeto = Path(args.dir).name
        return cmd_init(args)
    if args.cmd == "add":
        return cmd_add(args)
    if args.cmd == "post":
        return cmd_post(args)
    if args.cmd == "status":
        return cmd_status(args)
    if args.cmd == "list":
        return cmd_list(args)
    if args.cmd == "check":
        return cmd_check(args)
    if args.cmd == "view":
        return cmd_view(args)
    if args.cmd == "web":
        return cmd_web(args)
    if args.cmd == "run":
        return cmd_run(args)
    if args.cmd == "supervisor":
        return cmd_supervisor(args)
    return 0


if __name__ == "__main__":
    sys.exit(main())
