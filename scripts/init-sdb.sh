#!/bin/bash
# SeerDB Agent Context Initializer

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SDB_SCRIPT_DIR="$HOME/bin"
SDB_SCRIPT="$SDB_SCRIPT_DIR/sdb"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "🚀 Initializing SeerDB Agent Context (sdb command)"
echo

# Check if seerdb command exists
if ! command -v seerdb >/dev/null 2>&1; then
    echo -e "${RED}❌ seerdb command not found. Please install SeerDB first.${NC}"
    exit 1
fi

# Create ~/bin directory if it doesn't exist
if [ ! -d "$SDB_SCRIPT_DIR" ]; then
    echo "📁 Creating $SDB_SCRIPT_DIR directory..."
    mkdir -p "$SDB_SCRIPT_DIR"
fi

# Check if ~/bin is in PATH
if [[ ":$PATH:" != *":$HOME/bin:"* ]]; then
    echo -e "${YELLOW}⚠️  $HOME/bin not in PATH${NC}"

    # Add to both .zshrc and .bashrc for compatibility
    CONFIG_FILES=("$HOME/.zshrc" "$HOME/.bashrc")
    UPDATED_FILES=()

    for SHELL_RC in "${CONFIG_FILES[@]}"; do
        if [ -f "$SHELL_RC" ] && ! grep -q "SeerDB Agent Context" "$SHELL_RC" 2>/dev/null; then
            echo "" >> "$SHELL_RC"
            echo "# SeerDB Agent Context" >> "$SHELL_RC"
            echo "export PATH=\"\$HOME/bin:\$PATH\"" >> "$SHELL_RC"
            UPDATED_FILES+=("$SHELL_RC")
        fi
    done

    if [ ${#UPDATED_FILES[@]} -gt 0 ]; then
        echo -e "${GREEN}✅ Added PATH export to: ${UPDATED_FILES[*]}${NC}"
        echo -e "${YELLOW}🔄 Please run: source ~/.zshrc (or ~/.bashrc)${NC}"
    else
        echo -e "${GREEN}✅ PATH already configured${NC}"
    fi
fi

# Create the sdb script
echo "📝 Creating sdb script..."
cat > "$SDB_SCRIPT" << 'EOF'
#!/bin/bash
# SeerDB Agent Context Provider

case "$1" in
    agent|help)
        echo "# SeerDB Agent API Documentation"
        echo "# Use this context for AI agents to understand SeerDB capabilities"
        echo ""
        seerdb --agent-help
        ;;
    prompt)
        echo "You are an AI assistant with access to SeerDB database explorer."
        echo "Use TOON format for data exchange (30-60% fewer tokens than JSON)."
        echo ""
        echo "Available interfaces:"
        echo "- Programmatic API: TypeScript/JavaScript agent interface"
        echo "- API Mode: JSON stdin/stdout protocol"
        echo "- Headless Mode: Command-line with TOON/JSON output"
        echo ""
        echo "Security: Never share credentials, use saved connections."
        echo ""
        echo "Full documentation:"
        echo "```"
        seerdb --agent-help
        echo "```"
        ;;
    copy)
        if command -v pbcopy >/dev/null 2>&1; then
            sdb agent | pbcopy
            echo "SeerDB agent docs copied to clipboard"
        elif command -v xclip >/dev/null 2>&1; then
            sdb agent | xclip -selection clipboard
            echo "SeerDB agent docs copied to clipboard"
        elif command -v clip >/dev/null 2>&1; then
            sdb agent | clip
            echo "SeerDB agent docs copied to clipboard"
        else
            echo "No clipboard tool found. Output:"
            echo
            sdb agent
        fi
        ;;
    *)
        echo "Usage: sdb [agent|help|prompt|copy]"
        echo "  agent  - Show agent documentation"
        echo "  help   - Same as agent"
        echo "  prompt - Formatted prompt for AI agents"
        echo "  copy   - Copy agent docs to clipboard"
        ;;
esac
EOF

chmod +x "$SDB_SCRIPT"

# Create symlink for backward compatibility
if [ ! -L "$SDB_SCRIPT_DIR/seerdb-agent" ]; then
    ln -s "$SDB_SCRIPT" "$SDB_SCRIPT_DIR/seerdb-agent"
    echo "🔗 Created symlink: seerdb-agent -> sdb"
fi

echo
echo -e "${GREEN}✅ SeerDB Agent Context initialized!${NC}"
echo
echo "Usage:"
echo "  sdb agent    - Show agent documentation"
echo "  sdb prompt   - Formatted prompt for AI agents"
echo "  sdb copy     - Copy docs to clipboard"
echo "  sdb help     - Show usage"
echo
echo -e "${YELLOW}Note: Restart your shell or run 'source $SHELL_RC' to use 'sdb'${NC}"