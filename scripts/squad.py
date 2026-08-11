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
import sys
from datetime import datetime
from pathlib import Path

ESTADOS = ("feito", "pendente", "bloqueado")

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
    return 0


if __name__ == "__main__":
    sys.exit(main())
