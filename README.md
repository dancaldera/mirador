# SeerDB

> A modern terminal database explorer for PostgreSQL, MySQL, and SQLite

**Created by [Daniel Caldera](https://github.com/dancaldera)**

SeerDB is a fast terminal tool for exploring databases. Navigate with your keyboard, run queries, and manage connections with a beautiful text interface.

Built with TypeScript, React (Ink), and Bun for maximum performance.

## Features

- 🗄️ **Multi-Database**: PostgreSQL, MySQL, SQLite
- ⌨️ **Terminal UI**: Navigate with keyboard shortcuts
- 🤖 **AI Agent Ready**: Programmatic APIs & headless mode
- 🔗 **Save Connections**: Quick access to your databases
- 📋 **Browse Schema**: Tables, columns, and data types
- 👀 **Preview Data**: Paginate through table contents
- 📝 **Query History**: Track your database queries
- ⚡ **Blazing Fast**: Built with Bun for speed

## Installation

### Prerequisites

- [Bun](https://bun.sh) 1.0+ installed

### Install & Run

```bash
# Clone the repository
git clone <repository-url>
cd seerdb

# Install dependencies
bun install

# Build and install globally
bun run build && bun install -g .

# Run from anywhere
seerdb
```

### Development Mode

```bash
# Run with hot reload
bun run dev
```

## Usage

### Interactive Mode

```bash
seerdb
```

Navigate with arrow keys, `j/k`, and use shortcuts:
- `Enter` - Select
- `Esc` - Go back/quit
- `?` - Help

### Command Line Examples

```bash
# Quick query
seerdb --db-type postgresql --host localhost --database mydb --query "SELECT * FROM users"

# Connect to SQLite
seerdb --db-type sqlite --connect /path/to/db.sqlite --query "SELECT * FROM table1"

# List saved connections
seerdb --list-connections
```

### AI Agent Mode

SeerDB supports AI agents with **TOON format** (30-60% fewer tokens than JSON):

```bash
# Headless mode with TOON output (optimized for AI)
seerdb --headless --db-type postgresql --connect "postgresql://user:pass@host/db" --query "SELECT * FROM users LIMIT 10" --output toon

# API mode for programmatic control
seerdb --api
```

See [AGENTS.md](./AGENTS.md) for complete AI agent documentation.

## Development

### Available Commands

```bash
# Development
bun dev              # Start with hot-reload
bun start            # Run built version

# Building
bun run build        # Full build (bundle + executable)

# Code Quality
bun check            # Run all checks and fixes
bun type-check       # TypeScript type checking

# Testing
bun test             # Run tests
bun test:coverage    # Run tests with coverage
```

### Project Structure

```
seerdb/
├── src/
│   ├── components/    # UI components (views)
│   ├── database/      # Database drivers & pooling
│   ├── state/         # State management
│   └── types/         # TypeScript definitions
├── dist/              # Build output
└── README.md          # This file
```

## Technology Stack

- **UI Framework**: [Ink](https://github.com/vadimdemedes/ink) - React for CLIs
- **State Management**: React Context + useReducer with Immer
- **Database Drivers**: PostgreSQL (`pg`), MySQL (`mysql2`), SQLite (`bun:sqlite`)
- **Build Tools**: esbuild + Bun
- **Type Safety**: TypeScript with strict mode + Zod validation

## License

MIT License - see [LICENSE](./LICENSE) file for details

---

Created with ❤️ by [Daniel Caldera](https://github.com/dancaldera) for terminal enthusiasts and database developers
