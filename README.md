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

## 🔮 Coming Soon

- 🔴 **Redis Support**: Connect and explore Redis databases with the same intuitive interface

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

#### Copy Agent Documentation

```bash
# Copy agent documentation to clipboard for AI agent conversations
seerdb --copy
```

This command copies the complete agent documentation (AGENTS.md) to your clipboard, allowing you to easily paste it into AI agent conversations for proper usage guidance.

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
bun dev              # Start with hot-reload
bun start            # Run built application

# Building
bun run build        # Full build (bundle + compile executable)
bun run build:bundle # Bundle for distribution
bun run build:compile # Compile native executable
bun run build:exe    # Alias for build:compile

# Code Quality
bun check            # Run Biome checks and auto-fix
bun lint             # Run Biome linter
bun lint:fix         # Run Biome linter with auto-fix
bun format           # Format code with Biome
bun format:fix       # Format code with Biome and auto-fix
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
│   ├── agent-api.ts           # Programmatic API for AI agents
│   ├── api-mode.tsx           # JSON API mode for interactive control
│   ├── headless-mode.tsx      # Command-line mode for automation
│   ├── inkControl.ts          # Ink UI control utilities
│   ├── version.ts             # Version information
│   ├── components/            # UI components (views)
│   │   ├── ColumnsView.tsx    # Table schema view
│   │   ├── ConnectionView.tsx # Database connection input
│   │   ├── ContextHeader.tsx  # Context-aware header component
│   │   ├── ContextOverviewView.tsx # Database context overview
│   │   ├── DataPreviewView.tsx # Table data browser
│   │   ├── DBTypeView.tsx    # Database type selection
│   │   ├── IndexesView.tsx    # Database indexes view
│   │   ├── QueryHistoryView.tsx # Query history browser
│   │   ├── QueryView.tsx      # SQL query interface
│   │   ├── RelationshipsView.tsx # Table relationships
│   │   ├── RowDetailView.tsx  # Individual row details
│   │   ├── SavedConnectionsView.tsx # Manage saved connections
│   │   ├── ScrollableHistory.tsx # Scrollable history component
│   │   ├── SearchView.tsx     # Search interface
│   │   ├── TablesView.tsx     # Database tables listing
│   │   ├── ViewBuilder.tsx    # View construction utilities
│   │   └── ViewSummary.tsx    # View summary component
│   ├── database/             # Database abstraction layer
│   │   ├── connection.ts     # Connection management
│   │   ├── errors.ts         # Database error handling
│   │   ├── index.ts          # Database module exports
│   │   ├── mysql.ts          # MySQL driver
│   │   ├── parameterize.ts   # Query parameterization
│   │   ├── pool.ts           # Connection pooling
│   │   ├── postgres.ts       # PostgreSQL driver
│   │   ├── sqlite.ts         # SQLite driver
│   │   └── types.ts          # Database interfaces
│   ├── state/                # Application state management
│   │   ├── actions.ts        # Action types and creators
│   │   ├── context.tsx       # React Context providers
│   │   ├── effects.ts        # Side effects (async operations)
│   │   └── reducer.ts        # Immer-based state reducer
│   ├── types/                # TypeScript type definitions
│   │   ├── agent.ts          # AI agent type definitions
│   │   └── state.ts          # Application state types
│   └── utils/                # Utility functions
│       ├── cli-args.ts       # CLI argument parsing
│       ├── clipboard.ts      # Clipboard operations
│       ├── color-mapping.ts  # Color mapping utilities
│       ├── column-selection.ts # Column selection logic
│       ├── data-processing.ts # Data processing utilities
│       ├── debounced-writer.ts # Debounced file writing
│       ├── export.ts         # Data export functionality
│       ├── history.ts        # History management
│       ├── id-generator.ts   # ID generation utilities
│       ├── persistence.ts    # Local data persistence
│       ├── pk-utils.ts       # Primary key utilities
│       ├── readline.ts       # Readline interface
│       └── selection-theme.ts # Selection theming
├── dist/                     # Build output
├── .changeset/               # Changelog entries
├── AGENTS.md                 # AI agent documentation
├── CLAUDE.md                 # Symlink to AGENTS.md
└── README.md                 # This file
```

#### Technology Stack

- **Runtime**: Node.js 18+ with ES Modules
- **Language**: TypeScript 5.3+ with strict typing
- **UI Framework**: Ink (React for terminal applications)
- **State Management**: React Context + useReducer with Immer for immutability
- **Database Drivers**: `pg` (PostgreSQL), `mysql2` (MySQL), `bun:sqlite` (SQLite)
- **Build Tool**: esbuild for fast compilation
- **Testing**: Bun Test for unit testing
- **Validation**: Zod for runtime type validation
- **Code Quality**: Biome for linting and formatting

#### State Management Architecture

The application uses a **Redux-like pattern** with React Context + useReducer:

- **AppContext**: Global state provider using React Context
- **useReducer**: Manages state transitions with Immer for immutable updates
- **Effects**: Async operations (equivalent to tea.Cmd in the original Go version)
- **Actions**: Type-safe action creators for state mutations

Key state patterns:
- **ViewState enum**: Defines all application views (DBType, Connection, Tables, etc.)
- **ConnectionInfo**: Database connection metadata with local storage persistence
- **TableInfo**: Table schema information
- **Notifications**: Auto-dismissing user notifications with 4-second timeout

#### Database Layer Architecture

**Abstract Interface Pattern** with driver-specific implementations:

- **DatabaseConnection interface**: Common API across all database types
- **Driver adapters**: PostgreSQL, MySQL, and SQLite specific implementations
- **Connection pooling**: Optimized for performance with configurable pools
- **Query parameterization**: Handles different placeholder styles ($1 vs ?)
- **Error handling**: Consistent error types across drivers

#### UI Component Architecture

**React-based Terminal UI** using Ink components:

- **View-based navigation**: State-driven view switching
- **Component composition**: Reusable UI components with consistent patterns
- **Keyboard navigation**: Global shortcuts (Esc to go home, ? for help)
- **Status management**: Loading states, error messages, and notifications

### Key Implementation Details

#### ES Modules Configuration

- Project uses ES module syntax (`import`/`export`)
- TypeScript configured with `"module": "ESNext"` and `"moduleResolution": "bundler"`
- Entry point uses shebang `#!/usr/bin/env node` for direct execution

#### Database Connection Management

- Connections are stored in `~/.seerdb/connections.json` (with encrypted passwords)
- Query history persisted in `~/.seerdb/query-history.json`
- Connection pooling implemented for PostgreSQL and MySQL
- SQLite uses Bun's built-in `bun:sqlite` driver with async wrapper

#### State Persistence

- Saved connections and query history persisted to local filesystem
- Uses Zod schemas for runtime validation of loaded data
- Graceful fallback to empty state for corrupted/missing config

#### Error Handling Patterns

- Database errors wrapped in consistent error types
- User notifications with levels (info, warning, error)
- Auto-dismissing notifications with 4-second timeout
- Global error state displayed in UI

#### Performance Considerations

- No table caching - all queries fetch fresh data directly from database
- Connection pooling to minimize connection overhead
- Debounced input handling for search/filter operations
- Memoized React components to prevent unnecessary re-renders

### Development Guidelines

#### Code Organization

- **Strict TypeScript**: All code must pass strict type checking
- **Biome**: TypeScript-focused linting and formatting
- **Component structure**: Clear separation of state, UI, and data layers
- **Error boundaries**: Consistent error handling with user feedback

#### State Management Patterns

- Use `useAppState()` hook to access global state
- Dispatch actions through `useAppDispatch()` hook
- Async operations should be handled in `effects.ts`
- State updates must be immutable (handled by Immer)

#### Database Operations

- Always use parameterized queries to prevent SQL injection
- Handle connection errors gracefully with user feedback
- Implement proper connection cleanup on component unmount
- Use connection pooling for better performance

#### UI Development

- Follow Ink component patterns (Box, Text, etc.)
- Implement proper keyboard navigation
- Use chalk for terminal styling
- Test UI components with different terminal sizes

#### Testing

- Unit tests for database operations and state management
- Integration tests for complete user flows
- Mock database drivers for reliable testing
- Coverage target: >80%

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
