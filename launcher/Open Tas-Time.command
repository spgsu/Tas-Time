#!/bin/bash
# Copyright (c) 2026 Selami Pazarbasi. SPDX-License-Identifier: MIT
# macOS: opens Tas-Time.html (kept beside this file) in its own Chrome or Edge app window.
# No install, server, or settings change. "--check" prints what would run without opening anything.
# First run of a downloaded copy: right-click this file → Open, to get past Gatekeeper.

set -u
here="$(cd "$(dirname "$0")" && pwd)"
app_file="$here/Tas-Time.html"

# Percent-encode the path for a file:// URL (keeps / and unreserved characters).
encode() {
  local s="$1" out="" c i
  local LC_ALL=C
  for ((i = 0; i < ${#s}; i++)); do
    c="${s:i:1}"
    case "$c" in
      [a-zA-Z0-9.~_/-]) out+="$c" ;;
      *) out+="$(printf '%%%02X' "'$c")" ;;
    esac
  done
  printf '%s' "$out"
}
url="file://$(encode "$app_file")"

browser=""
for candidate in "Microsoft Edge" "Google Chrome" "Chromium" "Brave Browser"; do
  for dir in "/Applications" "$HOME/Applications"; do
    if [ -d "$dir/$candidate.app" ]; then browser="$candidate"; break 2; fi
  done
done

if [ "${1:-}" = "--check" ]; then
  echo "Browser: ${browser:-none found (Edge, Chrome, Chromium or Brave)}"
  echo "App: $url"
  exit 0
fi

if [ ! -f "$app_file" ]; then
  echo "Tas-Time.html is missing. Keep this launcher beside the HTML file."
  exit 1
fi

if [ -z "$browser" ]; then
  echo "Chrome or Edge was not found; opening in your default browser instead."
  echo "(Safari and Firefox work, but cannot autosave to your planning-book file.)"
  open "$app_file"
  exit 0
fi

open -na "$browser" --args --app="$url" --new-window
