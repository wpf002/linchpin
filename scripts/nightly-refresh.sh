#!/bin/sh
# Nightly refresh: pull new page views, rescore, notify. Run by launchd (see install-nightly.sh).
set -u

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCORING_DIR="$REPO_ROOT/services/scoring"
LOG_DIR="$REPO_ROOT/data/logs"
LOG_FILE="$LOG_DIR/nightly-$(date +%Y-%m-%d).log"
#: Days a cached Wikimedia response is kept. Stored titles live in the database, so pruning only costs refetches.
CACHE_KEEP_DAYS=14
#: Days of nightly logs kept.
LOG_KEEP_DAYS=30

mkdir -p "$LOG_DIR"
cd "$SCORING_DIR" || exit 1

notify() {
  /usr/bin/osascript -e "display notification \"$1\" with title \"Linchpin\"" >/dev/null 2>&1 || true
}

run_step() {
  echo "== $* ($(date '+%H:%M:%S'))" >>"$LOG_FILE"
  if ! .venv/bin/python cli.py "$@" >>"$LOG_FILE" 2>&1; then
    notify "Nightly refresh failed at '$1'. Log: $LOG_FILE"
    exit 1
  fi
}

find "$REPO_ROOT/data/cache/wikimedia" -type f -mtime +"$CACHE_KEEP_DAYS" -delete 2>/dev/null
find "$LOG_DIR" -type f -name 'nightly-*.log' -mtime +"$LOG_KEEP_DAYS" -delete 2>/dev/null

run_step ingest
run_step score

summary="$(grep -E '^characters=' "$LOG_FILE" | tail -n 1)"
notify "Refreshed. ${summary}"
