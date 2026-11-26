#!/bin/sh
set -eu
VALIDATION_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
TARGET=/Users/xirothedev/workspace/graveshift
NAME=$1
shift || true
exec docker run --rm \
  --network none \
  --read-only \
  --tmpfs /scratch:rw,exec,nosuid,size=64m,mode=1777 \
  --tmpfs /tmp:rw,nosuid,size=16m,mode=1777 \
  --memory=512m --memory-swap=512m \
  --cpus=1 --pids-limit=64 \
  --ulimit nofile=64:64 \
  --ulimit nproc=32:32 \
  --ulimit fsize=1048576:1048576 \
  --ulimit cpu=10:10 \
  -e PATH=/usr/local/bin:/usr/bin:/bin \
  -e HOME=/scratch \
  -e TMPDIR=/scratch \
  -e BUN_RUNTIME_TRANSPILER_CACHE_PATH=0 \
  -v "$TARGET:/target:ro" \
  -v "$VALIDATION_DIR:/harness:ro" \
  -v "$VALIDATION_DIR/macos-sandbox-exec-shim.sh:/usr/bin/sandbox-exec:ro" \
  oven/bun:1.4.4 \
  timeout -s KILL 30s bun "/harness/$NAME" "$@"
