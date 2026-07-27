#!/bin/bash
# Double-click this file to start Gridiron GM.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Get it from https://nodejs.org (LTS), then run this again."
  read -r -p "Press return to close."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "First run — installing dependencies. This takes a minute or two."
  npm install || { echo "Install failed."; read -r -p "Press return to close."; exit 1; }
fi

echo ""
echo "Starting Gridiron GM at http://localhost:3000"
echo "Leave this window open while you play. Close it (or press Ctrl-C) to stop."
echo ""
( sleep 3 && open http://localhost:3000 ) &
npm run dev
