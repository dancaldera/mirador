# SeerDB

> A modern, terminal-based database explorer for PostgreSQL, MySQL, and SQLite

SeerDB is a powerful TUI (Text User Interface) application that lets you explore, query, and manage your databases directly from your terminal. Built with TypeScript, React (Ink), and Bun for blazing-fast performance.

## Features

- **Multi-Database Support**: Connect to PostgreSQL, MySQL, and SQLite databases
- **Interactive TUI**: Beautiful terminal UI with keyboard navigation
- **AI Agent Ready**: Programmatic APIs, JSON API mode, and headless automation
- **Connection Management**: Save and manage multiple database connections
- **Schema Exploration**: Browse tables, columns, and data types
- **Data Preview**: View and paginate through table data
- **Query History**: Track your database interactions
- **Standalone Executable**: Compile to a single binary with no runtime dependencies
- **Fast & Lightweight**: Built with Bun and optimized for performance

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) 1.0+ installed
- Node.js 18+ (for npm package usage)

### Installation

#### Option 1: Run from source

```bash
# Clone the repository
git clone <repository-url>
cd seerdb

# Install dependencies
bun install

# Run in development mode
bun run dev
```

#### Option 2: Build and run executable

```bash
# Build standalone executable
bun run build:exe

# Run the executable
./dist/seerdb.sh
```

#### Option 3: Install globally (after building)

```bash
# Create installation directory
sudo mkdir -p /usr/local/lib/seerdb

# Copy files
sudo cp dist/seerdb /usr/local/lib/seerdb/
sudo cp dist/yoga.wasm /usr/local/lib/seerdb/

# Create symlink (or copy the wrapper script)
sudo ln -sf /usr/local/lib/seerdb/seerdb /usr/local/bin/seerdb

# Run from anywhere
seerdb
```

### AI Agent Quick Start

**🚀 TOON Format (Default)**: SeerDB uses TOON (Token-Oriented Object Notation) as the default format for AI agent data exchange. TOON provides **30-60% fewer tokens** than JSON while maintaining full compatibility.

**1. Install dependencies:**
```bash
bun install
```

**2. Use the programmatic API with TOON format:**
```typescript
import { createAgent } from "seerdb/agent-api";

const agent = createAgent();
await agent.connect({ type: "postgresql", host: "localhost", database: "mydb" });

// Export data in TOON format (default for agents)
const result = await agent.query("SELECT * FROM users LIMIT 10");
const toonData = await agent.exportData(result, "toon"); // 30-60% fewer tokens than JSON
console.log(toonData);

// Direct table export in TOON
const tableToon = await agent.exportTableToToon("products", { limit: 100 });
await agent.disconnect();
```

**3. Or use headless mode:**
```bash
# TOON format (optimized for AI agents - 30-60% fewer tokens)
seerdb --headless --db-type postgresql --connect "postgresql://user:pass@host/db" --query "SELECT * FROM users LIMIT 10" --output toon

# JSON format
seerdb --headless --db-type postgresql --connect "postgresql://user:pass@host/db" --query "SELECT COUNT(*) FROM users" --output json
```

**4. Or API mode for interactive control:**
```bash
seerdb --api
# Then send: {"type": "connect", "payload": {"type": "postgresql", "connectionString": "..."}}
```

See [AGENTS.md](./AGENTS.md) for complete AI agent documentation and TOON format details.

## Usage

### Connecting to a Database

1. **Select Database Type**: Choose PostgreSQL, MySQL, or SQLite
2. **Enter Connection Details**:
   - **PostgreSQL/MySQL**: Host, port, database name, username, password
   - **SQLite**: File path to database
3. **Save Connection** (optional): Store credentials for quick access later

### Navigating the Interface

- **Arrow Keys** / **j/k**: Navigate through lists
- **Enter**: Select an option
- **Esc**: Go back to previous view or quit
- **Ctrl+S**: Access saved connections
- **?**: Show help (where available)

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `↑` `↓` or `j` `k` | Navigate up/down |
| `Enter` | Select item |
| `Esc` | Go back / Quit |
| `Ctrl+S` | Saved connections |
| `Ctrl+C` | Force quit |

### Command Line Options

```bash
seerdb [OPTIONS]

 MODES:
   --api, -a                    Run in API mode for programmatic control
   --headless                   Run in headless mode (no TUI)
   --list-connections           List all saved connections

CONNECTION OPTIONS:
  --db-type <type>             Database type: postgresql, mysql, sqlite
  --connect, -c <string>       Connection string or SQLite file path
  --host <host>                Database host
  --port <port>                Database port
  --database, -d <name>        Database name
  --user, -u <username>        Database username
  --password, -p <password>    Database password

QUERY OPTIONS:
  --query, -q <sql>            SQL query to execute
   --output <format>            Output format: json, table, toon (default: table)

OTHER:
  --help, -h                   Show help message
```

### Examples

```bash
# List all saved connections (works with any database engine)
seerdb --headless --list-connections --output json

# Query a specific database with TOON format (optimized for AI agents)
seerdb --headless --db-type postgresql --connect "postgresql://user:pass@host/db" --query "SELECT * FROM users LIMIT 5" --output toon

# Query with JSON output
seerdb --headless --db-type postgresql --connect "postgresql://user:pass@host/db" --query "SELECT * FROM users LIMIT 5" --output json
```

## Development

### Project Structure

```
seerdb/
├── src/
│   ├── index.tsx              # Entry point
│   ├── App.tsx                # Main application
│   ├── components/            # UI components (views)
│   ├── database/              # Database drivers & connection pooling
│   ├── state/                 # State management (context + reducer)
│   ├── types/                 # TypeScript definitions
│   └── utils/                 # Utilities & persistence
├── dist/                      # Build output
├── CLAUDE.md                  # Project context for AI assistants
├── EXECUTABLE.md              # Executable distribution guide
└── README.md                  # This file
```

### Available Commands

```bash
# Development
bun dev              # Start with hot-reload
bun start            # Run built version

# Building
bun run build            # Full build (bundle + executable)
bun build:bundle     # Bundle to JavaScript only
bun build:compile    # Create standalone executable
bun build:exe        # Alias for build:compile

# Code Quality
bun lint             # Run Biome linter
bun lint:fix         # Fix linting issues
bun format           # Check code formatting
bun format:fix       # Format code
bun check            # Run all checks and fixes
bun type-check       # TypeScript type checking

# Testing
bun test             # Run tests
bun test:coverage    # Run tests with coverage
```

### Architecture

SeerDB uses a modern React-based architecture:

- **UI Framework**: [Ink](https://github.com/vadimdemedes/ink) - React for CLIs
- **State Management**: React Context + useReducer with Immer
- **Database Drivers**:
  - PostgreSQL: `pg`
  - MySQL: `mysql2`
  - SQLite: `bun:sqlite`
- **Build Tools**: esbuild (bundling) + Bun (compilation)
- **Type Safety**: TypeScript with strict mode + Zod validation

### Key Technologies

- **TypeScript**: Strict typing for reliability
- **React/Ink**: Component-based TUI development
- **Immer**: Immutable state updates
- **Connection Pooling**: Optimized database performance
- **Zod**: Runtime validation for configuration

## Building for Distribution

### Creating a Standalone Executable

```bash
# Build the executable
bun run build:exe
```

This creates:
- `dist/seerdb` - The executable (~59MB)
- `dist/yoga.wasm` - Required WASM file
- `dist/seerdb.sh` - Wrapper script

See [EXECUTABLE.md](./EXECUTABLE.md) for detailed distribution instructions.

### Platform Support

Current builds are for:
- macOS (ARM64 - Apple Silicon)

To build for other platforms, run the build command on the target platform.

## Configuration

SeerDB stores configuration in `dist/demo.db` (SQLite database):
- `connections` table - Saved database connections
- Query history and other data stored in SQLite for better performance

## Troubleshooting

### "Cannot find module './yoga.wasm'" error

Use the wrapper script instead of running the executable directly:

```bash
./dist/seerdb.sh    # ✅ Correct
./dist/seerdb       # ❌ Will fail from outside dist/
```

### Connection Issues

- **PostgreSQL/MySQL**: Ensure the database server is running and accessible
- **SQLite**: Verify the file path is correct and you have read permissions
- Check firewall settings if connecting to remote databases

### Permission Denied

Make the files executable:

```bash
chmod +x dist/seerdb
chmod +x dist/seerdb.sh
```

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow TypeScript strict mode
- Use Biome for linting and formatting (`bun check`)
- Add tests for new features
- Update documentation as needed

## Migration Notes

This project is a **TypeScript rewrite** of the original Go version. It preserves all functionality while leveraging the Node.js ecosystem and React's component model.

**Original (Go)** → **Current (TypeScript)**
- bubbletea → Ink (React for CLIs)
- Go channels/goroutines → async/await with Promises
- Update/View pattern → React hooks + state management
- sql.DB → Driver-specific connection pools

## License

MIT License - see [LICENSE](./LICENSE) file for details

## Acknowledgments

- Built with [Ink](https://github.com/vadimdemedes/ink) by Vadim Demedes
- Powered by [Bun](https://bun.sh) runtime
- Inspired by database exploration tools like pgcli, mycli, and DBeaver

## Support

For issues, questions, or contributions, please visit the [GitHub repository](<repository-url>).

---

Made with ❤️ for terminal enthusiasts and database developers
