#!/bin/sh
# Test shim: accepts `sandbox-exec -p <profile> <command> ...` and execs the command unchanged.
shift 2
exec "$@"
