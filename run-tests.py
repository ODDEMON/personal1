#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""跑冒烟测试。

不需要任何第三方包，只用标准库。
会自己找一个能用的 Node：先看 NODE_BIN 环境变量，再找常见的安装位置。
"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))

CANDIDATES = [
    os.environ.get("NODE_BIN", ""),
    r"C:\Program Files\nodejs\node.exe",
    r"C:\nvm4w\nodejs\node.exe",
    os.path.expanduser(r"~\.workbuddy\binaries\node\versions\22.22.2-3\node.exe"),
    os.path.expanduser(r"~\AppData\Roaming\nvm\v22.22.2\node.exe"),
    "node",
]


def find_node():
    for c in CANDIDATES:
        if not c:
            continue
        try:
            subprocess.run([c, "-v"], stdout=subprocess.DEVNULL,
                           stderr=subprocess.DEVNULL, check=True)
            return c
        except (OSError, subprocess.CalledProcessError):
            continue
    return None


def main():
    node = find_node()
    if not node:
        print("没找到 Node。设一下 NODE_BIN 环境变量，或者装上 Node 18+。")
        return 2

    args = sys.argv[1:] or []
    cmd = [node, os.path.join(HERE, "test", "smoke.mjs")] + args
    proc = subprocess.run(cmd, cwd=HERE)
    return proc.returncode


if __name__ == "__main__":
    sys.exit(main())
