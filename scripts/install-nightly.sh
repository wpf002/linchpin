#!/bin/sh
# Installs (or reinstalls) the launchd job that runs nightly-refresh.sh at 04:00 local time.
set -eu

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.linchpin.nightly-refresh"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
RUN_HOUR=4

mkdir -p "$HOME/Library/LaunchAgents" "$REPO_ROOT/data/logs"
cat >"$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>/bin/sh</string><string>$REPO_ROOT/scripts/nightly-refresh.sh</string></array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>$RUN_HOUR</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>$REPO_ROOT/data/logs/launchd.log</string>
  <key>StandardErrorPath</key><string>$REPO_ROOT/data/logs/launchd.log</string>
</dict>
</plist>
PLIST

launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Installed $LABEL. Runs daily at $RUN_HOUR:00. Run now: launchctl kickstart gui/$(id -u)/$LABEL"
