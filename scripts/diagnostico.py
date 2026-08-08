#!/usr/bin/env python3
"""diagnostico.py — diagnostico do harness do Sploit.

Cruza o banco local (opencode-sploit.db) com o grafo do conhecimento
(graphify-out/graph.json) para apontar ONDE o arnes sofre:

  - ferramentas que mais falham (status=error) e o arquivo envolvido
  - arquivos centrais do grafo (alto degree) tocados na sessao
  - turnos mais caros (pico de entrada)
  - compactacoes: se o resumo manteve as ancoras (arquivos centrais)
  - custo/tokens resumidos (reusa a logica do saude.py)

Uso: python scripts/diagnostico.py [sessao_id] [--fila]
  --fila  adiciona candidatos de melhoria a FILA_MELHORIAS.json
"""

import sqlite3
import sys
import json
import os
import collections
from datetime import datetime
from pathlib import Path

DB = Path.home() / ".local" / "share" / "sploit" / "opencode-sploit.db"
GRAPH = Path(__file__).resolve().parent.parent / "graphify-out" / "graph.json"
QUEUE = Path(__file__).resolve().parent.parent / "FILA_MELHORIAS.json"


def load_queue():
    if not QUEUE.exists():
        return []
    try:
        return json.loads(QUEUE.read_text(encoding="utf-8"))
    except Exception:
        return []


def queue_add(titulo, evidencia, verificacao):
    items = load_queue()
    n = len(items) + 1
    while any(it.get("id") == f"melh-{n}" for it in items):
        n += 1
    iid = f"melh-{n}"
    if any(it.get("titulo") == titulo and it.get("status") == "proposto" for it in items):
        return None
    items.append(
        {
            "id": iid,
            "status": "proposto",
            "titulo": titulo,
            "evidencia": evidencia,
            "verificacao": verificacao,
            "commit": None,
            "criado": datetime.now().strftime("%Y-%m-%d %H:%M"),
        }
    )
    QUEUE.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
    return iid

PRICE_INPUT = 3.0
PRICE_OUTPUT = 15.0
PRICE_CACHE_READ = 0.30
PRICE_CACHE_WRITE = 1.50


def fmt(n):
    return f"{n:,.0f}".replace(",", ".")


def estimate_cost(ti, to, tc, tw, reported=0):
    if reported and reported > 0:
        return reported
    if not (PRICE_INPUT or PRICE_OUTPUT):
        return 0.0
    return (
        ti * PRICE_INPUT
        + to * PRICE_OUTPUT
        + tc * PRICE_CACHE_READ
        + tw * PRICE_CACHE_WRITE
    ) / 1_000_000


def load_graph():
    """Retorna (degree_map, file_degree, label_to_file)."""
    if not GRAPH.exists():
        return {}, {}, {}
    try:
        g = json.loads(GRAPH.read_text(encoding="utf-8"))
    except Exception:
        return {}, {}, {}
    degree = collections.Counter()
    for link in g.get("links", []):
        degree[link.get("source")] += 1
        degree[link.get("target")] += 1
    file_degree = {}
    label_to_file = {}
    for node in g.get("nodes", []):
        sf = node.get("source_file")
        if sf:
            key = os.path.basename(sf.replace("\\", "/"))
            if node.get("file_type") == "code":
                file_degree[sf.replace("\\", "/")] = max(
                    file_degree.get(sf.replace("\\", "/"), 0), degree.get(node.get("id"), 0)
                )
                label_to_file[node.get("label")] = sf
    return degree, file_degree, label_to_file


def norm_path(p):
    if not p:
        return ""
    return p.replace("\\", "/")


def graph_degree_for(path, session_dir, file_degree):
    """Degree do grafo para um caminho de arquivo (ou 0 se nao central)."""
    p = norm_path(path)
    if not p:
        return 0
    if p in file_degree:
        return file_degree[p]
    try:
        rel = os.path.relpath(path, session_dir).replace("\\", "/")
        if rel in file_degree:
            return file_degree[rel]
    except Exception:
        pass
    return 0


def extract_filepath(tool, inp):
    """Tenta extrair o arquivo alvo do input de uma chamada de ferramenta."""
    fp = inp.get("filePath") if isinstance(inp, dict) else None
    if fp:
        return fp
    cmd = inp.get("command") if isinstance(inp, dict) else None
    if isinstance(cmd, str):
        for tok in cmd.split():
            if "\\" in tok or "/" in tok:
                cand = tok.strip("\"'`;,|")
                if any(ext in cand.lower() for ext in (".py", ".ts", ".tsx", ".js", ".json", ".md", ".ps1", ".yml", ".yaml", ".css", ".html")):
                    return cand
    return None


def main():
    if not DB.exists():
        print(f"ERRO: banco nao encontrado em {DB}")
        return 1

    db = sqlite3.connect(str(DB))
    cur = db.cursor()

    cur.execute(
        """SELECT id, title, directory, substr(time_created,1,19), substr(time_updated,1,19),
                  tokens_input, tokens_output, tokens_cache_read, tokens_cache_write, cost
           FROM session ORDER BY time_updated DESC"""
    )
    sessions = cur.fetchall()
    if not sessions:
        print("Nenhuma sessao encontrada.")
        db.close()
        return 1

    arg = None
    for a in sys.argv[1:]:
        if not a.startswith("--"):
            arg = a
            break
    target = arg or sessions[0][0]
    row = next((s for s in sessions if s[0] == target), None)
    if not row:
        print(f"Sessao '{arg}' nao encontrada.")
        db.close()
        return 1

    sid, title, sdir, created, updated, ti, to, tc, tw, cost = row
    ti, to, tc, tw, cost = (v or 0 for v in (ti, to, tc, tw, cost))
    est = estimate_cost(ti, to, tc, tw, cost)
    est_note = " (estimado)" if cost == 0 and est > 0 else ""

    degree, file_degree, _ = load_graph()

    print(f"=== DIAGNOSTICO DO HARNESS: {sid[:20]}... ===")
    print(f"Titulo : {title or '(sem titulo)'}")
    print(f"Dir    : {sdir}")
    print(f"Custo  : US$ {est:.4f}{est_note} | in={fmt(ti)} out={fmt(to)} cache={fmt(tc)}")
    print()

    tool_err = collections.Counter()
    tool_cnt = collections.Counter()
    err_samples = []
    touched = {}  # path -> (n, max_degree)
    turns = []  # (tokens_input, parent_id, created)
    turn_tools = {}  # parent_id -> counter de tools

    cur.execute(
        """SELECT data FROM message
           WHERE session_id=? AND json_extract(data,'$.role')='assistant' AND json_extract(data,'$.tokens') IS NOT NULL
           ORDER BY time_created""",
        (sid,),
    )
    msg_rows = cur.fetchall()
    for i, (r,) in enumerate(msg_rows):
        try:
            d = json.loads(r)
        except Exception:
            continue
        t = d.get("tokens")
        if isinstance(t, dict):
            t_in = t.get("input", 0) or 0
            pid = d.get("parentID", "")
            created = (d.get("time") or {}).get("created", 0) or 0
            turns.append((t_in, pid, created))
            turn_tools[pid] = collections.Counter()

    cur.execute("SELECT data FROM part WHERE session_id=?", (sid,))
    parts = cur.fetchall()

    tool_events = []  # (start_time, tool, fp)
    for (r,) in parts:
        try:
            d = json.loads(r)
        except Exception:
            continue
        if d.get("type") != "tool":
            continue
        tool = d.get("tool", "?")
        st = d.get("state") or {}
        status = st.get("status")
        tool_cnt[tool] += 1
        inp = st.get("input") if isinstance(st, dict) else {}
        fp = extract_filepath(tool, inp)
        if fp:
            deg = graph_degree_for(fp, sdir, file_degree)
            cur_path = norm_path(fp)
            n, mx = touched.get(cur_path, (0, 0))
            touched[cur_path] = (n + 1, max(mx, deg))
        if status == "error":
            tool_err[tool] += 1
            err = (st.get("error") or st.get("output") or "")[:200]
            err_samples.append((tool, fp or "?", err))
        t0 = ((st.get("time") or {}).get("start")) if isinstance(st, dict) else None
        tool_events.append((t0 or 0, tool, fp or ""))

    turns_sorted = sorted(turns, key=lambda x: x[2])
    for t0, tool, fp in tool_events:
        if not t0:
            continue
        owner = None
        for t_in, pid, created in turns_sorted:
            if created <= t0:
                owner = pid
            else:
                break
        if owner in turn_tools:
            turn_tools[owner][tool] += 1

    # ---- 1. ferramentas que falham
    print("1) FALHAS DE FERRAMENTA")
    if tool_err:
        for tool, n in tool_err.most_common():
            rate = 100.0 * n / max(1, tool_cnt[tool])
            print(f"   {tool}: {n} falhas em {tool_cnt[tool]} chamadas ({rate:.0f}%)")
        print("   Amostras de erro:")
        for tool, fp, err in err_samples[:5]:
            print(f"     - {tool} {fp}: {err[:110]}")
    else:
        print("   Nenhuma falha nesta sessao.")
    print()

    # ---- 2. arquivos centrais tocados
    print("2) ARQUIVOS CENTRAIS DO GRAFO TOCADOS")
    central = sorted(((p, n, deg) for p, (n, deg) in touched.items() if deg > 0), key=lambda x: -x[2])
    top_degree = central[0] if central else None
    if central:
        for p, n, deg in central[:8]:
            print(f"   degree={deg:<5} chamadas={n:<3} {p}")
    else:
        print("   Nenhum arquivo central do grafo foi tocado nesta sessao.")
    print()

    # ---- 3. turno mais caro
    print("3) TURNOS MAIS CAROS")
    if turns:
        top = sorted(turns, reverse=True)[:3]
        for t_in, pid, created in top:
            tools_txt = ""
            tt = turn_tools.get(pid)
            if tt:
                tools_txt = " | tools: " + ", ".join(f"{k}x{v}" for k, v in tt.most_common(5))
            print(f"   in={fmt(t_in)}  {pid[:20]}...{tools_txt}")
    print()

    # ---- 4. compactacoes e retencao de ancoras
    print("4) COMPACTACOES")
    cur.execute(
        """SELECT data FROM part
           WHERE session_id=? AND json_extract(data,'$.type')='compaction'
           ORDER BY rowid""",
        (sid,),
    )
    comps = [r[0] for r in cur.fetchall()]
    if comps:
        print(f"   Total: {len(comps)}")
        top_files = [norm_path(p) for p, n, deg in sorted(central, key=lambda x: -x[2])[:5]] if central else []
        if top_files:
            print("   Ancoras do grafo (top degree) desta sessao:")
            for p in top_files:
                print(f"     - {os.path.basename(p)}  (degree={dict((x[0], x[2]) for x in central)[p]})")
            print("   (A nova compactacao injeta essas ancoras no prompt de resumo;")
            print("    confira na proxima compactacao se os simbolos centrais sobrevivem.)")
    else:
        print("   Nenhuma compactacao nesta sessao.")
    print()

    # ---- 5. causa raiz das falhas
    print("5) CAUSA RAIZ DAS FALHAS")
    if err_samples:
        for tool, fp, err in err_samples[:10]:
            kind = classify_error(tool, err)
            tag = "HARNESS" if kind == "HARNESS" else "AGENTE"
            print(f"   [{tag}] {tool} {fp}: {err[:90]}")
        harness_n = sum(1 for t, _, e in err_samples if classify_error(t, e) == "HARNESS")
        agent_n = sum(1 for t, _, e in err_samples if classify_error(t, e) == "AGENTE")
        print()
        print(f"   {harness_n} defeito(s) do HARNESS (motor) | {agent_n} erro(s) do AGENTE (disciplina).")
        if agent_n and not harness_n:
            print("   -> Nenhum defeito do motor: as falhas sao disciplina do agente.")
            print("   -> Se a licao nao estiver gravada no prompt do harness, o --fila propoe gravar.")
        if harness_n:
            print("   -> Defeitos do motor: investigar no sploit-src antes de decidir.")
    else:
        print("   Nenhuma falha nesta sessao.")
    print()

    # ---- 6. resumo de custo
    print("6) RESUMO")
    print(f"   Tokens: in={fmt(ti)} out={fmt(to)} cache_read={fmt(tc)} cache_write={fmt(tw)}")
    print(f"   Custo: US$ {est:.4f}{est_note}")
    print(f"   Turnos de assistente: {len(turns)}")
    if turns:
        avg = sum(x[0] for x in turns) / len(turns)
        print(f"   Entrada media/turno: {fmt(avg)} | pico: {fmt(max(x[0] for x in turns))}")
    print()
    print("Sugestoes: se alguma ferramenta falha muito, revisar como o agente a chama;")
    print("se arquivos centrais estao caros de editar, considerar /planejar antes.")

    if "--fila" in sys.argv:
        add_candidates(tool_err, tool_cnt, err_samples, central, turns, top_degree)

    db.close()
    return 0


def add_candidates(tool_err, tool_cnt, err_samples, central, turns, top_degree):
    """Propoe candidatos de melhoria a partir dos sinais do diagnostico.

    Cada falha e classificada por CAUSA RAIZ:
      - HARNESS: defeito do motor (vale candidato de motor/self-restart).
      - AGENTE:  erro de disciplina do agente (o remedio e a licao no prompt do
                 harness, nao um bug). Se a licao ja esta gravada no prompt.ts,
                 nao gera candidato de motor — so reporta.
    """
    added = []
    for tool, n in tool_err.most_common(5):
        rate = 100.0 * n / max(1, tool_cnt[tool])
        files = [fp for t, fp, _ in err_samples if t == tool and fp and fp != "?"]
        target = files[0] if files else "(arquivo desconhecido)"
        repeated = n >= 2 and files
        if not (rate >= 20 or repeated):
            continue

        kinds = [classify_error(t, e) for t, _, e in err_samples if t == tool]
        if kinds:
            worst = "HARNESS" if any(k == "HARNESS" for k in kinds) else "AGENTE"
        else:
            worst = "HARNESS"

        if worst == "AGENTE":
            licao_ativa = lesson_graved(tool)
            if licao_ativa:
                print(f"  [INFO] {tool}: falha e de disciplina do agente; a licao ja esta no harness -> sem candidato.")
                continue
            p = tool_prompt_path(tool)
            target_file = p.relative_to(Path.cwd()) if p and p.is_relative_to(Path.cwd()) else (p or "?")
            iid = queue_add(
                titulo=f"Gravar licao no harness: falhas de {tool} sao disciplina do agente ({n}x)",
                evidencia=f"{tool} falhou {n}x ({rate:.0f}%) por erro do AGENTE (nao do motor). "
                          f"Ultima: {target}. Licao sugerida: {lesson_suggestion(tool)}",
                verificacao=f"Gravar a licao em {target_file} e confirmar que a falha nao repete",
            )
            if iid:
                added.append(iid)
            continue

        iid = queue_add(
            titulo=f"Defeito possivel do harness: {tool} falhou {n}x ({rate:.0f}%)",
            evidencia=f"{tool} falhou {n} vez(es) em {tool_cnt[tool]} chamadas ({rate:.0f}%). "
                      f"Ultima: {target}. Causa raiz: HARNESS (investigar no motor).",
            verificacao="Investigar no sploit-src e corrigir; rodar /diagnostico e confirmar queda",
        )
        if iid:
            added.append(iid)

    if central and top_degree:
        p, n, deg = top_degree
        if n >= 3:
            iid = queue_add(
                titulo=f"Arquivo central ({os.path.basename(p)}) tocado {n}x com degree {deg}",
                evidencia=f"Arquivo com alto degree no grafo foi tocado {n} vezes nesta sessao. "
                          f"Cada edicao nele custa caro no contexto.",
                verificacao="Usar /planejar antes de editar arquivos de alto degree; medir no /saude",
            )
            if iid:
                added.append(iid)

    if turns and len(turns) >= 10:
        top_in = max(t[0] for t in turns)
        if top_in >= 80000:
            iid = queue_add(
                titulo=f"Turno com pico de contexto ({top_in:,} tokens de entrada)".replace(",", "."),
                evidencia=f"Pico de entrada de {top_in:,} tokens num turno. Contexto caro e risco de "
                          f"compactacao.".replace(",", "."),
                verificacao="Investigar o que o turno carregou e podar fontes de contexto antes",
            )
            if iid:
                added.append(iid)

    if added:
        print()
        print("=== CANDIDATOS ADICIONADOS A FILA (FILA_MELHORIAS.json) ===")
        for iid in added:
            print(f"  {iid}: veja com `python scripts/fila.py ver {iid}`")
        print("Gerenciar: python scripts/fila.py")
    else:
        print()
        print("Nenhum candidato novo (ja existem propostos na fila).")


def classify_error(tool, err):
    """Classifica a causa raiz de um erro: HARNESS (motor) ou AGENTE (disciplina)."""
    e = err.lower()
    if "tool execution aborted" in e:
        return "AGENTE"
    if "could not find oldstring" in e:
        return "AGENTE"
    if "identical" in e and "oldstring" in e:
        return "AGENTE"
    if "no changes to apply" in e:
        return "AGENTE"
    if "multiple exact matches" in e:
        return "AGENTE"
    if "status code" in e or "non 2xx" in e or "404" in e or "403" in e:
        return "AGENTE"
    if "timed out" in e or "timeout" in e:
        return "AGENTE"
    if "command not found" in e or "not recognized" in e or "não é reconhecido" in e:
        return "AGENTE"
    return "HARNESS"


def tool_prompt_path(tool):
    """Prompt do harness onde a licao de disciplina desta ferramenta deve viver."""
    root = Path(__file__).resolve().parent.parent / "sploit-src" / "packages" / "opencode" / "src" / "tool"
    if tool == "bash":
        return root / "shell" / "prompt.ts"
    if tool == "edit":
        return root / "edit.txt"
    return None


def lesson_graved(tool):
    """True se o harness ja grava a licao de disciplina para esta ferramenta."""
    p = tool_prompt_path(tool)
    if p is None or not p.exists():
        return False
    text = p.read_text(encoding="utf-8", errors="ignore")
    if tool == "bash":
        return "synchronously in this tool" in text
    if tool == "edit":
        return "re-read the file" in text or "re-read" in text or "re-read it" in text
    return True


def lesson_suggestion(tool):
    """Texto exato da licao a gravar no prompt da ferramenta."""
    if tool == "bash":
        return ("If an edit or command targets a file that changed since you last read it (e.g. another "
                "agent edited it, or a previous write touched it), re-read the file first. Stale oldString "
                "is the most common edit failure.")
    if tool == "edit":
        return ("If the file changed since your last Read (another edit, write, or agent modified it), "
                "re-read it before editing. A stale oldString copied from old output is the most common "
                "edit failure.")
    return ""


if __name__ == "__main__":
    sys.exit(main())
