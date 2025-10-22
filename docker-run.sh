#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="sleepiq"

usage() {
  echo "Usage: $0 [--persist] USERNAME PASSWORD [extra-args...]"
  echo ""
  echo "Options:"
  echo "  --persist   Mount .sessions volume to persist login sessions"
  echo ""
  echo "Examples:"
  echo "  $0 user@example.com mypassword"
  echo "  $0 --persist user@example.com mypassword"
  echo "  $0 --persist user@example.com mypassword | jq '.rafa.score'"
}

PERSIST=0
if [[ "${1:-}" == "--persist" ]]; then
  PERSIST=1
  shift
fi

if [[ $# -lt 2 ]]; then
  usage
  exit 1
fi

USERNAME="$1"
PASSWORD="$2"
shift 2

DOCKER_ARGS=(--rm)

if [[ $PERSIST -eq 1 ]]; then
  mkdir -p .sessions
  DOCKER_ARGS+=(-v "$(pwd)/.sessions:/app/.sessions")
fi

# Pass all output through; preserve CLI exit codes
exec docker run "${DOCKER_ARGS[@]}" "$IMAGE_NAME" "$USERNAME" "$PASSWORD" "$@"
