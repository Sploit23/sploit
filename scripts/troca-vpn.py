"""Controla o Windscribe por linha de comando para trocar de IP.

Uso (Python 3.8+):
    python scripts/troca-vpn.py status
    python scripts/troca-vpn.py paises
    python scripts/troca-vpn.py connect [PAIS]     (ex.: connect US, connect DE)
    python scripts/troca-vpn.py disconnect
    python scripts/troca-vpn.py trocar [PAIS]      (disconnect + connect + espera o IP mudar)

Exemplo de teste de rate-limit:
    1. python scripts/troca-vpn.py status        (anote o IP atual)
    2. python scripts/troca-vpn.py trocar US     (troca de IP)
    3. python scripts/troca-vpn.py status        (confirme o novo IP)
    Depois rode o Sploit normalmente e veja no /saude se o uso voltou.

Pre-requisito: Windscribe instalado e logado (app GUI) - https://windscribe.com
O CLI oficial fica em "C:\\Program Files\\Windscribe\\windscribe-cli.exe".
"""

import argparse
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

CLI_CANDIDATOS = [
    "windscribe-cli",
    r"C:\Program Files\Windscribe\windscribe-cli.exe",
    r"C:\Program Files (x86)\Windscribe\windscribe-cli.exe",
]

TIMEOUT_CLI = 60
TIMEOUT_IP = 60
POLL_SEG = 3


def achar_cli():
    for cand in CLI_CANDIDATOS:
        if shutil.which(cand):
            return shutil.which(cand)
        if Path(cand).exists():
            return cand
    sys.exit("CLI do Windscribe nao encontrado. Instale o app em https://windscribe.com e tente de novo.")


def rodar(cli, args):
    proc = subprocess.run([cli] + args, capture_output=True, text=True, timeout=TIMEOUT_CLI)
    saida = (proc.stdout or "") + (proc.stderr or "")
    return proc.returncode, saida.strip()


def ip_atual():
    try:
        return urllib.request.urlopen("https://api.ipify.org", timeout=10).read().decode().strip()
    except Exception:
        return "?"


def comando_status(cli):
    rc, saida = rodar(cli, ["status"])
    print("IP publico :", ip_atual())
    print("Windscribe :")
    print(saida if rc == 0 else "[CLI sem saida. O app esta logado?]")


def comando_paises(cli):
    rc, saida = rodar(cli, ["locations"])
    if rc != 0:
        sys.exit("Nao foi possivel listar os locais. Confira se o app esta logado.")
    for linha in saida.splitlines():
        print(linha)


def comando_connect(cli, pais):
    args = ["connect"] if not pais else ["connect", pais]
    rc, saida = rodar(cli, args)
    if rc != 0:
        sys.exit("Falha ao conectar:\n" + saida)
    print(saida or "Conectando...")


def comando_disconnect(cli):
    rodar(cli, ["disconnect"])
    print("Desconectado.")


def comando_trocar(cli, pais):
    ip_antes = ip_atual()
    print("IP antes:", ip_antes)
    comando_disconnect(cli)
    time.sleep(2)
    comando_connect(cli, pais)
    print("Esperando a troca de IP (ate %ds)..." % TIMEOUT_IP)
    inicio = time.time()
    while time.time() - inicio < TIMEOUT_IP:
        time.sleep(POLL_SEG)
        ip_depois = ip_atual()
        if ip_depois != ip_antes and ip_depois != "?":
            print("IP depois:", ip_depois)
            print("Troca de IP confirmada.")
            return 0
    print("Timeout: o IP nao mudou (ainda em", ip_atual() + ").")
    print("Dica: use 'paises' para escolher um servidor e tente 'trocar <PAIS>' de novo.")
    return 1


def main():
    parser = argparse.ArgumentParser(
        description="Troca o IP via Windscribe (teste de rate-limit do Sploit)."
    )
    sub = parser.add_subparsers(dest="comando", required=True)
    sub.add_parser("status", help="mostra estado e IP publico")
    sub.add_parser("paises", help="lista os locais disponiveis")
    p_connect = sub.add_parser("connect", help="conecta (opcionalmente a um pais)")
    p_connect.add_argument("pais", nargs="?", help="codigo do pais, ex.: US, DE, CH")
    p_disc = sub.add_parser("disconnect", help="desconecta")
    p_trocar = sub.add_parser("trocar", help="desconecta, conecta e espera o IP mudar")
    p_trocar.add_argument("pais", nargs="?", help="codigo do pais, ex.: US, DE, CH")
    args = parser.parse_args()

    cli = achar_cli()
    if args.comando == "status":
        comando_status(cli)
    elif args.comando == "paises":
        comando_paises(cli)
    elif args.comando == "connect":
        comando_connect(cli, args.pais)
    elif args.comando == "disconnect":
        comando_disconnect(cli)
    elif args.comando == "trocar":
        sys.exit(comando_trocar(cli, args.pais))


if __name__ == "__main__":
    main()
