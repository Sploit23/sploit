#!/usr/bin/env python3
"""saude.py — diagnostico de saude da sessao do Sploit.

Le o banco local (sploit.db) e reporta em PT-BR:
sessao atual, tokens, custo, cache, compactacoes, contexto efetivo.

Uso: python scripts/saude.py [sessao_id]
"""

import sqlite3
import sys
import json
from pathlib import Path

_DB_DIR = Path.home() / ".local" / "share" / "sploit"
DB = _DB_DIR / "sploit.db"
if not DB.exists():
    # Legado da desvinculacao opencode->sploit (antes da Fase 4).
    DB = _DB_DIR / "opencode-sploit.db"

# Precos estimados por milhao de tokens (USD) quando o provider nao reporta custo.
# Ajuste conforme o modelo/proxy usado. 0 desliga a estimativa.
PRICE_INPUT = 3.0
PRICE_OUTPUT = 15.0
PRICE_CACHE_READ = 0.30
PRICE_CACHE_WRITE = 1.50


def fmt(n):
    return f"{n:,.0f}".replace(",", ".")


def estimate_cost(ti, to, tc, tw, tr, reported=0):
    if reported and reported > 0:
        return reported
    if not (PRICE_INPUT or PRICE_OUTPUT):
        return 0.0
    return (
        ti * PRICE_INPUT
        + (to + tr) * PRICE_OUTPUT
        + tc * PRICE_CACHE_READ
        + tw * PRICE_CACHE_WRITE
    ) / 1_000_000


def main():
    if not DB.exists():
        print(f"ERRO: banco nao encontrado em {DB}")
        return 1

    db = sqlite3.connect(str(DB))
    cur = db.cursor()

    cur.execute(
        """SELECT id, title, substr(time_created,1,19), substr(time_updated,1,19),
                  tokens_input, tokens_output, tokens_cache_read,
                  tokens_cache_write, tokens_reasoning, cost
           FROM session ORDER BY time_updated DESC"""
    )
    sessions = cur.fetchall()
    if not sessions:
        print("Nenhuma sessao encontrada.")
        return 1

    arg = sys.argv[1] if len(sys.argv) > 1 else None
    target = arg or sessions[0][0]
    row = next((s for s in sessions if s[0] == target), None)
    if not row:
        print(f"Sessao '{arg}' nao encontrada.")
        return 1

    sid, title, created, updated, ti, to, tc, tw, tr, cost = row
    ti = ti or 0
    to = to or 0
    tc = tc or 0
    tw = tw or 0
    tr = tr or 0
    cost = cost or 0
    est = estimate_cost(ti, to, tc, tw, tr, cost)
    est_note = " (estimado)" if cost == 0 and est > 0 else ""

    print(f"=== SAUDE DA SESSAO: {sid[:20]}... ===")
    print(f"Titulo : {title or '(sem titulo)'}")
    print(f"Inicio : {created}   Ultimo update: {updated}")
    print()
    print(f"Tokens de entrada   : {fmt(ti)}")
    print(f"Tokens de saida     : {fmt(to)}")
    print(f"Tokens em cache     : {fmt(tc)} (read) / {fmt(tw)} (write)")
    print(f"Tokens de raciocinio: {fmt(tr)}")
    print(f"Custo estimado      : US$ {est:.4f}{est_note}")
    if ti + to > 0:
        print(f"Eficiencia de cache : {100 * tc / (tc + ti + to):.1f}% dos tokens vieram do cache")
    print()

    # mensagens assistente -> contexto efetivo e media por turno
    cur.execute(
        """SELECT data FROM message
           WHERE session_id=? AND json_extract(data,'$.role')='assistant' AND json_extract(data,'$.tokens') IS NOT NULL
           ORDER BY time_created""",
        (sid,),
    )
    rows = [r[0] for r in cur.fetchall()]
    inputs, outputs, caches, totals = [], [], [], []
    for r in rows:
        try:
            d = json.loads(r)
        except Exception:
            continue
        t = d.get("tokens")
        if not isinstance(t, dict):
            continue
        t_in = t.get("input", 0) or 0
        t_out = t.get("output", 0) or 0
        c_read = (t.get("cache") or {}).get("read", 0) or 0
        inputs.append(t_in)
        outputs.append(t_out)
        caches.append(c_read)
        totals.append(t_in + t_out + c_read)

    n = len(inputs)
    print(f"Turnos de assistente: {n}")
    if n:
        import statistics

        print(f"  entrada/turno : media {fmt(statistics.mean(inputs))}  max {fmt(max(inputs))}")
        print(f"  saida/turno   : media {fmt(statistics.mean(outputs))}  max {fmt(max(outputs))}")
        print(f"  cache/turno   : media {fmt(statistics.mean(caches))}")
        print(f"  contexto efetivo (pico): {fmt(max(totals))} tokens")
    print()

    # compactacoes
    cur.execute(
        "SELECT COUNT(*) FROM part WHERE session_id=? AND json_extract(data,'$.type')='compaction'",
        (sid,),
    )
    comp = cur.fetchone()[0]
    print(f"Compactacoes: {comp}")
    if comp:
        cur.execute(
            """SELECT data FROM part
               WHERE session_id=? AND json_extract(data,'$.type')='compaction'
               ORDER BY rowid DESC LIMIT 3""",
            (sid,),
        )
        for r in cur.fetchall():
            try:
                d = json.loads(r[0])
                parts = d.get("parts") or []
                keep = d.get("keep", [])
                print(
                    f"  ultima: {len(parts)} partes, manteve {len(keep)}, razzao={d.get('compactionReason') or d.get('reason') or '?'}"
                )
            except Exception:
                pass
    print()

    # tool parts (peso de output)
    cur.execute(
        """SELECT data FROM part
           WHERE session_id=? AND json_extract(data,'$.type')='tool'""",
        (sid,),
    )
    tool_bytes = 0
    tool_count = 0
    for r in cur.fetchall():
        try:
            d = json.loads(r[0])
        except Exception:
            continue
        st = d.get("state")
        out = st.get("output", "") if isinstance(st, dict) else ""
        tool_bytes += len(out) if isinstance(out, str) else 0
        tool_count += 1
    print(f"Saidas de ferramenta: {tool_count} chamadas, {fmt(tool_bytes)} bytes totais no historico")

    # outras sessoes recentes
    print()
    print("Sessoes recentes:")
    for s in sessions[:5]:
        mark = "*" if s[0] == sid else " "
        print(
            f"  {mark} {s[0][:20]}... in={fmt(s[4] or 0)} out={fmt(s[5] or 0)} cache={fmt(s[6] or 0)}  {s[2]}  {str(s[1] or '')[:24]}"
        )

    db.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
