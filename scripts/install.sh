#!/bin/bash
set -euo pipefail

if [ ! -f dist/tt ]; then
  echo "Error: dist/tt not found. Run 'bun run build' first."
  exit 1
fi

cp dist/tt /usr/local/bin/tt
echo "Installed tt to /usr/local/bin/tt"
