# Avaliação de efetividade das mutações estruturais G5–G9 (Constituição art. 6).
#
# Diferente do medicao_mutacoes.py (que mede comportamento natural lendo transcripts),
# este script identifica os DISPAROS das mutações pelos textos sintéticos que o harness
# persiste no DB (reminders.ts / prompt.ts usam marcadores exatos e estáveis) e mede o
# que aconteceu DEPOIS de cada disparo.
#
# Mutações medidas (marcador -> tipo):
#   "A tool call just failed."                     -> root_cause   (retry consciente de causa raiz)
#   "You just modified a central file"             -> graph_check  (G4: consultar grafo em arquivo central)
#   "You just changed code."                       -> verify_prompt(G5: lembrar de verificar)
#   "The harness ran a verification"               -> auto_verify  (G6/G7: harness verifica sozinho; parseia PASS/FAIL)
#   "This file had a tool error earlier"           -> file_memory  (G8: memória procedural por arquivo)
#   "The harness detected a command that may write persistent state" -> idempotency
#
# Uso: python scripts/avalia_mutacoes.py [--desde "YYYY-MM-DD HH:MM"] [--ate ...] [--db CAMINHO]
# (filtros em UTC; o DB guarda ms UTC)
import sqlite3
import json
import os
import sys
import re
import argparse
from collections import defaultdict
from datetime import datetime, timezone

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

_DB_DIR = os.path.join(os.environ.get("USERPROFILE", ""), ".local", "share", "sploit")
_OE_DIR = os.path.join(os.environ.get("USERPROFILE", ""), ".local", "share", "opencode")
DB_CANDIDATES = [
    os.path.join(_DB_DIR, "sploit.db"),
    os.path.join(_DB_DIR, "opencode-sploit.db"),
]
if not any(os.path.exists(p) for p in DB_CANDIDATES):
    DB_CANDIDATES.append(os.path.join(_OE_DIR, "opencode.db"))

VERIFY_RE = re.compile(
    r"(typecheck|tsgo\b|bun\s+test|pytest|go\s+test|cargo\s+(check|test)|npm\s+(run\s+)?(test|build|typecheck)|pnpm\s+(run\s+)?(test|build|typecheck)|yarn\s+(run\s+)?(test|build|typecheck)|build-sploit|gradlew|mvn\s+test|dotnet\s+(test|build)|python\s+(-m\s+)?pytest|ruff\s+check|eslint)",
    re.IGNORECASE,
)
GRAPH_TOOLS = frozenset((
    "graphify_query_graph", "graphify_get_node", "graphify_get_neighbors",
    "graphify_get_community", "graphify_god_nodes", "graphify_graph_stats",
    "graphify_shortest_path",
))

MARKERS = [
    ("root_cause", "A tool call just failed."),
    ("graph_check", "You just modified a central file"),
    ("verify_prompt", "You just changed code."),
    ("auto_verify", "The harness ran a verification"),
    ("file_memory", "This file had a tool error earlier"),
    ("idempotency", "The harness detected a command that may write persistent state"),
]

RE_RESULT = re.compile(r"Verification result:\s*(PASS|FAIL)")
RE_CMD = re.compile(r"code change \((.+?)\)\.")
JANELA_MS = 15 * 60 * 1000
JANELA_LONGA_MS = 30 * 60 * 1000


def classify_text(text):
    for kind, prefix in MARKERS:
        if text.startswith(prefix):
            return kind
    return None


def parse_event(kind, text):
    """Extrai dados úteis do texto do disparo."""
    ev = {}
    if kind == "auto_verify":
        m = RE_RESULT.search(text)
        ev["status"] = m.group(1) if m else None
        m2 = RE_CMD.search(text.splitlines()[0] if text else "")
        ev["command"] = m2.group(1).strip() if m2 else ""
    elif kind == "file_memory":
        first = text.splitlines()[0] if text else ""
        if ":" in first:
            ev["target"] = first.split(":", 1)[1].strip()
    elif kind == "idempotency":
        first = text.splitlines()[0] if text else ""
        if ":" in first:
            ev["command"] = first.split(":", 1)[1].strip()
    return ev


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


def norm_cmd(c):
    return re.sub(r"\s+", " ", c.strip().lower())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--desde", help="filtra disparos a partir de (UTC, ex.: 2026-08-09 04:13)")
    parser.add_argument("--ate", help="filtra mensagens ate (UTC)")
    parser.add_argument("--db", action="append", default=None, help="caminho do sqlite (repitivel; padrao: DBs do sploit do usuario)")
    args = parser.parse_args()

    def to_ms(s):
        return int(datetime.strptime(s, "%Y-%m-%d %H:%M").replace(tzinfo=timezone.utc).timestamp() * 1000)

    desde_ms = to_ms(args.desde) if args.desde else 0
    ate_ms = to_ms(args.ate) if args.ate else 10**18

    dbs = args.db if args.db else [p for p in DB_CANDIDATES if os.path.exists(p)]
    if not dbs:
        print("Nenhum DB encontrado (use --db).")
        sys.exit(1)

    sess_msgs = defaultdict(list)
    for db_path in dbs:
        if not os.path.exists(db_path):
            print(f"DB nao encontrado: {db_path}")
            sys.exit(1)
        c = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        rows = c.execute(
            "SELECT p.session_id, p.time_created, p.data "
            "FROM part p ORDER BY p.session_id, p.time_created, p.rowid"
        ).fetchall()
        c.close()
        for sid, t, data in rows:
            if t is None or t < desde_ms or t > ate_ms:
                continue
            try:
                d = json.loads(data)
            except Exception:
                continue
            sess_msgs[sid].append((t, d))

    # --- coleta de disparos ---
    firings = []  # {kind, sid, idx, t, ev}
    sessions_scanned = len(sess_msgs)
    for sid, msgs in sess_msgs.items():
        for i, (t, d) in enumerate(msgs):
            if not (isinstance(d, dict) and d.get("type") == "text"):
                continue
            text = d.get("text") or ""
            kind = classify_text(text)
            if not kind:
                continue
            firings.append({"kind": kind, "sid": sid, "idx": i, "t": t, "ev": parse_event(kind, text)})

    by_kind = defaultdict(list)
    for f in firings:
        by_kind[f["kind"]].append(f)

    def window_after(sid, idx, n_msgs, max_ms):
        """Itera as próximas n_msgs mensagens da sessão dentro da janela de tempo."""
        msgs = sess_msgs[sid]
        t0 = msgs[idx][0]
        out = []
        for j in range(idx + 1, min(len(msgs), idx + 1 + n_msgs)):
            t2, d2 = msgs[j]
            if t2 - t0 > max_ms:
                break
            out.append(d2)
        return out

    res = {}

    # G5 verify_prompt: verificação rodou nos próximos turnos?
    eff = 0
    for f in by_kind["verify_prompt"]:
        after = window_after(f["sid"], f["idx"], 3, JANELA_MS)
        if any(VERIFY_RE.search(tp["cmd"]) for d2 in after for tp in tool_parts(d2)):
            eff += 1
    res["verify_prompt"] = (len(by_kind["verify_prompt"]), eff, None)

    # G4 graph_check: grafo consultado nos próximos turnos?
    eff = 0
    for f in by_kind["graph_check"]:
        after = window_after(f["sid"], f["idx"], 3, JANELA_MS)
        if any(tp["tool"] in GRAPH_TOOLS for d2 in after for tp in tool_parts(d2)):
            eff += 1
    res["graph_check"] = (len(by_kind["graph_check"]), eff, None)

    # G6/G7 auto_verify: PASS/FAIL; FAIL resolvido se PASS vem depois (3 turnos ou 2 eventos)
    av = by_kind["auto_verify"]
    passes = sum(1 for f in av if f["ev"].get("status") == "PASS")
    fails = [f for f in av if f["ev"].get("status") == "FAIL"]
    resolved = 0
    for f in fails:
        msgs = sess_msgs[f["sid"]]
        later_pass = False
        seen_fail_after = 0
        for j in range(f["idx"] + 1, len(msgs)):
            t2, d2 = msgs[j]
            if t2 - f["t"] > JANELA_LONGA_MS:
                break
            if isinstance(d2, dict) and d2.get("type") == "text":
                k2 = classify_text(d2.get("text") or "")
                if k2 == "auto_verify":
                    st2 = RE_RESULT.search(d2.get("text") or "")
                    if st2 and st2.group(1) == "PASS":
                        later_pass = True
                        break
                    seen_fail_after += 1
                    if seen_fail_after >= 2:
                        break
            elif any(VERIFY_RE.search(tp["cmd"]) and tp["status"] != "error" for tp in tool_parts(d2)):
                later_pass = True
                break
        if later_pass:
            resolved += 1
    res["auto_verify"] = (len(av), resolved, {"pass": passes, "fail": len(fails)})

    # G8 file_memory: o arquivo voltou a errar depois do lembrete? (menor = melhor)
    recurred = 0
    counted = 0
    for f in by_kind["file_memory"]:
        target = (f["ev"].get("target") or "").replace("\\", "/").lower()
        if not target:
            continue
        counted += 1
        msgs = sess_msgs[f["sid"]]
        bad = False
        for j in range(f["idx"] + 1, min(len(msgs), f["idx"] + 6)):
            t2, d2 = msgs[j]
            if t2 - f["t"] > JANELA_LONGA_MS:
                break
            for tp in tool_parts(d2):
                if tp["status"] == "error" and tp["path"].replace("\\", "/").lower().endswith(target):
                    bad = True
                    break
            if bad:
                break
        if bad:
            recurred += 1
    res["file_memory"] = (counted, recurred, "recorrencia")

    # root_cause: o mesmo tool repetiu erro logo depois? (menor = melhor)
    repeated = 0
    for f in by_kind["root_cause"]:
        msgs = sess_msgs[f["sid"]]
        tools_err_antes = set()
        for d0 in reversed([m[1] for m in msgs[:f["idx"]]]):
            for tp in tool_parts(d0):
                if tp["status"] == "error":
                    tools_err_antes.add(tp["tool"])
            if tools_err_antes:
                break
        after = window_after(f["sid"], f["idx"], 3, JANELA_MS)
        if any(tp["status"] == "error" and tp["tool"] in tools_err_antes for d2 in after for tp in tool_parts(d2)):
            repeated += 1
    res["root_cause"] = (len(by_kind["root_cause"]), repeated, "repeticao")

    # idempotency: o mesmo comando rodou de novo (2a execucao) na janela?
    confirmed = 0
    for f in by_kind["idempotency"]:
        cmd = norm_cmd(f["ev"].get("command") or "")
        if not cmd:
            continue
        after = window_after(f["sid"], f["idx"], 5, JANELA_LONGA_MS)
        if any(norm_cmd(tp["cmd"]) == cmd and tp["status"] == "completed" for d2 in after for tp in tool_parts(d2)):
            confirmed += 1
    res["idempotency"] = (len([f for f in by_kind["idempotency"] if f["ev"].get("command")]), confirmed, "confirmacao")

    # --- relatório ---
    periodo = f"({args.desde or 'inicio'} a {args.ate or 'hoje'} UTC)"
    print(f"\n=== AVALIACAO DAS MUTACOES {periodo} ===")
    print(f"DBs: {'; '.join(os.path.basename(d) for d in dbs)}")
    print(f"Sessoes varridas: {sessions_scanned} | disparos encontrados: {len(firings)}\n")

    linhas = []
    for kind, label, inverso in [
        ("verify_prompt", "G5 verify_prompt (verificou depois?)", False),
        ("graph_check", "G4 graph_check  (consultou grafo depois?)", False),
        ("auto_verify", "G6/G7 auto_verify (FAIL resolvido depois?)", False),
        ("file_memory", "G8 file_memory  (arquivo repetiu erro?)", True),
        ("root_cause", "root_cause      (mesmo tool errou de novo?)", True),
        ("idempotency", "idempotency     (rodou 2x para confirmar?)", False),
    ]:
        total, eff, extra = res[kind]
        if inverso:
            taxa = (100 * eff / total) if total else 0.0
            boa = total > 0 and taxa <= 30.0
        else:
            taxa = (100 * eff / total) if total else 0.0
            boa = total > 0 and taxa >= 50.0
        if total == 0:
            veredito = "SEM DISPAROS"
        elif total < 5:
            veredito = "amostra pequena - acumular"
        elif boa:
            veredito = "MANTIDA por evidencia"
        elif taxa >= 20.0:
            veredito = "observar"
        else:
            veredito = "CANDIDATA A PODA"
        det = ""
        if kind == "auto_verify" and total:
            det = f" [PASS {extra['pass']} / FAIL {extra['fail']}]"
        linhas.append(f"  {label}: {eff}/{total} ({taxa:.1f}%){det} -> {veredito}")
    print("\n".join(linhas))
    print("\nRegra: >=50% efetivo (ou <=30% recorrencia) com >=5 disparos mantem;")
    print("       <20% com >=10 disparos vira candidata a poda (decisao humana).")


if __name__ == "__main__":
    main()
