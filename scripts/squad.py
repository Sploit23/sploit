#!/usr/bin/env python3
"""squad.py — CLI do modo squad (agentes persistentes por area do projeto).

Gerencia o squad de um projeto: configuracoes em <dir>/squad/squad.json,
conversa compartilhada em <dir>/squad/quadro.md e memorias por agente em
<dir>/squad/memoria/<nome>.md.

Campos opcionais do squad.json (nao quebram squads existentes se ausentes):
  "verificar": comando de shell (ex.: "bun test") que o supervisor roda
      no diretorio do projeto antes de declarar a fila concluida.
  "integrador": nome de um agente do squad que recebe uma tarefa pendente
      automatica quando "verificar" falha, pra corrigir a integracao.
      Sem "integrador", uma falha de "verificar" so bloqueia e avisa
      (precisa de humano).

Comandos:
  init     Cria a estrutura do squad (idempotente; nao sobrescreve agentes).
  add      Adiciona um agente (nome, pasta, papel).
  create   Wizard guiado e colorido: cria o time de agentes passo a passo.
  post     Posta uma mensagem no quadro com timestamp.
  status   Mostra o feed (quadro) legivel.
  list     Lista os agentes do squad.
  check    Valida a integridade do squad.
  daily    Daily/standup: resumo do trabalho de cada agente em um dia.
  dashboard Painel consolidado do time (visao geral + por agente + atividade 24h
           + timeline das entregas do dia; --salvar grava squad/dashboard.md).

Uso: python scripts/squad.py <comando> [opcoes]
Ex.: python scripts/squad.py init --projeto demo
     python scripts/squad.py add --nome Maria --pasta backend --papel "API"
     python scripts/squad.py create
     python scripts/squad.py post --nome Maria --estado feito --msg "endpoint no ar"
     python scripts/squad.py status
     python scripts/squad.py daily --data 11/08/2026
     python scripts/squad.py dashboard --salvar
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

ESTADOS = ("feito", "pendente", "bloqueado")

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, ValueError):
    pass

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


def cmd_create(args):
    """Wizard guiado e colorido de criacao do time de agentes."""
    base = Path(args.dir)
    base.mkdir(parents=True, exist_ok=True)
    if os.name == "nt":
        os.system("")
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:  # noqa: BLE001
        pass

    def perguntar(rotulo, padrao="", obrigatorio=False, cor="214"):
        try:
            resposta = input(f"  {ansi(cor, rotulo)}: ").strip()
        except EOFError:
            resposta = ""
        if not resposta and padrao:
            resposta = padrao
        if obrigatorio and not resposta:
            print(f"  {ansi('196', '  (!) obrigatorio')}")
            return perguntar(rotulo, padrao, obrigatorio, cor)
        return resposta

    print()
    print(f"  {ansi('38', '╔══════════════════════════════════════════╗')}")
    print(f"  {ansi('38', '║')}  {ansi('226', '◢ SQUAD')} {ansi('250', '— monte o seu time de agentes')}   {ansi('38', '║')}")
    print(f"  {ansi('38', '╚══════════════════════════════════════════╝')}")
    print()

    projeto = perguntar("Nome do projeto", padrao=base.name, cor="226")
    try:
        quantidade = int(perguntar("Quantos agentes", padrao="2", obrigatorio=True, cor="226"))
        if quantidade < 1 or quantidade > 12:
            raise ValueError
    except ValueError:
        print(f"  {ansi('196', '(!) digite um numero entre 1 e 12')}")
        return 1

    time = []
    cores = list(PALETA)
    for i in range(1, quantidade + 1):
        print(f"  {ansi('250', f'── agente {i} de {quantidade} ──')}")
        pasta = perguntar("Pasta do agente (ex.: frontend)", obrigatorio=True, cor="38")
        nome = perguntar("Nome do agente (ex.: Ana)", obrigatorio=True, cor="226")
        papel = perguntar("Papel (ex.: telas e visual; Enter = vazio)", padrao="", cor="112")
        time.append({"nome": nome, "pasta": pasta, "papel": papel})
        print()

    cores_nome = cores_agentes([{"nome": a["nome"]} for a in time])
    print(f"  {ansi('38', '╔══════════════════════════════════════════════════════════╗')}")
    print(f"  {ansi('38', '║')}  {ansi('226', 'RESUMO DO TIME')}  {ansi('250', f'· {projeto}')} "
          f"{ansi('38', '─' * (42 - len(projeto)))} {ansi('38', '║')}")
    for a in time:
        hexc, ansi_c = cores_nome.get(a["nome"], cor_agente(a["nome"]))
        badge = f"[{a['papel']}]" if a.get("papel") else ""
        print(f"  {ansi('38', '║')}  {ansi(ansi_c, '● ' + a['nome']):<14} "
              f"{ansi('250', a['pasta']):<22} {ansi('112', badge)}")
    print(f"  {ansi('38', '╚══════════════════════════════════════════════════════════╝')}")
    print()

    try:
        ok = perguntar("Criar o time agora? (s/N)", padrao="n", cor="34").lower()
    except EOFError:
        ok = ""
    if ok != "s":
        print("  cancelado, nada foi criado")
        return 0

    cmd_init(
        argparse.Namespace(
            dir=str(base), projeto=projeto,
        )
    )
    for a in time:
        cmd_add(
            argparse.Namespace(
                dir=str(base), nome=a["nome"], pasta=a["pasta"], papel=a["papel"],
            )
        )
        (base / a["pasta"]).mkdir(parents=True, exist_ok=True)

    nomes = ", ".join(f"{a['nome']} ({a['pasta']})" for a in time)
    cmd_post(
        argparse.Namespace(
            dir=str(base), nome="Coordenador", estado="feito",
            msg=f"time formado: {nomes}",
        )
    )

    print()
    for a in time:
        hexc, ansi_c = cores_nome.get(a["nome"], cor_agente(a["nome"]))
        print(f"  {ansi('34', '✓')} {ansi(ansi_c, a['nome'])} "
              f"{ansi('250', f'pronto — pasta {a["pasta"]}')}")
    print(f"  {ansi('34', 'time de')} {ansi('226', str(quantidade))} "
          f"{ansi('34', 'agentes formado em')} {ansi('226', str(base))}")
    print(f"  {ansi('250', 'lance as tarefas com:')} "
          f"{ansi('38', 'python scripts/squad.py --dir <projeto> post --nome <agente> --estado pendente --msg \"...\"')}")
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
    if args.estado == "pendente" and not supervisor_ativo(base):
        pid = lancar_supervisor_auto(base)
        print(f"supervisor auto-lançado (PID {pid}) — squad/logs/supervisor.log")
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


POST_INICIO_RE = re.compile(r"^\*\*\[?[^\]:(]*\]?\s*\([^)]*\)")


def posts_malformados(base):
    """Linhas que ABREM como um post (comecam com ** [Nome] (algo)) mas a
    linha inteira nao bate com QUADRO_RE - o parser ignora elas em silencio.
    Cobre os dois jeitos mais comuns de isso acontecer: estado inventado
    (ex. "delegado" em vez de pendente/feito/bloqueado) ou mensagem que virou
    varias linhas (ex. bloco de codigo colado sem virar uma linha so).
    Retorna [(numero_da_linha, linha)]."""
    q = quadro_path(base)
    if not q.exists():
        return []
    achados = []
    for i, ln in enumerate(q.read_text(encoding="utf-8").splitlines(), start=1):
        if QUADRO_RE.match(ln):
            continue
        if POST_INICIO_RE.match(ln):
            achados.append((i, ln))
    return achados


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
    for numero, ln in posts_malformados(base):
        ok = False
        print(
            f"POST INVALIDO (ignorado pelo parser em silencio) na linha "
            f"{numero} do quadro: {ln.strip()[:100]}"
        )
        print(
            "  -> confira se o estado e exatamente feito/pendente/bloqueado "
            "(nada de 'delegado' etc.) e se a mensagem inteira ficou numa "
            "unica linha terminando em '- [dd/mm/aaaa hh:mm]**'"
        )
    if ok:
        print(f"OK: squad de {base} consistente ({len(cfg.get('agentes', []))} agentes)")
    return 0 if ok else 1


def cmd_daily(args):
    """Daily/standup: resumo do trabalho de cada agente em um dia (do quadro)."""
    base = Path(args.dir).resolve()
    cfg = load_cfg(base)
    projeto = cfg.get("projeto", base.name)
    posts = parse_quadro(base)
    if not posts:
        sys.exit(f"ERRO: quadro vazio em {base}")
    data_alvo = args.data or datetime.now().strftime("%d/%m/%Y")
    hoje = [p for p in posts if p["data"].startswith(data_alvo)]
    agentes = cfg.get("agentes", [])
    cores = cores_agentes(agentes)

    def cor_nome(nome):
        c = cores.get(nome)
        return ansi(c[1], nome) if c else nome

    print()
    print(f"  {ansi('226', 'DAILY')} {ansi('250', '· ' + projeto + ' · ' + data_alvo)}")
    print(f"  {ansi('38', '─' * 58)}")
    total_feito = total_pend = total_bloq = 0
    for a in agentes:
        nome = a["nome"]
        papel = f" ({a['papel']})" if a.get("papel") else ""
        ps = [p for p in hoje if p["nome"] == nome]
        feito = [p for p in ps if p["estado"] == "feito"]
        pend = [p for p in ps if p["estado"] == "pendente"]
        bloq = [p for p in ps if p["estado"] == "bloqueado"]
        total_feito += len(feito)
        total_pend += len(pend)
        total_bloq += len(bloq)
        plural = lambda n: "s" if n != 1 else ""  # noqa: E731
        resumo = (
            f"{len(feito)} entrega{plural(len(feito))}"
            f" · {len(pend)} pendência{plural(len(pend))}"
            f" · {len(bloq)} bloqueio{plural(len(bloq))}"
        )
        print(f"  {cor_nome(nome)}{ansi('250', papel)} — {ansi('250', resumo)}")
        vistos = feito + pend + bloq
        for p in vistos[:4]:
            simb = SIMBOLO[p["estado"]]
            cor = ESTADO_COR[p["estado"]]
            msg = p["msg"] if len(p["msg"]) <= 78 else p["msg"][:75] + "..."
            print(f"    {ansi(cor, simb)} {msg}")
        if not vistos:
            print(f"    {ansi('250', '—')} nenhuma atividade hoje")
        tp, _ = tarefa_pendente(posts, nome)
        if tp is not None and not any(q["estado"] == "pendente" for q in ps):
            print(f"    {ansi('214', '○')} tarefa em aberto: {tp['msg']}")
    print(f"  {ansi('38', '─' * 58)}")
    tot = (
        f"Total: {total_feito} entrega{plural(total_feito)}"
        f" · {total_pend} pendência{plural(total_pend)}"
        f" · {total_bloq} bloqueio{plural(total_bloq)}"
    )
    print(f"  {ansi('250', tot)}")
    if hoje:
        horas = [0] * 24
        for p in hoje:
            try:
                horas[int(p["data"].split()[1].split(":")[0])] += 1
            except (ValueError, IndexError):
                pass
        mx = max(horas) or 1
        chars = "\u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588"
        spark = "".join(chars[int(h / mx * 7.99)] if h else "\u00b7" for h in horas)
        spark = spark.strip("\u00b7")
        print(f"  {ansi('250', 'Atividade por hora:')} {ansi('112', spark)}")
    print()
    return 0


def sparkline_24h(posts):
    """Sparkline das ultimas 24h a partir do post mais recente do quadro."""
    horarios = []
    for p in posts:
        try:
            horarios.append(datetime.strptime(p["data"], "%d/%m/%Y %H:%M"))
        except ValueError:
            continue
    if not horarios:
        return ""
    fim = max(horarios)
    inicio = fim - timedelta(hours=23)
    buckets = [0] * 24
    for h in horarios:
        i = int((h - inicio).total_seconds() // 3600)
        i = max(0, min(23, i))
        buckets[i] += 1
    mx = max(buckets) or 1
    chars = "\u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588"
    out = "".join(chars[int(n / mx * 7.99)] if n else "\u00b7" for n in buckets)
    return out.strip("\u00b7")


def cmd_dashboard(args):
    """Painel consolidado do time (dashboard da 'empresa')."""
    base = Path(args.dir).resolve()
    cfg = load_cfg(base)
    projeto = cfg.get("projeto", base.name)
    posts = parse_quadro(base)
    if not posts:
        sys.exit(f"ERRO: quadro vazio em {base}")
    agentes = cfg.get("agentes", [])
    cores = cores_agentes(agentes)
    hoje = datetime.now().strftime("%d/%m/%Y")
    posts_hoje = [p for p in posts if p["data"].startswith(hoje)]
    if os.name == "nt":
        os.system("")

    def cor_nome(nome):
        c = cores.get(nome)
        return ansi(c[1], nome) if c else nome

    largura = 66
    linhas = []
    linhas.append("")
    linhas.append(f"  {ansi('38', '\u2550' * largura)}")
    titulo = f"\u25e2 SQUAD \u00b7 {projeto} \u00b7 DASHBOARD"
    espaco = " " * max(1, largura - len(titulo) - 2)
    linhas.append(f"  {ansi('38', '\u2551')} {ansi('226', titulo)}{espaco}{ansi('38', '\u2551')}")
    linhas.append(f"  {ansi('38', '\u2550' * largura)}")

    entregas = sum(1 for p in posts if p["estado"] == "feito")
    bloqueados = sum(1 for p in posts if p["estado"] == "bloqueado")
    pendencias_abertas = sum(
        1 for a in agentes if tarefa_pendente(posts, a["nome"])[0] is not None
    )
    ultima = posts[-1]["data"][-5:] if posts else "\u2014"
    linhas.append(f"  {ansi('250', 'VIS\u00c3O GERAL')}")
    linhas.append(
        f"  {ansi('250', 'entregas')} {ansi('34', str(entregas))}"
        f"  {ansi('250', 'pend\u00eancias em aberto')} {ansi('214', str(pendencias_abertas))}"
        f"  {ansi('250', 'bloqueios')} {ansi('196', str(bloqueados))}"
        f"  {ansi('250', '\u00faltima atividade')} {ansi('112', ultima)}"
    )

    linhas.append(f"  {ansi('38', '\u2500' * largura)}")
    for a in agentes:
        nome = a["nome"]
        papel = f" ({a['papel']})" if a.get("papel") else ""
        tot = sum(1 for p in posts if p["nome"] == nome and p["estado"] == "feito")
        hoje_n = sum(1 for p in posts_hoje if p["nome"] == nome and p["estado"] == "feito")
        est, acao = estado_agente(posts, nome)
        if est == "pendente" and acao == "aguardando":
            rot = "ocioso"
        else:
            rot = {"feito": "pronto", "pendente": "na fila", "bloqueado": "bloqueado"}[est]
        simb = SIMBOLO[est] if est in SIMBOLO else "\u25cb"
        cor = ESTADO_COR.get(est, "214")
        pl_tot = "s" if tot != 1 else ""
        pl_hoje = "s" if hoje_n != 1 else ""
        linhas.append(
            f"  {ansi(cor, simb)} {cor_nome(nome)}{ansi('250', papel)}"
            f" {ansi('250', f'\u2014 {tot} entrega{pl_tot} \u00b7 hoje {hoje_n} \u00b7 {rot}')}"
        )
        up = ultimo_post(posts, nome)
        if up:
            msg = up["msg"] if len(up["msg"]) <= 64 else up["msg"][:61] + "..."
            linhas.append(f"    {ansi('250', '\u21b3')} {msg} {ansi('250', '(' + up['data'][-5:] + ')')}")

    spark = sparkline_24h(posts)
    linhas.append(f"  {ansi('38', '\u2500' * largura)}")
    if spark:
        linhas.append(f"  {ansi('250', 'ATIVIDADE 24H:')} {ansi('112', spark)}")
    timeline = [p for p in posts_hoje if p["estado"] == "feito"][-10:]
    if timeline:
        linhas.append(f"  {ansi('38', '\u2500' * largura)}")
        linhas.append(f"  {ansi('250', 'TIMELINE DE HOJE (\u00faltimas entregas)')}")
        for p in reversed(timeline):
            hhmm = p["data"][-5:]
            c = cores.get(p["nome"], ("#fff", "250"))[1]
            msg = p["msg"] if len(p["msg"]) <= 56 else p["msg"][:53] + "..."
            nome_pad = f"{p['nome']:<10}"
            linhas.append(f"  {ansi('112', hhmm)} {ansi(c, nome_pad)} {ansi('34', '\u2713')} {msg}")
    linhas.append(f"  {ansi('38', '\u2550' * largura)}")
    linhas.append("")
    for ln in linhas:
        print(ln)
    if args.salvar:
        destino = squad_dir(base) / "dashboard.md"
        ansi_re = re.compile(r"\x1b\[[0-9;]*m")
        simples = [ansi_re.sub("", ln) for ln in linhas if ln.strip()]
        destino.write_text(
            f"# Dashboard do squad \u2014 {projeto} ({hoje})\n\n"
            + "\n".join(simples)
            + "\n",
            encoding="utf-8",
        )
        print(f"  salvo em: {destino}")
    return 0


def binario_sploit():
    """Localiza o binario do Sploit: junto ao script (repo) ou no PATH."""
    raiz = Path(__file__).resolve().parent.parent
    exe = raiz / "sploit.exe"
    if exe.exists():
        return str(exe)
    achou = shutil.which("sploit")
    return achou or "sploit"


def supervisor_pid_path(base):
    return squad_dir(base) / "supervisor.pid"


def processo_vivo(pid):
    """Confere se um PID ainda esta rodando (sem depender de psutil)."""
    if not pid:
        return False
    if os.name == "nt":
        try:
            r = subprocess.run(
                ["tasklist", "/FI", f"PID eq {pid}", "/NH"],
                capture_output=True, text=True, timeout=5,
            )
            return str(pid) in r.stdout
        except Exception:  # noqa: BLE001
            return False
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def ler_supervisor_pid(base):
    p = supervisor_pid_path(base)
    if not p.exists():
        return None
    try:
        return int(p.read_text(encoding="utf-8").strip())
    except (ValueError, OSError):
        return None


def supervisor_ativo(base):
    return processo_vivo(ler_supervisor_pid(base))


def lancar_supervisor_auto(base):
    """Sobe um `squad supervisor` desanexado se nenhum ja estiver rodando pra
    este squad. Chamado por `post` pra fila nunca ficar orfa so porque
    ninguem lembrou de rodar `squad run`/`supervisor` na mao."""
    base_abs = Path(base).resolve()
    logs = squad_dir(base_abs) / "logs"
    logs.mkdir(parents=True, exist_ok=True)
    log = logs / "supervisor.log"
    with log.open("ab") as fh:
        p = subprocess.Popen(
            [sys.executable, str(Path(__file__).resolve()), "--dir", str(base_abs), "supervisor"],
            stdin=subprocess.DEVNULL,
            stdout=fh,
            stderr=fh,
            creationflags=(
                subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NO_WINDOW
            ) if os.name == "nt" else 0,
        )
    supervisor_pid_path(base_abs).write_text(str(p.pid), encoding="utf-8")
    return p.pid


def montar_prompt(base, cfg, a):
    nome = a["nome"]
    papel = a.get("papel", "")
    projeto = cfg.get("projeto", Path(base).name)
    pasta = Path(base) / a["pasta"]
    quadro = quadro_path(base)
    memoria = memoria_path(base, nome)
    # Barra normal (nao contrabarra) e path entre aspas: o agente roda isso
    # via bash (Git Bash no Windows) — contrabarra de Path do Windows sem
    # aspas vira sequencia de escape e o script "some" (ex.: C:\Users vira
    # CUsers), quebrando o post do resultado no quadro.
    sp = str(Path(__file__).resolve()).replace("\\", "/")
    base_cmd = str(Path(base).resolve()).replace("\\", "/")
    pl = papel.lower()
    e_auditor = "audit" in pl or "auditor" in nome.lower()
    e_seguranca = (
        "segur" in pl or "pentest" in pl or "vulner" in pl or "seguranca" in nome.lower()
    )
    if e_seguranca:
        lugar = (
            f"- Pasta de trabalho: {pasta} (guardar relatorios aqui)\n"
            f"- Voce e o ESPECIALISTA EM SEGURANCA (pentest): leia livremente as "
            f"pastas dos outros agentes e o codigo do projeto (bash/read). "
            f"NAO edite o codigo de producao.\n"
        )
        procedimento = (
            f"1. Leia o quadro. Encontre o ultimo post pendente atribuido a voce, "
            f"da forma **[{{nome}}] (pendente) ...**. Se nao houver tarefa pendente "
            f"para voce, responda apenas \"aguardando\" e pare (NAO poste nada).\n"
            f"2. Leia o codigo indicado na tarefa e AUDITE SEGURANCA, procurando "
            f"vulnerabilidades REAIS e acionaveis:\n"
            f"   - injecao (SQL/NoSQL/comando) a partir de entradas do usuario;\n"
            f"   - XSS (refletido/armazenado) e HTML sem escape;\n"
            f"   - path traversal e acesso a arquivos fora da area permitida;\n"
            f"   - headers de seguranca ausentes (CSP, X-Content-Type-Options, "
            f"X-Frame-Options, etc.);\n"
            f"   - validacao fraca de input (tipos/tamanhos/formatos invalidos aceitos);\n"
            f"   - stack trace ou detalhes internos vazando em erros/logs;\n"
            f"   - dados sensiveis (senha/token) logados ou em texto puro;\n"
            f"   - autenticacao/autorizacao fraca (rota protegida acessivel sem checagem).\n"
            f"   Se possivel, rode os testes ou o servidor (bash, sempre desanexado) e "
            f"PROBE as rotas com payloads maliciosos para CONFIRMAR o comportamento "
            f"real. NUNCA deixe servidor rodando ao terminar.\n"
            f"2b. TAREFAS GRANDES: delegue. Para mapear/explorar/analisar codigo ou "
            f"dividir trabalho grande, use a ferramenta task (subagent_type=explore "
            f"ou general) com um prompt detalhado; espere o resultado e use-o. "
            f"Nao faca manualmente o que um subagente pode mapear.\n"
            f"3. Ao terminar, atualize sua memoria (append de 2-3 linhas: o que "
            f"achou) e POSTE o veredito no quadro rodando via bash exatamente um destes:\n"
            f"   - Aprovado:  python \"{sp}\" --dir \"{base_cmd}\" post --nome {nome} --estado feito --msg \"SEGURANCA: aprovado, N achados. RESUMO\"\n"
            f"   - Reprovado: python \"{sp}\" --dir \"{base_cmd}\" post --nome {nome} --estado bloqueado --msg \"SEGURANCA: CRITICO: 1) [ALTA] descricao (arquivo:linha); 2) ...\"\n"
            f"   - Impedido:  python \"{sp}\" --dir \"{base_cmd}\" post --nome {nome} --estado bloqueado --msg \"MOTIVO\"\n"
            + "   Regras da mensagem: resuma em ate 25 palavras; marque cada achado "
            + "com [CRITICA]/[ALTA]/[MEDIA]/[BAIXA]; NAO use aspas duplas nem $ nela.\n"
            + f"4. Encerre respondendo ao usuario com o veredito em 1-2 linhas.\n"
        )
    elif e_auditor:
        lugar = (
            f"- Pasta de trabalho: {pasta} (guardar relatorios aqui)\n"
            f"- Voce AUDITA: leia livremente as pastas dos outros agentes e o "
            f"codigo do projeto (bash/read). NAO edite o codigo de producao.\n"
        )
        procedimento = (
            f"1. Leia o quadro. Encontre o ultimo post pendente atribuido a voce, "
            f"da forma **[{{nome}}] (pendente) ...**. Se nao houver tarefa pendente "
            f"para voce, responda apenas \"aguardando\" e pare (NAO poste nada).\n"
            f"2. Leia o codigo indicado na tarefa e AUDITE: bugs reais, validacoes "
            f"faltando, limites desrespeitados, casos de borda. Aponte arquivo/linha "
            f"quando possivel.\n"
            f"2b. TAREFAS GRANDES: delegue. Para mapear/explorar/analisar codigo ou "
            f"dividir trabalho grande, use a ferramenta task (subagent_type=explore "
            f"ou general) com um prompt detalhado; espere o resultado e use-o. "
            f"Nao faca manualmente o que um subagente pode mapear.\n"
            f"3. Ao terminar, atualize sua memoria (append de 2-3 linhas: o que "
            f"achou) e POSTE o veredito no quadro rodando via bash exatamente um destes:\n"
            f"   - Aprovado:  python \"{sp}\" --dir \"{base_cmd}\" post --nome {nome} --estado feito --msg \"AUDITORIA: aprovado, N achados. RESUMO\"\n"
            f"   - Reprovado: python \"{sp}\" --dir \"{base_cmd}\" post --nome {nome} --estado bloqueado --msg \"AUDITORIA: PROBLEMAS: 1) ...; 2) ...\"\n"
            f"   - Impedido:  python \"{sp}\" --dir \"{base_cmd}\" post --nome {nome} --estado bloqueado --msg \"MOTIVO\"\n"
            + "   Regras da mensagem: resuma em ate 25 palavras; NAO use aspas duplas nem $ nela.\n"
            + f"4. Encerre respondendo ao usuario com o veredito em 1-2 linhas.\n"
        )
    else:
        lugar = (
            f"- Pasta de trabalho: {pasta} (trabalhe SOMENTE aqui)\n"
        )
        procedimento = (
            f"1. Leia o quadro. Encontre o ultimo post pendente atribuido a voce, "
            f"da forma **[{{nome}}] (pendente) ...**. Se nao houver tarefa pendente "
            f"para voce, responda apenas \"aguardando\" e pare (NAO poste nada).\n"
            f"2. Execute a tarefa na sua pasta, com o codigo existente. NAO edite "
            f"arquivos fora dela.\n"
            f"2b. TAREFAS GRANDES: delegue. Para mapear/explorar/analisar codigo ou "
            f"dividir trabalho grande, use a ferramenta task (subagent_type=explore "
            f"ou general) com um prompt detalhado; espere o resultado e use-o. "
            f"Nao faca manualmente o que um subagente pode mapear.\n"
            f"3. Ao terminar, atualize sua memoria (append de 2-3 linhas: o que fez/aprendeu) "
            f"e POSTE o resultado no quadro rodando via bash exatamente um destes:\n"
            f"   - Sucesso:  python \"{sp}\" --dir \"{base_cmd}\" post --nome {nome} --estado feito --msg \"RESUMO\"\n"
            f"   - Parcial:  python \"{sp}\" --dir \"{base_cmd}\" post --nome {nome} --estado pendente --msg \"RESUMO\"\n"
            f"   - Impedido: python \"{sp}\" --dir \"{base_cmd}\" post --nome {nome} --estado bloqueado --msg \"MOTIVO\"\n"
            + "   Regras da mensagem: resuma em ate 20 palavras; NAO use aspas duplas nem $ nela.\n"
            + f"4. Encerre respondendo ao usuario com um resumo de 1-2 linhas.\n"
        )
    return (
        f"Voce e {nome}, agente do squad do projeto \"{projeto}\""
        + (f" (papel: {papel})." if papel else ".")
        + "\n"
        + "\n"
        + "SEU LUGAR NESTA RODADA:\n"
        + lugar
        + f"- Quadro do squad (leia antes de tudo): {quadro}\n"
        + f"- Sua memoria de longo prazo (leia e atualize ao final): {memoria}\n"
        + "\n"
        + "PROCEDIMENTO:\n"
        + procedimento
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
                stdin=subprocess.DEVNULL,
                stdout=fh,
                stderr=fh,
                creationflags=(
                    subprocess.CREATE_NEW_PROCESS_GROUP
                    | subprocess.CREATE_NO_WINDOW
                ),
            )
        print(f"lançado: {nome} (PID {p.pid}) -> {log}")
    print(f"{len(alvos)} agente(s) lançado(s); acompanhe com: squad view --watch")
    return 0


def postar_celebracao(base, posts):
    """Posta o resumo da fila no quadro (quando ela zera sem orfas)."""
    feitos = sum(1 for p in posts if p["estado"] == "feito")
    bloqueados = sum(1 for p in posts if p["estado"] == "bloqueado")
    pl = "s" if feitos != 1 else ""
    plb = "s" if bloqueados != 1 else ""
    linha = (
        f"**[Coordenador] (feito) \u2728 fila conclu\u00edda: "
        f"{feitos} entrega{pl} \u00b7 {bloqueados} bloqueio{plb} "
        f"\u00b7 dashboard: python squad.py dashboard - "
        f"[{now()}]**\n"
    )
    with quadro_path(base).open("a", encoding="utf-8") as fh:
        fh.write(linha)
    return linha.rstrip()


def verificar_integracao(base, cfg, runner=None):
    """Roda o comando de verificacao opcional (squad.json -> "verificar") antes
    de declarar o squad pronto. Sem "verificar" configurado, considera ok
    (comportamento de antes, squads existentes nao quebram).

    `runner` e injetavel pra teste (evita depender de subprocess de verdade);
    por padrao roda `cmd` via shell no diretorio `base`.
    """
    cmd = cfg.get("verificar")
    if not cmd:
        return True, ""
    correr = runner or (
        lambda cmd: subprocess.run(
            cmd, shell=True, cwd=str(base), capture_output=True, text=True, timeout=600
        )
    )
    try:
        r = correr(cmd)
    except subprocess.TimeoutExpired:
        return False, "verificacao expirou (timeout de 10min)"
    saida = ((r.stdout or "") + "\n" + (r.stderr or "")).strip()
    return r.returncode == 0, saida


def teto_supervisor(total_lancamentos, inicio, args, agora=None):
    """Decide se o supervisor deve parar de lancar agentes novos.

    Retorna None (segue normal), "lancamentos" (bateu o teto de sessoes
    lancadas na rodada inteira) ou "tempo" (bateu o teto de minutos de
    parede). Os agentes ja em andamento nao sao interrompidos — so para
    de lancar gente nova.
    """
    if args.max_lancamentos and total_lancamentos >= args.max_lancamentos:
        return "lancamentos"
    agora = time.monotonic() if agora is None else agora
    if args.max_minutos and (agora - inicio) >= args.max_minutos * 60:
        return "tempo"
    return None


def cmd_supervisor(args):
    """Monitora o quadro: lança quem tem tarefa pendente e relança até a fila zerar."""
    base = Path(args.dir).resolve()
    cfg = load_cfg(base)
    exe = binario_sploit()
    logs = squad_dir(base) / "logs"
    logs.mkdir(parents=True, exist_ok=True)
    supervisor_pid_path(base).write_text(str(os.getpid()), encoding="utf-8")
    try:
        sys.stdout.reconfigure(line_buffering=True)
    except Exception:  # noqa: BLE001
        pass
    procs = {}
    marcas = {}
    tent = {}
    idle = 0
    tent_integracao = 0
    total_lancamentos = 0
    inicio = time.monotonic()
    teto_atingido = None  # None | "lancamentos" | "tempo"
    print(
        f"supervisor ativo em {base} (intervalo {args.intervalo}s; "
        f"teto {args.max_lancamentos or 'sem'} lancamentos, "
        f"{args.max_minutos or 'sem'} min; Ctrl+C encerra)"
    )
    try:
        while True:
            posts = parse_quadro(base)
            n = len(posts)
            lancou = False
            if teto_atingido is None:
                teto_atingido = teto_supervisor(total_lancamentos, inicio, args)
                if teto_atingido:
                    print(
                        f"[{now()}] teto de {teto_atingido} atingido — parando de lancar "
                        f"agentes novos (os em andamento seguem ate terminar sozinhos)"
                    )
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
                if teto_atingido:
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
                total_lancamentos += 1
                lancou = True
                print(f"[{now()}] {nome} lancado (PID {pp.pid}, tentativa {tent[nome]}, total {total_lancamentos})")
            if teto_atingido and not procs:
                pend = [
                    a["nome"]
                    for a in cfg.get("agentes", [])
                    if tarefa_pendente(posts, a["nome"])[0] is not None
                ]
                msg = f"supervisor encerrando por teto de {teto_atingido}"
                if pend:
                    msg += f" (fila ainda tem trabalho pendente: {pend})"
                print(f"[{now()}] {msg}")
                break
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
                    if pend:
                        print(f"[{now()}] fila vazia; supervisor encerrando (orfas: {pend})")
                        break
                    ok, saida = verificar_integracao(base, cfg)
                    if ok:
                        print(f"[{now()}] fila vazia; supervisor encerrando")
                        print(postar_celebracao(base, posts))
                        break
                    resumo = " ".join(saida.split())[:200] or "verificacao falhou"
                    alvo = cfg.get("integrador")
                    tent_integracao += 1
                    if alvo and tent_integracao <= 3:
                        linha = (
                            f"**[Coordenador] (pendente) {alvo}: integracao falhou "
                            f"({tent_integracao}/3) - {resumo} - [{now()}]**\n"
                        )
                        print(f"[{now()}] integracao falhou (tentativa {tent_integracao}/3) - delegando pra {alvo}")
                        with quadro_path(base).open("a", encoding="utf-8") as fh:
                            fh.write(linha)
                        idle = 0
                    else:
                        linha = (
                            f"**[Coordenador] (bloqueado) integracao falhou apos verificacoes "
                            f"- {resumo} - [{now()}]**\n"
                        )
                        with quadro_path(base).open("a", encoding="utf-8") as fh:
                            fh.write(linha)
                        motivo = "sem integrador configurado" if not alvo else "integrador esgotou as tentativas"
                        print(f"[{now()}] integracao continua falhando ({motivo}) - supervisor encerrando, precisa de humano")
                        break
            time.sleep(args.intervalo)
    except KeyboardInterrupt:
        print("\nsupervisor encerrado pelo usuario")
    finally:
        pidp = supervisor_pid_path(base)
        try:
            if pidp.exists() and pidp.read_text(encoding="utf-8").strip() == str(os.getpid()):
                pidp.unlink()
        except OSError:
            pass
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
        for a in agentes:
            nome = a["nome"]
            hexc, ansi_c = cores.get(nome, cor_agente(nome))
            estado, acao = estado_agente(posts, nome)
            simb = SIMBOLO.get(estado, "\u25cb")
            papel = f" \u00b7 {a['papel']}" if a.get("papel") else ""
            if len(acao) > 46:
                acao = acao[:45] + "\u2026"
            L.append(
                f"  {ansi(ansi_c, nome)}  {a['pasta']}{papel}  "
                f"{ansi(ESTADO_COR.get(estado, '214'), f'{simb} {estado}')}  {acao}"
            )

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
          padding: 14px 16px; min-width: 200px; }
  .card .nome { font-weight: bold; font-size: 17px; margin-bottom: 2px; }
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
      c.innerHTML =
        "<div class='nome' style='color:" + a.cor + "'>" + a.nome + "</div>" +
        "<div class='pasta'>" + a.pasta + (a.papel ? " · " + a.papel : "") + "</div>" +
        "<div class='status'>" + SIMB[a.status] + " " + a.status + "</div>" +
        "<div class='acao'></div>";
      c.querySelector(".acao").textContent = a.acao;
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

    sub.add_parser("create", help="wizard guiado: cria o time de agentes passo a passo")

    p = sub.add_parser("post", help="posta no quadro")
    p.add_argument("--nome", required=True)
    p.add_argument("--estado", choices=ESTADOS, default="feito")
    p.add_argument("--msg", required=True)

    for c in ("status", "list", "check"):
        sub.add_parser(c, help=f"{c} do squad")

    p = sub.add_parser("daily", help="daily/standup: resumo do trabalho do time em um dia")
    p.add_argument("--data", default="", help="dia em dd/mm/aaaa (padrão: hoje)")

    p = sub.add_parser("dashboard", help="painel consolidado do time (dashboard da empresa)")
    p.add_argument("--salvar", action="store_true", help="salva uma copia sem cores em squad/dashboard.md")

    p = sub.add_parser("view", help="palco do squad no terminal")
    p.add_argument("--watch", action="store_true", help="atualiza a cada --intervalo s")
    p.add_argument("--intervalo", type=float, default=2.0)

    p = sub.add_parser("web", help="palco do squad na web (HTML + API)")
    p.add_argument("--port", type=int, default=4199)

    p = sub.add_parser("run", help="lança os agentes como sessões headless do Sploit")
    p.add_argument("--nome", default="", help="agente específico (padrão: todos)")

    p = sub.add_parser("supervisor", help="monitora o quadro e relança agentes até a fila zerar")
    p.add_argument("--intervalo", type=float, default=5.0, help="checagem em segundos (padrão: 5)")
    p.add_argument(
        "--max-lancamentos",
        type=int,
        default=30,
        help="teto de sessões lançadas na rodada inteira, não só por tarefa (padrão: 30; 0 desliga)",
    )
    p.add_argument(
        "--max-minutos",
        type=float,
        default=120.0,
        help="teto de tempo de parede pro supervisor inteiro, em minutos (padrão: 120; 0 desliga)",
    )

    args = ap.parse_args(argv)

    if args.cmd == "init":
        if not args.projeto:
            args.projeto = Path(args.dir).name
        return cmd_init(args)
    if args.cmd == "add":
        return cmd_add(args)
    if args.cmd == "create":
        return cmd_create(args)
    if args.cmd == "post":
        return cmd_post(args)
    if args.cmd == "status":
        return cmd_status(args)
    if args.cmd == "list":
        return cmd_list(args)
    if args.cmd == "check":
        return cmd_check(args)
    if args.cmd == "daily":
        return cmd_daily(args)
    if args.cmd == "dashboard":
        return cmd_dashboard(args)
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
