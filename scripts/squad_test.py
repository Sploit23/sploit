#!/usr/bin/env python3
"""Testes unitarios do squad.py — sem dependencias externas.

Uso: python scripts/squad_test.py
Saida: uma linha por teste (ok/FALHOU) + resumo; exit 0 se todos passarem.
"""

import importlib.util
import io
import pathlib
import sys
import tempfile
from contextlib import redirect_stdout

RAIZ = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("squad", RAIZ / "squad.py")
sq = importlib.util.module_from_spec(spec)
sys.modules["squad"] = sq
spec.loader.exec_module(sq)


def novo_squad(posts=None, agentes=None):
    """Cria um squad temporario com quadro e config; devolve (base, cfg)."""
    base = pathlib.Path(tempfile.mkdtemp(prefix="squad-test-"))
    cfg = {"projeto": "demo-teste", "agentes": agentes or []}
    sdir = base / "squad"
    sdir.mkdir()
    (sdir / "memoria").mkdir()
    (sdir / "squad.json").write_text(
        __import__("json").dumps(cfg, ensure_ascii=False), encoding="utf-8"
    )
    quadro = [sq.HEADER.format(projeto="demo-teste")]
    for nome, estado, msg, data in posts or []:
        quadro.append(f"**[{nome}] ({estado}) {msg} - [{data}]**")
    (sdir / "quadro.md").write_text("\n".join(quadro) + "\n", encoding="utf-8")
    return base, cfg


AGENTES = [
    {"nome": "Ana", "pasta": "frontend", "papel": "UI do totem"},
    {"nome": "Bruno", "pasta": "backend", "papel": "API"},
    {"nome": "Auditor", "pasta": "auditoria", "papel": "especialista em auditoria de codigo"},
    {"nome": "Seguranca", "pasta": "seguranca", "papel": "pentest - especialista em seguranca"},
]


def test_parse_quadro():
    base, _ = novo_squad(posts=[("Ana", "feito", "tela pronta", "11/08/2026 10:00")])
    posts = sq.parse_quadro(base)
    assert len(posts) == 1, f"esperava 1 post, veio {len(posts)}"
    p = posts[0]
    assert (p["nome"], p["estado"], p["msg"], p["data"]) == (
        "Ana",
        "feito",
        "tela pronta",
        "11/08/2026 10:00",
    )


def test_parse_ignora_nao_posts():
    base, _ = novo_squad()
    q = base / "squad" / "quadro.md"
    q.write_text("linha solta\n**[Ana] (feito) ok - [11/08/2026 10:00]**\n", encoding="utf-8")
    posts = sq.parse_quadro(base)
    assert len(posts) == 1, f"linha solta entrou como post: {len(posts)}"


def test_tarefa_pendente_sem_resposta():
    base, _ = novo_squad(
        posts=[
            ("Coordenador", "pendente", "Ana: faca a tela", "11/08/2026 10:00"),
        ]
    )
    posts = sq.parse_quadro(base)
    tp, idx = sq.tarefa_pendente(posts, "Ana")
    assert tp is not None and idx == 0, "tarefa nomeada nao detectada"
    tp_b, _ = sq.tarefa_pendente(posts, "Bruno")
    assert tp_b is None, "Bruno pegou tarefa da Ana"


def test_tarefa_pendente_respondida():
    base, _ = novo_squad(
        posts=[
            ("Coordenador", "pendente", "Ana: faca a tela", "11/08/2026 10:00"),
            ("Ana", "feito", "tela no ar", "11/08/2026 10:30"),
        ]
    )
    posts = sq.parse_quadro(base)
    tp, _ = sq.tarefa_pendente(posts, "Ana")
    assert tp is None, "tarefa ja respondida ainda aparece como pendente"


def test_estado_agente():
    base, _ = novo_squad(
        posts=[
            ("Coordenador", "pendente", "Bruno: crie /ping", "11/08/2026 10:00"),
            ("Ana", "feito", "tela no ar", "11/08/2026 10:30"),
        ]
    )
    posts = sq.parse_quadro(base)
    est, acao = sq.estado_agente(posts, "Bruno")
    assert est == "pendente" and acao.startswith("Bruno"), f"Bruno: {est}/{acao}"
    est, acao = sq.estado_agente(posts, "Ana")
    assert est == "feito", f"Ana: {est}/{acao}"
    est, acao = sq.estado_agente(posts, "Auditor")
    assert est == "pendente" and acao == "aguardando", f"Auditor: {est}/{acao}"


def test_sparkline_24h():
    assert sq.sparkline_24h([]) == "", "quadro vazio deveria dar sparkline vazia"
    base, _ = novo_squad(posts=[("Ana", "feito", "x", "11/08/2026 10:00")])
    posts = sq.parse_quadro(base)
    spark = sq.sparkline_24h(posts)
    assert spark and set(spark) <= set("\u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588\u00b7"), spark


def test_daily_saida():
    hoje = sq.now()
    base, _ = novo_squad(
        posts=[
            ("Ana", "feito", "tela pronta", hoje),
            ("Bruno", "feito", "API no ar", hoje),
            ("Bruno", "bloqueado", "sem credenciais", hoje),
        ],
        agentes=AGENTES[:2],
    )
    buf = io.StringIO()
    with redirect_stdout(buf):
        rc = sq.cmd_daily(
            type("A", (), {"dir": str(base), "data": ""})
        )
    out = buf.getvalue()
    assert rc == 0
    assert "Total: 2 entregas" in out, out
    assert "1 bloqueio" in out, out
    assert "Ana" in out and "Bruno" in out


def test_dashboard_saida_e_salvar():
    hoje = sq.now()
    base, _ = novo_squad(
        posts=[
            ("Ana", "feito", "tela pronta", hoje),
            ("Seguranca", "feito", "SEGURANCA: aprovado, 1 achado", hoje),
        ],
        agentes=AGENTES,
    )
    buf = io.StringIO()
    with redirect_stdout(buf):
        rc = sq.cmd_dashboard(
            type("A", (), {"dir": str(base), "salvar": True})
        )
    out = buf.getvalue()
    assert rc == 0
    assert "DASHBOARD" in out and "VIS\u00c3O GERAL" in out, out
    assert "ATIVIDADE 24H" in out, out
    destino = base / "squad" / "dashboard.md"
    assert destino.exists(), "dashboard.md nao foi salvo"
    conteudo = destino.read_text(encoding="utf-8")
    assert "\x1b[" not in conteudo, "dashboard.md ficou com codigos ANSI"


def test_montar_prompt_perfis():
    base, cfg = novo_squad(agentes=AGENTES)
    cfg["projeto"] = "demo-teste"
    normal = sq.montar_prompt(base, cfg, AGENTES[0])
    assert "SEU LUGAR NESTA RODADA" in normal
    assert "Trabalhe SOMENTE aqui" in normal or "Pasta de trabalho" in normal
    auditor = sq.montar_prompt(base, cfg, AGENTES[2])
    assert "AUDITORIA: aprovado" in auditor and "NAO edite o codigo" in auditor
    segur = sq.montar_prompt(base, cfg, AGENTES[3])
    assert "SEGURANCA: aprovado" in segur and "payloads maliciosos" in segur
    assert "AUDITORIA: aprovado" not in segur, "seguranca nao deveria herdar o veredito do auditor"


def test_post_valida_agente_e_estado():
    base, _ = novo_squad(agentes=AGENTES[:1])
    try:
        sq.cmd_post(type("A", (), {"dir": str(base), "nome": "Fantasma", "estado": "feito", "msg": "x"}))
        raise AssertionError("agente inexistente deveria falhar")
    except SystemExit:
        pass
    try:
        sq.cmd_post(type("A", (), {"dir": str(base), "nome": "Ana", "estado": "hackeado", "msg": "x"}))
        raise AssertionError("estado invalido deveria falhar")
    except SystemExit:
        pass


def test_celebracao():
    hoje = sq.now()
    base, _ = novo_squad(
        posts=[
            ("Ana", "feito", "tela pronta", hoje),
            ("Bruno", "feito", "API no ar", hoje),
            ("Bruno", "bloqueado", "sem credenciais", hoje),
        ],
        agentes=AGENTES[:2],
    )
    posts = sq.parse_quadro(base)
    linha = sq.postar_celebracao(base, posts)
    assert "fila conclu\u00edda: 2 entregas \u00b7 1 bloqueio" in linha, linha
    quadro = (base / "squad" / "quadro.md").read_text(encoding="utf-8")
    assert "Coordenador] (feito)" in quadro, "celebracao nao foi escrita no quadro"
    posts2 = sq.parse_quadro(base)
    assert len(posts2) == 4, "celebracao deveria entrar como novo post"
    assert all("entregas" not in p["msg"] for p in posts2[:3]), "plural nao deveria mudar posts antigos"


def _args_teto(max_lancamentos=30, max_minutos=120.0):
    return type("A", (), {"max_lancamentos": max_lancamentos, "max_minutos": max_minutos})()


def test_teto_supervisor_segue_dentro_do_limite():
    args = _args_teto(max_lancamentos=30, max_minutos=120.0)
    assert sq.teto_supervisor(5, inicio=0.0, args=args, agora=10.0) is None


def test_teto_supervisor_bate_por_lancamentos():
    args = _args_teto(max_lancamentos=30, max_minutos=120.0)
    assert sq.teto_supervisor(30, inicio=0.0, args=args, agora=10.0) == "lancamentos"
    # nao deve deixar passar do teto so porque nao bateu em cheio
    assert sq.teto_supervisor(31, inicio=0.0, args=args, agora=10.0) == "lancamentos"


def test_teto_supervisor_bate_por_tempo():
    args = _args_teto(max_lancamentos=30, max_minutos=120.0)
    passou_2h = 120.0 * 60
    assert sq.teto_supervisor(1, inicio=0.0, args=args, agora=passou_2h) == "tempo"
    assert sq.teto_supervisor(1, inicio=0.0, args=args, agora=passou_2h - 1) is None


def test_teto_supervisor_zero_desliga_o_respectivo_teto():
    args = _args_teto(max_lancamentos=0, max_minutos=0)
    # mesmo com numeros gigantes, teto=0 significa "sem teto" nesse eixo
    assert sq.teto_supervisor(10_000, inicio=0.0, args=args, agora=10_000_000.0) is None


def test_teto_supervisor_lancamentos_tem_prioridade_sobre_tempo():
    args = _args_teto(max_lancamentos=5, max_minutos=120.0)
    # bate os dois ao mesmo tempo — o motivo relatado deve ser o primeiro checado
    assert sq.teto_supervisor(5, inicio=0.0, args=args, agora=120.0 * 60) == "lancamentos"


def test_cmd_check_integrado():
    base, _ = novo_squad(agentes=AGENTES)
    for a in AGENTES:
        (base / "squad" / "memoria" / f"{a['nome']}.md").write_text("# memoria\n", encoding="utf-8")
    rc = sq.cmd_check(type("A", (), {"dir": str(base)}))
    assert rc == 0, "check deveria passar com squad integro"


TESTS = [
    test_parse_quadro,
    test_parse_ignora_nao_posts,
    test_tarefa_pendente_sem_resposta,
    test_tarefa_pendente_respondida,
    test_estado_agente,
    test_sparkline_24h,
    test_daily_saida,
    test_dashboard_saida_e_salvar,
    test_montar_prompt_perfis,
    test_post_valida_agente_e_estado,
    test_celebracao,
    test_teto_supervisor_segue_dentro_do_limite,
    test_teto_supervisor_bate_por_lancamentos,
    test_teto_supervisor_bate_por_tempo,
    test_teto_supervisor_zero_desliga_o_respectivo_teto,
    test_teto_supervisor_lancamentos_tem_prioridade_sobre_tempo,
    test_cmd_check_integrado,
]


def main():
    falhas = 0
    for t in TESTS:
        try:
            t()
        except Exception as e:  # noqa: BLE001
            falhas += 1
            print(f"FALHOU {t.__name__}: {e}")
        else:
            print(f"ok {t.__name__}")
    print(f"\n{len(TESTS) - falhas}/{len(TESTS)} testes passaram")
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(main())
