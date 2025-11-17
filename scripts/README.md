# SeerDB Scripts

This directory contains utility scripts for SeerDB development and usage.

## init-sdb.sh

Initializes the `sdb` command for providing SeerDB agent context to AI assistants.

### What it does:
- Creates `~/bin/sdb` script with multiple modes
- Adds `~/bin` to PATH in `.bashrc` or `.zshrc`
- Creates symlink `seerdb-agent` for backward compatibility
- Supports cross-platform clipboard operations

### Usage:
```bash
# Initialize the sdb command
./scripts/init-sdb.sh

# Then use the sdb command
sdb help        # Show usage
sdb agent       # Show agent documentation
sdb prompt      # Formatted prompt for AI agents
sdb copy        # Copy docs to clipboard
```

### sdb Command Modes:

- **`sdb agent`** - Shows SeerDB agent API documentation
- **`sdb prompt`** - Formatted prompt for AI agents with context
- **`sdb copy`** - Copies agent docs to clipboard (macOS: pbcopy, Linux: xclip, Windows: clip)
- **`sdb help`** - Shows usage information

### Integration with AI Agents:

```bash
# Copy context for AI chat
sdb copy

# Direct pipe to AI agent
sdb prompt | ai-agent-command

# Include in AI workflow
sdb agent > seerdb_context.md
```

The script automatically detects your shell (.zshrc vs .bashrc) and clipboard tools for cross-platform compatibility.