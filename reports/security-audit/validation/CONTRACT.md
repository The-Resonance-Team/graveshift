# Bounded local validation harness contract

Each harness is a TypeScript file in this directory, mounted read-only at `/harness` inside the compliant container. Target source is mounted read-only at `/target`. Only `/scratch` and `/tmp` are writable, and both are size-bounded tmpfs.

Run a harness with:

```sh
./run-check.sh <name>.ts
```

## Mandatory harness rules

1. Import target modules by absolute `/target/...` path. Workspace imports resolve through `/target/node_modules`.
2. Do not write files. Return all evidence as a single JSON object printed to stdout with `console.log(JSON.stringify(...))`.
3. Print exactly one JSON object and nothing else to stdout. Put diagnostics in the JSON object.
4. Shape: `{"lead":"<exact fingerprint>","verdict":"confirmed|rejected|inconclusive","observed":{...},"reason":"..."}`.
   - `confirmed`: the source-grounded boundary result was observed with dummy data.
   - `rejected`: a source-visible control prevented the claimed result.
   - `inconclusive`: the harness could not establish the result; explain precisely why.
5. Use only dummy principals, fake adapters, and harmless markers. No real credentials, network, provider, GitHub, broker, container, or deployed service. No stress, saturation, or repeated load.
6. Keep the run under 20 seconds and well inside one CPU, 512 MiB, 64 processes, 64 MiB writable disk, and 1 MiB per file. Prefer one or two invocations over loops.
7. Capture the minimum result that settles the invariant. Stop immediately once observed.
8. Do not read or copy secrets, `.env` files, ignored local settings, or anything outside `/target` and `/harness`.
9. If a dependency import fails, print `inconclusive` with the exact error; do not install anything.

## Container controls (enforced by the runner)

`--network none`, `--read-only`, tmpfs `/scratch` (64 MiB) and `/tmp` (16 MiB), `--memory=512m --memory-swap=512m`, `--cpus=1`, `--pids-limit=64`, ulimits `nofile=64`, `nproc=32`, `fsize=1MiB`, `cpu=10s`, and `timeout -s KILL 30s`. Environment is restricted to `PATH`, `HOME=/scratch`, `TMPDIR=/scratch`, `BUN_RUNTIME_TRANSPILER_CACHE_PATH=0`, plus Docker's `HOSTNAME` and `PWD`.
