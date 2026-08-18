# Medição das mutações estruturais (Constituição art. 6).
# Para cada turno (mensagem do assistant) que editou código/arquivo central, olha as
# próximas 3 mensagens (mesma sessão, <=15min) procurando verificação (G5) ou grafo (G4).
# Uso: python scripts/medicao_mutacoes.py [--desde "YYYY-MM-DD HH:MM"] [--ate ...]
# (filtros em UTC; o DB guarda ms UTC. Mutações G3/G4/G5 ativadas em 2026-08-09 01:13 local)
import sqlite3
import json
import os
import sys
import re
import argparse
from collections import defaultdict, Counter
from datetime import datetime, timezone

_DB_DIR = os.path.join(os.environ["USERPROFILE"], ".local", "share", "sploit")
DB = os.path.join(_DB_DIR, "sploit.db")
if not os.path.exists(DB):
    # Legado da desvinculacao opencode->sploit (antes da Fase 4).
    DB = os.path.join(_DB_DIR, "opencode-sploit.db")
GRAPH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "graphify-out", "graph.json")

CODE_EXTS = (".ts", ".tsx", ".js", ".mjs", ".cjs", ".py", ".rs", ".go", ".java", ".c", ".cpp", ".cs", ".rb", ".php", ".swift", ".kt", ".kts", ".sh", ".ps1", ".zig", ".ex", ".dart", ".jsx", ".vue", ".svelte")
VERIFY_RE = re.compile(r"(typecheck|tsgo\b|bun\s+test|pytest|go\s+test|cargo\s+(check|test)|npm\s+(run\s+)?(test|build|typecheck)|pnpm\s+(run\s+)?(test|build|typecheck)|yarn\s+(run\s+)?(test|build|typecheck)|build-sploit|gradlew|mvn\s+test|dotnet\s+(test|build)|python\s+(-m\s+)?pytest|ruff\s+check|eslint)", re.IGNORECASE)
GRAPH_TOOLS = frozenset(("graphify_query_graph", "graphify_get_node", "graphify_get_neighbors", "graphify_get_community", "graphify_god_nodes", "graphify_graph_stats", "graphify_shortest_path"))

def load_central_files():
    if not os.path.exists(GRAPH):
        return []
    try:
        with open(GRAPH, "r", encoding="utf-8") as f:
            g = json.load(f)
    except Exception:
        return []
    degree = Counter()
    for link in g.get("links", []):
        degree[link.get("source")] += 1
        degree[link.get("target")] += 1
    code_degree = []
    for node in g.get("nodes", []):
        if node.get("file_type") == "code":
            lbl = str(node.get("source_file") or node.get("label") or node.get("id") or "")
            code_degree.append((degree.get(node.get("id"), 0), lbl))
    code_degree.sort(reverse=True)
    return [lbl for _, lbl in code_degree[:15]]

def match_central(path, centrals):
    pl = path.replace("\\", "/").lower()
    return any(pl.endswith(c.replace("\\", "/").lower()) for c in centrals)

def tool_parts(d):
    out = []
    if not isinstance(d, dict) or d.get("type") != "tool":
        return out
    st = d.get("state", {}) or {}
    inp = st.get("input", {}) or {}
    out.append({
        "tool": d.get("tool", ""),
        "cmd": str(inp.get("command") or inp.get("cmd") or ""),
        "path": str(inp.get("filePath") or inp.get("path") or inp.get("file") or ""),
        "status": st.get("status"),
    })
    return out

def main():
    if not os.path.exists(DB):
        print(f"DB nao encontrado: {DB}")
        sys.exit(1)
    parser = argparse.ArgumentParser()
    parser.add_argument("--desde", help="filtra mensagens a partir de (UTC, ex.: 2026-08-09 04:13)")
    parser.add_argument("--ate", help="filtra mensagens ate (UTC)")
    args = parser.parse_args()

    def to_ms(s):
        return int(datetime.strptime(s, "%Y-%m-%d %H:%M").replace(tzinfo=timezone.utc).timestamp() * 1000)

    desde_ms = to_ms(args.desde) if args.desde else 0
    ate_ms = to_ms(args.ate) if args.ate else 10**18
    label = f"({args.desde or 'inicio'} a {args.ate or 'hoje'} UTC)"

    centrals = load_central_files()
    print(f"Centrais (top-15 degree): {len(centrals)}")

    c = sqlite3.connect(DB)
    sess_msgs = defaultdict(list)
    rows = c.execute(
        "SELECT p.session_id, p.message_id, p.time_created, p.data "
        "FROM part p ORDER BY p.session_id, p.time_created, p.rowid"
    ).fetchall()
    for sid, mid, t, data in rows:
        if t < desde_ms or t > ate_ms:
            continue
        try:
            d = json.loads(data)
        except Exception:
            continue
        sess_msgs[sid].append((mid, t, d))

    edits_code = edits_central = 0
    verified_after = graph_after = 0
    tool_errors = 0

    for sid, msgs in sess_msgs.items():
        for i in range(len(msgs)):
            _, t, d = msgs[i]
            for tp in tool_parts(d):
                if tp["status"] == "error":
                    tool_errors += 1
                if tp["tool"] not in ("edit", "write", "apply_patch", "notebook"):
                    continue
                pl = tp["path"].lower()
                is_code = pl.endswith(CODE_EXTS) and not pl.endswith((".json", ".jsonc", ".lock"))
                is_central = match_central(tp["path"], centrals)
                if is_code:
                    edits_code += 1
                if is_central:
                    edits_central += 1
                if not (is_code or is_central):
                    continue
                # janela: próximas 3 mensagens, <= 15 min
                for j in range(i + 1, min(len(msgs), i + 4)):
                    _, t2, d2 = msgs[j]
                    if t2 - t > 15 * 60 * 1000:
                        break
                    for tp2 in tool_parts(d2):
                        if is_code and VERIFY_RE.search(tp2["cmd"]):
                            verified_after += 1
                        if is_central and tp2["tool"] in GRAPH_TOOLS:
                            graph_after += 1
                    # para não contar 2x no mesmo turno de edição, sair após a 1ª evidência
                    if is_code and any(VERIFY_RE.search(x["cmd"]) for x in [tp2 for tp2 in tool_parts(d2)]):
                        break
                    if is_central and any(x["tool"] in GRAPH_TOOLS for x in tool_parts(d2)):
                        break

    print(f"\n=== MEDICAO {label} ===")
    print(f"  Edições de código:          {edits_code}")
    print(f"  ... verificadas em +3 turnos: {verified_after} ({100*verified_after/edits_code:.1f}%)" if edits_code else "")
    print(f"  Edições em centrais:        {edits_central}")
    print(f"  ... com grafo em +3 turnos:  {graph_after} ({100*graph_after/edits_central:.1f}%)" if edits_central else "")
    print(f"  Erros de tool (total):      {tool_errors}")
    c.close()

if __name__ == "__main__":
    main()
