#!/bin/zsh
set -e
PK_PROJECT="$(cd -- "$(dirname -- "$0")" && pwd)"
cd "$PK_PROJECT"
if [[ ! -x .runtime/venv/bin/python ]]; then
  python3 -m venv .runtime/venv
  .runtime/venv/bin/pip install -r requirements.txt
fi
echo "Porto Kitch : http://127.0.0.1:8766"
echo "Applications : /restaurant · /livreur · /ceo"
exec .runtime/venv/bin/python server.py --port 8766
