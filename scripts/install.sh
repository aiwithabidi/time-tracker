#!/bin/bash
set -euo pipefail

echo "Installing tt — time tracking for developers"
echo ""

# Check for Bun
if ! command -v bun &> /dev/null; then
  echo "Error: Bun is required. Install it with:"
  echo "  curl -fsSL https://bun.sh/install | bash"
  exit 1
fi

# Install dependencies if needed
if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  bun install
fi

# Build the binary
echo "Building tt binary..."
bun run build

# Install to ~/.tt/bin (user-local, no sudo needed)
INSTALL_DIR="$HOME/.tt/bin"
mkdir -p "$INSTALL_DIR"
cp dist/tt "$INSTALL_DIR/tt"
chmod +x "$INSTALL_DIR/tt"

echo ""
echo "Installed tt to $INSTALL_DIR/tt"

# Add to PATH if not already there
if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
  echo ""
  echo "Add tt to your PATH by adding this to your shell profile:"
  echo ""
  echo "  export PATH=\"\$HOME/.tt/bin:\$PATH\""
  echo ""
fi

# Run setup to install hooks
echo "Running tt setup..."
"$INSTALL_DIR/tt" setup

echo ""
echo "Done! Run 'tt now' to check status."
