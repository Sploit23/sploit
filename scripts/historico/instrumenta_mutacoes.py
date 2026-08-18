# instrumenta_mutacoes.py — mede o efeito real das mutações do harness (G5-G9)
# no DB do Sploit: proof-gate (G7), auto-verify (G6), idempotencia (G9),
# memoria por arquivo (G8), causa raiz (Iteracao B), verificação pós-edição (G5).
import json
import sqlite3
import sys
from collections import defaultdict
from pathlib import Path

DB = Path.home() / ".local/share/sploit/sploit.db"
if not DB.exists():
    DB = Path.home() / ".local/share/sploit/opencode-sploit.db"

PREFIXES = {
    "gate": "The harness ran a verification",
    "file_mem": "This file had a tool error earlier in this session",
    "idem": "The harness detected a command that may write persistent state",
    "root": "investigate the root cause",
    "verify_prompt": "You just changed code",
    "anchor": "consult the knowledge graph",
}

TOOLS_EDIT = ("edit", "write", "apply_patch")


def main():
    desde = None
    args = sys.argv[1:]
    if "--desde" in args:
        i = args.index("--desde")
        desde = args[i + 1]
    desde_ms = None
    if desde:
        from datetime import datetime

        desde_ms = int(datetime.fromisoformat(desde).timestamp() * 1000)

    con = sqlite3.connect(DB)
    cur = con.cursor()
    part_rows = cur.execute(
        "SELECT p.session_id, p.time_created, p.data, m.data AS mdata "
        "FROM part p LEFT JOIN message m ON m.id = p.message_id"
    ).fetchall()

    counts = defaultdict(int)
    by_session = defaultdict(lambda: defaultdict(int))
    for sid, tcreated, pdata, mdata in part_rows:
        if desde_ms is not None and tcreated < desde_ms:
            continue
        try:
            part = json.loads(pdata)
        except Exception:
            continue
        ptype = part.get("type")
        if ptype == "text":
            text = part.get("text", "")
            lower = text.lower()
            for key, needle in PREFIXES.items():
                if needle.lower() in lower:
                    counts[key] += 1
                    by_session[sid][key] += 1
        elif ptype == "tool":
            tool = part.get("tool") or part.get("name") or ""
            if tool in TOOLS_EDIT:
                counts["edits"] += 1
                by_session[sid]["edits"] += 1
            if tool == "bash":
                counts["bash"] += 1
                by_session[sid]["bash"] += 1

    print(f"=== Efeito real das mutacoes (DB: {DB.name}) ===")
    print(f"parts: {len(part_rows)}")
    for key, needle in PREFIXES.items():
        print(f"  {key:14s} {counts[key]:5d}   {needle[:50]}")
    print(f"  {'edits':14s} {counts['edits']:5d}")
    print(f"  {'bash':14s} {counts['bash']:5d}")
    if counts["edits"]:
        print(f"\n  verificacao/edicao estimada: {counts['verify_prompt'] + counts['gate']}/{counts['edits']}")

    print("\n=== por sessao (top 8 por mensagens) ===")
    msg_count = defaultdict(int)
    for sid, pdata, mdata in part_rows:
        msg_count[sid] += 1
    for sid, n in sorted(msg_count.items(), key=lambda kv: -kv[1])[:8]:
        h = by_session[sid]
        active = {k: v for k, v in h.items() if v}
        print(f"  {sid}: {n} parts | " + ("; ".join(f"{k}={v}" for k, v in active.items()) or "sem hits"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
