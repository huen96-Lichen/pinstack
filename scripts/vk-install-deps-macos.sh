#!/usr/bin/env bash
set -euo pipefail

MODE="core"
if [[ "${1:-}" == "--full" ]]; then
  MODE="full"
fi

info() { printf "[vk-install] %s\n" "$*"; }
warn() { printf "[vk-install][warn] %s\n" "$*"; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1
}

if ! need_cmd brew; then
  echo "Homebrew not found. Install from https://brew.sh first." >&2
  exit 1
fi

if ! need_cmd python3; then
  echo "python3 not found." >&2
  exit 1
fi

if ! need_cmd npm; then
  echo "npm not found." >&2
  exit 1
fi

install_brew_pkg() {
  local pkg="$1"
  if brew list --versions "$pkg" >/dev/null 2>&1; then
    info "$pkg already installed"
  else
    info "installing $pkg via brew"
    brew install "$pkg"
  fi
}

install_pip_pkg() {
  local pkg="$1"
  info "installing python package: $pkg"
  python3 -m pip install --upgrade "$pkg"
}

install_npm_pkg() {
  local pkg="$1"
  info "installing npm global package: $pkg"
  npm install -g "$pkg"
}

info "Installing core VK dependencies"
install_brew_pkg ffmpeg
install_brew_pkg pandoc

install_pip_pkg markitdown
install_pip_pkg trafilatura
install_pip_pkg openai-whisper

install_npm_pkg markdownlint-cli2
install_npm_pkg textlint

if [[ "$MODE" == "full" ]]; then
  info "Installing optional full dependencies"
  install_pip_pkg whisperx || warn "whisperx install failed; you can retry later"
fi

info "Dependency installation done."
info "Running smoke checks..."
npm run test:vk-smoke || true
npm run report:vk-acceptance || true
