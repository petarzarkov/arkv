#!/usr/bin/env bash
set -euo pipefail

# Install Rust toolchain if not present
if ! command -v rustup &>/dev/null; then
  echo "Installing Rust toolchain..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  # shellcheck source=/dev/null
  source "$HOME/.cargo/env"
else
  echo "Rust already installed: $(rustc --version)"
fi

# Ensure cargo is on PATH (handles fresh installs)
if [ -f "$HOME/.cargo/env" ]; then
  # shellcheck source=/dev/null
  source "$HOME/.cargo/env"
fi

# Ensure the wasm32 target is present
if ! rustup target list --installed | grep -q "wasm32-unknown-unknown"; then
  echo "Adding wasm32-unknown-unknown target..."
  rustup target add wasm32-unknown-unknown
else
  echo "wasm32-unknown-unknown target already installed"
fi

# Install wasm-pack if not present
if ! command -v wasm-pack &>/dev/null; then
  echo "Installing wasm-pack..."
  cargo install wasm-pack
else
  echo "wasm-pack already installed: $(wasm-pack --version)"
fi

echo ""
echo "Setup complete."
echo "Next steps:"
echo "  bun install"
echo "  cd packages/rng && bun run build"
