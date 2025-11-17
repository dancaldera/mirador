# SeerDB

> A modern terminal database explorer for PostgreSQL, MySQL, and SQLite

**Created by [Daniel Caldera](https://github.com/dancaldera)**

SeerDB is a fast terminal tool for exploring databases. Navigate with your keyboard, run queries, and manage connections with a beautiful text interface.

Built with TypeScript, React (Ink), and Bun native modules for maximum performance.

## ✨ Features

- 🗄️ **Multi-Database**: PostgreSQL, MySQL, SQLite
- ⌨️ **Terminal UI**: Navigate with keyboard shortcuts
- 🤖 **AI Agent Ready**: Programmatic APIs & headless mode with TOON format
- 🔗 **Save Connections**: Quick access to your databases with encrypted storage
- 📋 **Browse Schema**: Tables, columns, and data types
- 👀 **Preview Data**: Paginate through table contents
- 📝 **Query History**: Track your database queries
- ⚡ **Blazing Fast**: Built with Bun for speed
- 🛡️ **Security Guardrails**: Query limits and dangerous operation warnings

## 🚀 Installation

### Prerequisites

- [Bun](https://bun.sh) 1.0+ installed

### Option 1: Clone and Build

```bash
# Clone the repository
git clone https://github.com/dancaldera/seerdb.git
cd seerdb

# Install dependencies
bun install

# Build and install globally
bun run build && sudo cp ~/.local/bin/seerdb /usr/local/bin/seerdb

# Run from anywhere
seerdb
```

### Option 2: Development Installation

```bash
# Clone and install
git clone https://github.com/dancaldera/seerdb.git
cd seerdb
bun install

# Add to PATH (add to ~/.zshrc or ~/.bashrc)
export PATH="$HOME/.local/bin:$PATH"

# Build and create symlink
bun run build
ln -sf "$(pwd)/dist/seerdb.sh" ~/.local/bin/seerdb
```

### Development Mode

```bash
# Run with hot reload
bun run dev

# Run tests
bun test

# Type checking
bun run type-check
```

## 📖 Usage

### Interactive Mode (Default)

```bash
seerdb
```

Navigate with keyboard shortcuts:
- `↑/↓` or `j/k` - Navigate
- `Enter` - Select/Confirm
- `Esc` - Go back/Exit
- `?` - Show help
- `Ctrl+C` - Quit

### Command Line Interface

#### Basic Examples

```bash
# Quick PostgreSQL query
seerdb --db-type postgresql --host localhost --database mydb --user myuser --query "SELECT * FROM users LIMIT 10"

# Connect to SQLite database
seerdb --db-type sqlite --connect /path/to/database.sqlite --query "SELECT * FROM table1"

# Use connection string
seerdb --connect "postgresql://user:password@localhost:5432/mydb" --query "SELECT COUNT(*) FROM users"

# List saved connections
seerdb --list-connections

# Use saved connection by name
seerdb --connection-name "Production DB" --query "SELECT * FROM products"
```

#### Output Formats

```bash
# Table format (default)
seerdb --headless --query "SELECT * FROM users" --output table

# JSON format
seerdb --headless --query "SELECT * FROM users" --output json

# TOON format (optimized for AI agents - 30-60% fewer tokens)
seerdb --headless --query "SELECT * FROM users LIMIT 5" --output toon
```

### 🤖 AI Agent Mode

SeerDB includes comprehensive support for AI agents with **TOON format** optimization:

#### Headless Mode for One-off Operations

```bash
# TOON format (default for AI agents)
seerdb --headless --db-type postgresql --connect "postgresql://user:pass@host/db" --query "SELECT * FROM users LIMIT 10" --output toon

# JSON output
seerdb --headless --db-type mysql --host localhost --database mydb --query "SELECT id, name FROM users WHERE active = true" --output json
```

#### API Mode for Interactive Control

```bash
# Start API mode
seerdb --api
```

Send JSON commands via stdin:
```json
{"type": "connect", "payload": {"type": "postgresql", "host": "localhost", "database": "mydb", "user": "myuser", "password": "mypassword"}}
{"type": "query", "payload": {"sql": "SELECT * FROM users LIMIT 5"}}
{"type": "disconnect"}
```

#### Programmatic Interface

```typescript
import { createAgent } from "seerdb/agent-api";

const agent = createAgent();
await agent.connect({
  type: "postgresql",
  host: "localhost",
  database: "mydb",
  user: "myuser",
  password: "mypassword"
});

const result = await agent.query("SELECT * FROM users LIMIT 10");
console.log(`Found ${result.rowCount} users`);
await agent.disconnect();
```

#### 🔒 Security for AI Agents

**Important**: Never share database passwords in conversations with AI agents.

```bash
# ✅ Safe: Use saved connections by ID
seerdb --list-connections --output json  # Get connection IDs
seerdb --connection-id "QvdD72rW6TEL1cSdoPOPP" --query "SELECT * FROM users"

# ✅ Safe: Use connection without password in command
seerdb --db-type postgresql --host localhost --database mydb --user myuser --query "SELECT 1"

# ❌ Unsafe: Don't share passwords or complete connection strings
```

> **Complete AI agent documentation**: See [AGENTS.md](./AGENTS.md) for comprehensive API reference, examples, and best practices.

## 🛠️ Development

### Available Commands

```bash
# Development
bun dev              # Start with hot-reload using tsx
bun start            # Run built application

# Building
bun run build        # Full build (bundle + compile executable)
bun run build:bundle # Bundle for distribution
bun run build:compile # Compile native executable

# Code Quality
bun check            # Run Biome checks and auto-fix
bun lint             # Run Biome linter
bun format           # Format code with Biome
bun type-check       # TypeScript type checking

# Testing
bun test             # Run tests
bun test:coverage    # Run tests with coverage
```

### Project Architecture

```
seerdb/
├── src/
│   ├── index.tsx              # Main entry point (CLI executable)
│   ├── App.tsx                # Main React application component
│   ├── components/            # UI components (views)
│   │   ├── DBTypeView.tsx     # Database type selection
│   │   ├── ConnectionView.tsx # Database connection input
│   │   ├── TablesView.tsx     # Database tables listing
│   │   ├── ColumnsView.tsx    # Table schema view
│   │   ├── DataPreviewView.tsx # Table data browser
│   │   └── SavedConnectionsView.tsx # Manage saved connections
│   ├── database/             # Database abstraction layer
│   │   ├── types.ts          # Database interfaces
│   │   ├── connection.ts     # Connection management
│   │   ├── postgres.ts       # PostgreSQL driver
│   │   ├── mysql.ts          # MySQL driver
│   │   ├── sqlite.ts         # SQLite driver
│   │   └── pool.ts           # Connection pooling
│   ├── state/                # Application state management
│   │   ├── context.tsx       # React Context providers
│   │   ├── reducer.ts        # Immer-based state reducer
│   │   ├── actions.ts        # Action types and creators
│   │   └── effects.ts        # Side effects (async operations)
│   ├── types/                # TypeScript type definitions
│   │   └── state.ts          # Application state types
│   └── utils/                # Utility functions
│       └── persistence.ts    # Local data persistence
├── dist/                     # Build output
├── .changeset/               # Changelog entries
├── AGENTS.md                 # AI agent documentation
└── README.md                 # This file
```

## 🔧 Configuration

### Connection Storage

- **Location**: `~/.seerdb/connections.json`
- **Security**: Passwords are encrypted at rest
- **Format**: JSON with Zod validation for integrity

### Query History

- **Location**: `~/.seerdb/query-history.json`
- **Purpose**: Track executed queries for convenience
- **Auto-cleanup**: Configurable retention period

### Environment Variables

```bash
# Optional: Set default database type
export SEERDB_DEFAULT_TYPE=postgresql

# Optional: Set connection timeout (seconds)
export SEERDB_CONNECTION_TIMEOUT=30
```

## 🏗️ Technology Stack

- **Runtime**: Bun 1.0+ with native modules
- **Language**: TypeScript 5.3+ with strict typing
- **UI Framework**: [Ink](https://github.com/vadimdemedes/ink) (React for terminal applications)
- **State Management**: React Context + useReducer with [Immer](https://immerjs.github.io/immer/)
- **Database Drivers**:
  - PostgreSQL: [`pg`](https://node-postgres.com/)
  - MySQL: [`mysql2`](https://github.com/sidorares/node-mysql2)
  - SQLite: [`bun:sqlite`](https://bun.sh/docs/api/sqlite)
- **Build Tools**: [esbuild](https://esbuild.github.io/) + [Bun](https://bun.sh)
- **Validation**: [Zod](https://zod.dev/) for runtime type validation
- **Testing**: [Bun Test](https://bun.sh/docs/cli/test)
- **Code Quality**: [Biome](https://biomejs.dev/)

## 🔒 Security Features

- **Query Guards**: Warns about queries without LIMIT clauses
- **Dangerous Operation Detection**: Alerts on DROP, DELETE, TRUNCATE, UPDATE without WHERE
- **Large Result Warnings**: Notifies when queries return >1000 rows
- **Credential Protection**: Passwords encrypted locally, masked in output
- **Connection Pooling**: Prevents connection leaks and exhaustion

## 📄 License

MIT License - see [LICENSE](./LICENSE) file for details

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b dan/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin dan/amazing-feature`
5. Open a Pull Request

Please ensure your code passes all checks:
```bash
bun type-check  # TypeScript compilation
bun test        # All tests pass
bun check       # Code formatting and linting
```

---

Created with ❤️ by [Daniel Caldera](https://github.com/dancaldera) for terminal enthusiasts and database developers
