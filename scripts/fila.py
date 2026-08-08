#!/usr/bin/env python3
"""fila.py — fila de auto-melhoria do Sploit.

Gerencia os candidatos de melhoria do arnes gerados pelo /diagnostico.
Cada candidato: titulo, evidencia (por que), verificacao (como provar),
status (proposto/negado/em_andamento/feito/revertido), commit.

A fila vive em FILA_MELHORIAS.json na raiz do repo (gitignored nao; e parte
da memoria do projeto). O ciclo seguro continua sendo o self-restart:
aprovado + implementado -> build -> smoke -> troca de binario.

Uso: python scripts/fila.py [acao] [args]
  (sem acao)        lista a fila em PT-BR
  novo <titulo>     adiciona candidato (abre editor se --evidencia/--verificacao nao der)
  ver <id>          mostra detalhes do candidato
  negar <id>        marca como negado (nao implementar)
  fazer <id>        marca como em_andamento
  feito <id> [commit]  marca como feito (registra commit)
  reverter <id>     marca como revertido (rollback aconteceu)
"""

import argparse
import json
import os
import sys
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path

QUEUE = Path(__file__).resolve().parent.parent / "FILA_MELHORIAS.json"
STATUS = ["proposto", "negado", "em_andamento", "feito", "revertido"]
EMOJI = {
    "proposto": "[ ]",
    "negado": "[x]",
    "em_andamento": "[~]",
    "feito": "[ok]",
    "revertido": "[!]",
}


def load():
    if not QUEUE.exists():
        return []
    try:
        return json.loads(QUEUE.read_text(encoding="utf-8"))
    except Exception:
        return []


def save(items):
    QUEUE.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")


def find(items, iid):
    for it in items:
        if it["id"] == iid:
            return it
    return None


def next_id(items):
    n = len(items) + 1
    while any(it["id"] == f"melh-{n}" for it in items):
        n += 1
    return f"melh-{n}"


def edit_text(initial=""):
    fd, path = tempfile.mkstemp(suffix=".md")
    os.close(fd)
    Path(path).write_text(initial, encoding="utf-8")
    subprocess.call([os.environ.get("EDITOR", "notepad"), path])
    text = Path(path).read_text(encoding="utf-8")
    os.unlink(path)
    return text.strip()


def list_queue(items):
    if not items:
        print("Fila vazia. Rode /diagnostico para gerar candidatos ou `python scripts/fila.py novo <titulo>`.")
        return
    print("=== FILA DE AUTO-MELHORIA DO SPLOIT ===")
    for it in items:
        mark = EMOJI.get(it.get("status", "proposto"), "[?]")
        commit = it.get("commit") or "-"
        print(f"  {mark} {it['id']} [{it.get('status')}] {it.get('titulo')}")
        print(f"      verif: {it.get('verificacao') or '-'}  commit: {commit}")
    n_open = sum(1 for it in items if it.get("status") in ("proposto", "em_andamento"))
    print()
    print(f"{n_open} candidato(s) aberto(s). Ciclo: /diagnostico -> fila -> aprovar (fazer) -> self-restart -> feito.")


def main():
    ap = argparse.ArgumentParser(description="Fila de auto-melhoria do Sploit")
    ap.add_argument("acao", nargs="?", help="novo|ver|negar|fazer|feito|reverter")
    ap.add_argument("args", nargs="*", help="titulo ou id")
    args = ap.parse_args()

    items = load()
    acao = args.acao

    if acao in (None, "list"):
        list_queue(items)
        return 0

    if acao == "novo":
        titulo = " ".join(args.args)
        if not titulo:
            print("Uso: python scripts/fila.py novo <titulo>")
            return 1
        ev = edit_text("# Evidencia\n\nPor que este candidato existe?")
        ver = edit_text("# Verificacao\n\nComo provar que ficou melhor?")
        items.append(
            {
                "id": next_id(items),
                "status": "proposto",
                "titulo": titulo,
                "evidencia": ev,
                "verificacao": ver,
                "commit": None,
                "criado": datetime.now().strftime("%Y-%m-%d %H:%M"),
            }
        )
        save(items)
        print(f"Candidato {items[-1]['id']} adicionado.")
        return 0

    if not args.args:
        print(f"Uso: python scripts/fila.py {acao} <id>")
        return 1
    iid = args.args[0]
    it = find(items, iid)
    if not it:
        print(f"Candidato '{iid}' nao encontrado.")
        return 1

    if acao == "ver":
        print(f"ID: {it['id']}  status: {it.get('status')}")
        print(f"Titulo: {it.get('titulo')}")
        print(f"Evidencia: {it.get('evidencia')}")
        print(f"Verificacao: {it.get('verificacao')}")
        print(f"Commit: {it.get('commit') or '-'}")
        return 0

    if acao == "negar":
        it["status"] = "negado"
    elif acao == "fazer":
        it["status"] = "em_andamento"
    elif acao == "feito":
        commit = " ".join(args.args[1:]) if len(args.args) > 1 else ""
        it["status"] = "feito"
        it["commit"] = commit or it.get("commit")
    elif acao == "reverter":
        it["status"] = "revertido"
    else:
        print(f"Acao desconhecida: {acao}")
        return 1

    save(items)
    print(f"{iid} -> {it['status']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
