#!/usr/bin/env python3
"""web-qr.py — gera um QR code PNG da URL de acesso ao Sploit web.

Uso: python scripts/web-qr.py "http://192.168.100.174:4096/?auth_token=..." [saida.png]

Gera a imagem (padrão: %TEMP%/sploit-qr.png) e imprime o caminho no stdout.
"""

import sys
from pathlib import Path
import tempfile

import qrcode

BLACK = "black"
WHITE = "white"


def main():
    url = sys.argv[1] if len(sys.argv) > 1 else None
    if not url:
        print("Uso: python scripts/web-qr.py <url> [saida.png]", file=sys.stderr)
        return 1

    out = sys.argv[2] if len(sys.argv) > 2 else str(Path(tempfile.gettempdir()) / "sploit-qr.png")

    qr = qrcode.QRCode(border=4, box_size=12, error_correction=qrcode.constants.ERROR_CORRECT_M)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color=BLACK, back_color=WHITE)
    img.save(out)
    print(out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
