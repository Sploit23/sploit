#!/usr/bin/env python3
"""Extrai trechos do bundle JS que chamam project.list / session list."""

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


status, body = fetch("/assets/index-ruL4k7pP.js")
txt = body.decode("utf-8", "replace")
print("bundle:", len(txt))

keywords = ["project.list", "project.current", "session.list", "activeWorkspace",
            "workspace:all", "workspace", "directory", "openProject", "projects"]
for kw in keywords:
    print(f"\n===== '{kw}' =====")
    count = 0
    for m in re.finditer(re.escape(kw), txt):
        start = max(0, m.start() - 160)
        end = min(len(txt), m.end() + 260)
        snippet = txt[start:end].replace("\n", " ")
        print("  ...", snippet, "...")
        print()
        count += 1
        if count >= 6:
            break
