#!/usr/bin/env python3
"""sploit-web-proxy.py — proxy de autenticação para o servidor web do Sploit.

O QR code aponta para este proxy com o token embutido (?auth_token=...). O
proxy valida o token, emite um cookie de sessão e injeta o header
`Authorization: Basic` em TODAS as requisições seguintes, repassando para o
servidor web real (localhost:upstream). Assim o navegador do celular nunca
recebe 401 e a UI abre sem pedir login.

O token no QR é a chave de acesso (a "senha"): sem ele, o proxy responde 401.
As chamadas do SPA (assets, API, SSE) usam o cookie emitido na primeira carga.

Suporta GET/POST/PUT/DELETE/PATCH/HEAD/OPTIONS e streaming (SSE).

Uso:
    python scripts/sploit-web-proxy.py --port 4097 --upstream-port 4096 --password SENHA
"""

import argparse
import base64
import http.client
import sys
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

READ_CHUNK = 8192
COOKIE_NAME = "sploit_web_auth"
AUTH_TOKEN_QUERY = "auth_token"
HOP_BY_HOP = {
    "host", "connection", "transfer-encoding", "content-length",
    "upgrade", "keep-alive", "proxy-authenticate", "proxy-authorization",
}


def main():
    parser = argparse.ArgumentParser(description="Proxy de autenticacao do Sploit web")
    parser.add_argument("--port", type=int, required=True, help="porta em que o proxy escuta")
    parser.add_argument("--upstream-port", type=int, required=True, help="porta do servidor web real")
    parser.add_argument("--password", required=True, help="senha do servidor web")
    args = parser.parse_args()

    expected_token = base64.b64encode(f"sploit:{args.password}".encode("utf-8")).decode("ascii")
    auth_header = "Basic " + expected_token

    class ProxyHandler(BaseHTTPRequestHandler):
        upstream_host = "localhost"
        upstream_port = args.upstream_port
        server_version = "SploitProxy"

        def log_message(self, fmt, *argc):
            print(f"[proxy] {self.address_string()} {self.command} {self.path} -> {fmt % argc}",
                  file=sys.stderr)

        def _has_cookie(self):
            cookies = self.headers.get("Cookie", "")
            return f"{COOKIE_NAME}=1" in cookies

        def _proxy(self):
            parts = urllib.parse.urlsplit(self.path)
            query = urllib.parse.parse_qs(parts.query)

            token_ok = query.get(AUTH_TOKEN_QUERY, [None])[0] == expected_token
            if not (token_ok or self._has_cookie()):
                self.send_response(401)
                self.send_header("WWW-Authenticate", 'Basic realm="Secure Area"')
                self.end_headers()
                return

            clean_path = parts.path
            qs = [(k, v) for k, vals in query.items() for v in vals if k != AUTH_TOKEN_QUERY]

            if clean_path == "/find" and "query" in query and "pattern" not in query:
                clean_path = "/find/file"

            if qs:
                clean_path += "?" + urllib.parse.urlencode(qs)

            length = int(self.headers.get("Content-Length") or 0)
            body = self.rfile.read(length) if length > 0 else None

            headers = {}
            for key, value in self.headers.items():
                if key.lower() in HOP_BY_HOP:
                    continue
                if key.lower() == "cookie":
                    continue
                headers[key] = value
            headers["Host"] = f"{self.upstream_host}:{self.upstream_port}"
            headers["Authorization"] = auth_header

            conn = http.client.HTTPConnection(self.upstream_host, self.upstream_port, timeout=None)
            try:
                conn.request(self.command, clean_path, body=body, headers=headers)
                resp = conn.getresponse()
                resp_headers = resp.getheaders()
                cl = resp.getheader("Content-Length")
                status = resp.status

                self.send_response(status)
                has_length = False
                for key, value in resp_headers:
                    if key.lower() in HOP_BY_HOP:
                        continue
                    if key.lower() == "content-length":
                        has_length = True
                    self.send_header(key, value)
                if token_ok:
                    self.send_header("Set-Cookie", f"{COOKIE_NAME}=1; Path=/; SameSite=Lax")

                if status in (204, 304) or (has_length and cl is not None and int(cl) == 0):
                    self.end_headers()
                elif has_length and cl is not None:
                    remaining = int(cl)
                    self.end_headers()
                    while remaining > 0:
                        chunk = resp.read(min(READ_CHUNK, remaining))
                        if not chunk:
                            break
                        self.wfile.write(chunk)
                        remaining -= len(chunk)
                else:
                    self.send_header("Transfer-Encoding", "chunked")
                    self.end_headers()
                    try:
                        while True:
                            chunk = resp.read1(READ_CHUNK)
                            if not chunk:
                                break
                            if chunk:
                                self.wfile.write(f"{len(chunk):X}\r\n".encode() + chunk + b"\r\n")
                                self.wfile.flush()
                        self.wfile.write(b"0\r\n\r\n")
                        self.wfile.flush()
                    except (BrokenPipeError, ConnectionResetError):
                        pass
                resp.close()
            except Exception as exc:
                try:
                    self.send_error(502, f"proxy upstream: {exc}")
                except Exception:
                    pass
            finally:
                conn.close()

        do_GET = _proxy
        do_POST = _proxy
        do_PUT = _proxy
        do_DELETE = _proxy
        do_PATCH = _proxy
        do_HEAD = _proxy
        do_OPTIONS = _proxy

    server = ThreadingHTTPServer(("0.0.0.0", args.port), ProxyHandler)
    server.daemon_threads = True
    print(f"[proxy] escutando em 0.0.0.0:{args.port} -> localhost:{args.upstream_port}",
          file=sys.stderr, flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
