#!/usr/bin/env python3
"""Analisa o bundle JS da UI web para descobrir quais rotas de API ela chama."""

import base64
import http.client
import re
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 4110
TOKEN = base64.b64encode(b"sploit:OxZsBnyrfNUeKdcA").decode()


def fetch(path):
    c = http.client.HTTPConnection("localhost", PORT, timeout=20)
    c.request("GET", f"{path}?auth_token={TOKEN}")
    r = c.getresponse()
    body = r.read()
    c.close()
    return r.status, body


status, html = fetch("/")
print("HTML:", status, len(html))
assets = re.findall(r'(?:src|href)="([^"]+\.(?:js|css))"', html.decode("utf-8", "replace"))
print("ASSETS:", assets)

api_calls = set()
for asset in assets:
    if not asset.endswith(".js"):
        continue
    status, body = fetch(asset)
    print(f"--- {asset}: {status} {len(body)} bytes ---")
    txt = body.decode("utf-8", "replace")
    for m in re.finditer(r'["\'](/api/[^"\']{1,80})["\']', txt):
        api_calls.add(m.group(1))
    for m in re.finditer(r'["\'](/session[^"\']{1,80})["\']', txt):
        api_calls.add(m.group(1))
    for m in re.finditer(r'["\'](/project[^"\']{1,80})["\']', txt):
        api_calls.add(m.group(1))
    for m in re.finditer(r'["\'](/event[^"\']{1,80})["\']', txt):
        api_calls.add(m.group(1))
    for m in re.finditer(r'["\'](/workspace[^"\']{1,80})["\']', txt):
        api_calls.add(m.group(1))

print("\n=== ROTAS ENCONTRADAS NO BUNDLE ===")
for call in sorted(api_calls):
    print(" ", call)
