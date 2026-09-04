#!/usr/bin/env bash
# Convenience wrapper: redirect to the root run.sh
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec "$ROOT/run.sh" "$@"
