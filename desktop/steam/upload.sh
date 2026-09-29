#!/usr/bin/env bash
# Uploads the unpacked builds in desktop/release to Steam with steamcmd (install it from Valve first).
# Usage: STEAM_USER=<build account> ./upload.sh   (needs desktop/steam/app_build.vdf, made from the .template)
set -euo pipefail
cd "$(dirname "$0")"
[ -f app_build.vdf ] || { echo "app_build.vdf missing: copy app_build.vdf.template and fill in the ids"; exit 1; }
[ -n "${STEAM_USER:-}" ] || { echo "set STEAM_USER"; exit 1; }
steamcmd +login "$STEAM_USER" +run_app_build "$(pwd)/app_build.vdf" +quit
