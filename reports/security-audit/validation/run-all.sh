#!/bin/sh
set -u
DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
mkdir -p "$DIR/results"
for file in "$DIR"/*.ts; do
  name=$(basename "$file")
  [ "$name" = "smoke.ts" ] && continue
  runner="$DIR/run-check.sh"
  [ "$name" = "09-macos-sandbox-lifetime.ts" ] && runner="$DIR/run-check-macos.sh"
  printf '%-38s' "$name"
  if "$runner" "$name" > "$DIR/results/${name%.ts}.json" 2> "$DIR/results/${name%.ts}.err"; then
    node -e 'const r=require(process.argv[1]); console.log(r.verdict + " " + r.lead)' "$DIR/results/${name%.ts}.json" 2>/dev/null || echo "BAD_OUTPUT"
  else
    printf 'ERROR\n'
    head -c 300 "$DIR/results/${name%.ts}.err"
    printf '\n'
  fi
done
