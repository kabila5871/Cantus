#!/usr/bin/env bash
# Fetch the lazygit sidecar binary bundled by Tauri (bundle.externalBin).
# Run before `npm run tauri dev|build`. Pin the version via LAZYGIT_VERSION.
set -euo pipefail

ver="${LAZYGIT_VERSION:-0.62.1}"
dir="$(cd "$(dirname "$0")/.." && pwd)/src-tauri/binaries"
dest="$dir/lazygit-aarch64-apple-darwin"

if [ -x "$dest" ]; then
  echo "lazygit sidecar already present: $dest"
  exit 0
fi

mkdir -p "$dir"
url="https://github.com/jesseduffield/lazygit/releases/download/v${ver}/lazygit_${ver}_Darwin_arm64.tar.gz"
echo "fetching lazygit $ver"
curl -fsSL "$url" | tar -xz -C "$dir" lazygit
mv "$dir/lazygit" "$dest"
chmod +x "$dest"
echo "lazygit sidecar -> $dest"
