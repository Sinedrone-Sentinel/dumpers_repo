#!/usr/bin/env bash
set -euo pipefail

# Check Python installation
if ! command -v python3 &> /dev/null && ! command -v python &> /dev/null; then
    echo "[ERROR] Python 3 is not installed or not in your PATH."
    echo "Please install Python 3."
    exit 1
fi

PYTHON_CMD="python3"
if ! command -v python3 &> /dev/null; then
    PYTHON_CMD="python"
fi

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if [[ ! -x .venv/bin/python ]]; then
    echo "Creating local virtual environment (.venv)..."
    "$PYTHON_CMD" -m venv .venv
fi

PY=".venv/bin/python"
echo "Installing dependencies into .venv..."
"$PY" -m pip install -q -r requirements.txt

exec "$PY" dumper.py "$@"
