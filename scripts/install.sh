#!/bin/zsh

# SeerDB Installation Script for macOS (Zsh)
# Usage: curl -fsSL https://raw.githubusercontent.com/dancaldera/seerdb/main/scripts/install.sh | zsh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
    exit 1
}

# Banner
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║                  SeerDB Installer                    ║"
echo "║         Terminal Database Explorer for macOS         ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# Check if running on macOS
info "Checking system compatibility..."
if [[ "$OSTYPE" != "darwin"* ]]; then
    error "This installer is designed for macOS. For other platforms, please visit: https://github.com/dancaldera/seerdb"
fi
success "System check passed - macOS detected"

# Check for required commands
info "Checking required commands..."
command -v git >/dev/null 2>&1 || error "git is required but not installed. Please install Xcode Command Line Tools."

# Check if Bun is installed, if not install it
info "Checking for Bun runtime..."
if ! command -v bun &> /dev/null; then
    warning "Bun not found. Installing Bun..."
    curl -fsSL https://bun.sh/install | bash
    # Add Bun to current session
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
    success "Bun installed successfully"
else
    success "Bun found - $(bun --version)"
fi

# Create installation directory
INSTALL_DIR="$HOME/.local/bin"
info "Setting up installation directory: $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"

# Clone or update repository
REPO_DIR="$HOME/.local/share/seerdb"
if [[ -d "$REPO_DIR" ]]; then
    info "Updating existing installation..."
    cd "$REPO_DIR"
    git pull --quiet origin main 2>/dev/null || warning "Could not update repository"
else
    info "Cloning SeerDB repository..."
    git clone --quiet https://github.com/dancaldera/seerdb.git "$REPO_DIR"
    cd "$REPO_DIR"
fi

# Install dependencies
info "Installing dependencies..."
bun install --silent

# Build the project
info "Building SeerDB..."
bun run build --silent 2>&1 | grep -v ">" || true

# Create symlink
SYMLINK_PATH="$INSTALL_DIR/sdb"
info "Creating symlink at $SYMLINK_PATH"
rm -f "$SYMLINK_PATH"
ln -sf "$REPO_DIR/dist/sdb" "$SYMLINK_PATH"

# Add to PATH if not already present
if ! echo "$PATH" | grep -q "$INSTALL_DIR"; then
    info "Adding $INSTALL_DIR to PATH..."

    # Detect shell configuration file
    SHELL_CONFIG=""
    if [[ -f "$HOME/.zshrc" ]]; then
        SHELL_CONFIG="$HOME/.zshrc"
    elif [[ -f "$HOME/.zprofile" ]]; then
        SHELL_CONFIG="$HOME/.zprofile"
    elif [[ -f "$HOME/.bash_profile" ]]; then
        SHELL_CONFIG="$HOME/.bash_profile"
    fi

    if [[ -n "$SHELL_CONFIG" ]]; then
        # Check if PATH already added
        if ! grep -q "$INSTALL_DIR" "$SHELL_CONFIG"; then
            echo "" >> "$SHELL_CONFIG"
            echo "# Added by SeerDB installer" >> "$SHELL_CONFIG"
            echo "export PATH=\"$INSTALL_DIR:\$PATH\"" >> "$SHELL_CONFIG"
            success "PATH updated in $SHELL_CONFIG"
            warning "Please run 'source $SHELL_CONFIG' or restart your terminal to use sdb"
        fi
    else
        warning "Could not detect shell configuration file"
        warning "Please add $INSTALL_DIR to your PATH manually"
    fi
else
    success "PATH already configured"
fi

# Verify installation
info "Verifying installation..."
if [[ -x "$SYMLINK_PATH" ]]; then
    VERSION=$("$SYMLINK_PATH" --version 2>&1 || echo "unknown")
    success "SeerDB installed successfully!"
    echo ""
    echo "╔══════════════════════════════════════════════════════╗"
    echo "║                    Installation Complete             ║"
    echo "╠══════════════════════════════════════════════════════╣"
    echo "║  Command: sdb                                       ║"
    echo "║  Version: $VERSION"
    echo "╚══════════════════════════════════════════════════════╝"
    echo ""
    info "Quick start:"
    echo "  1. Run: sdb"
    echo "  2. Select your database type"
    echo "  3. Enter connection details"
    echo ""
    info "For more information: https://github.com/dancaldera/seerdb"
    echo ""
else
    error "Installation verification failed"
fi
