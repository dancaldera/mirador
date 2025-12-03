# SeerDB AI Agent Documentation

**🤖 This documentation is specifically for AI Agents.** It contains the rules, guidelines, and technical specifications that AI agents must follow when interacting with SeerDB databases.

This guide explains how AI agents can programmatically interact with SeerDB, the terminal-based database explorer.

## 🚀 OpenCode.ai Integration (Copy-Paste Ready)

**Step 1: Get the documentation**

```bash
# Copy full SeerDB agent documentation to clipboard
sdb --copy
```

**Step 2: Paste into OpenCode.ai**

Open OpenCode.ai and paste the clipboard contents. The documentation will be ready in your chat context.

**Step 3: Start using SeerDB commands**

```bash
# List connections
sdb --headless --list-connections --output toon

# Run queries
sdb --headless --connection-id "YOUR_ID" --query "SELECT * FROM users LIMIT 10" --output toon
```

**That's it!** Your OpenCode.ai session now has full SeerDB context and commands.

---

## Quick Install (macOS and Linux)

```bash
# One-line installation for macOS and Linux
curl -fsSL https://raw.githubusercontent.com/dancaldera/seerdb/main/scripts/install.sh | bash
```

After installation, verify SeerDB is working:

```bash
sdb --version
```

## 🚀 AI Agent Quick Commands

**Copy-paste ready commands for AI agents:**

```bash
# 1. List all saved connections
sdb --headless --list-connections --output toon

# 2. Query using saved connection
sdb --headless --connection-id "YOUR_CONNECTION_ID" --query "SELECT * FROM users LIMIT 10" --output toon

# 3. Get database schema
sdb --headless --connection-id "YOUR_CONNECTION_ID" --query "SELECT table_name, column_name FROM information_schema.columns" --output toon

# 4. Browse table with SQL
sdb --headless --connection-id "YOUR_CONNECTION_ID" --query "SELECT * FROM users WHERE active = true LIMIT 50" --output toon
```

**For complete documentation**: See [README.md](./README.md) for detailed usage instructions.

## ⚡ Super Simple Mode (AI Agent Friendly)

**Ultra-minimal commands for basic operations:**

```bash
# 1. List saved databases/connections
sdb --headless --list-connections --output toon

# 2. Run any SQL query
sdb --headless --query "SELECT * FROM table LIMIT 10" --output toon

# 3. Get schema info
sdb --headless --query "SELECT table_name FROM information_schema.tables" --output toon

# 4. Use saved connection by ID
sdb --headless --connection-id "ID" --query "SELECT * FROM users" --output toon
```

**That's it!** Just these 4 commands handle 90% of agent use cases.

## 🎯 Agent Recipes (Copy-Paste Ready)

### Recipe 1: Explore Any Database Schema

```bash
# Step 1: List connections to find the ID
sdb --headless --list-connections --output toon

# Step 2: Get all tables
sdb --headless --connection-id "YOUR_CONNECTION_ID" --query "SELECT table_name FROM information_schema.tables" --output toon

# Step 3: Get columns for a specific table
sdb --headless --connection-id "YOUR_CONNECTION_ID" --query "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'users'" --output toon
```

### Recipe 2: Quick Data Sampling

```bash
# Sample 10 users safely
sdb --headless --connection-id "YOUR_CONNECTION_ID" --query "SELECT * FROM users LIMIT 10" --output toon

# Sample 50 records with filter
sdb --headless --connection-id "YOUR_CONNECTION_ID" --query "SELECT * FROM products WHERE active = true LIMIT 50" --output toon

# Get record count
sdb --headless --connection-id "YOUR_CONNECTION_ID" --query "SELECT COUNT(*) FROM table_name" --output toon
```

### Recipe 3: Safe Query Execution

```bash
# Safe query (has LIMIT automatically checked)
sdb --headless --connection-id "YOUR_CONNECTION_ID" --query "SELECT id, name, email FROM users LIMIT 25" --output toon

# Get specific user
sdb --headless --connection-id "YOUR_CONNECTION_ID" --query "SELECT * FROM users WHERE id = 123" --output toon

# Search with filter
sdb --headless --connection-id "YOUR_CONNECTION_ID" --query "SELECT * FROM products WHERE category = 'electronics'" --output toon
```

### Recipe 4: API Mode for Complex Operations

```bash
# Start API mode (interactive)
sdb --api

# Then send commands:
{"type": "connect", "payload": {"type": "use_saved", "id": "YOUR_CONNECTION_ID"}}
{"type": "query", "payload": {"sql": "SELECT * FROM users LIMIT 5"}}
{"type": "get_schema"}
{"type": "exit"}
```

### Recipe 5: Programmatic Usage (TypeScript)

```typescript
import { createAgent } from "./dist/index.js";

const agent = createAgent();

// Connect using saved connection ID
await agent.connect({
  type: "postgresql",
  connectionString: "postgresql://user@localhost:5432/db" // or use env vars
});

// Safe operations
const result = await agent.query("SELECT * FROM users LIMIT 10");
const schema = await agent.getSchema();

// Export to TOON
const toonData = await agent.exportData(result, "toon");
console.log(toonData);
```

## Overview

SeerDB provides multiple interfaces for AI agents to safely interact with databases:

1. **Programmatic Agent API** - TypeScript/JavaScript interface for complex applications
2. **API Mode** - JSON-based stdin/stdout protocol for interactive control
3. **Headless Mode** - Command-line execution with JSON output for automation

**🚀 TOON Format (Required for AI Agents)**: SeerDB uses TOON (Token-Oriented Object Notation) as the **default and recommended format for AI agent data exchange**. TOON provides **30-60% fewer tokens** than JSON while maintaining full compatibility and adding LLM-friendly structure validation.

**📋 Format Guidelines**:
- **AI Agents**: Always use TOON format for optimal token efficiency and LLM compatibility
- **Humans**: Use JSON format for readability and standard data interchange

## TOON Format for AI Agents

TOON (Token-Oriented Object Notation) is SeerDB's default format for AI agent data exchange, optimized for LLM prompts:

### Why TOON?

- **Token Efficient**: 30-60% fewer tokens than JSON for uniform data arrays
- **LLM-Friendly**: Explicit array lengths `[N]` and field declarations `{fields}` enable validation
- **Schema Aware**: Column metadata helps models understand data structure
- **Compact Arrays**: Tabular format for uniform object arrays

### TOON Export Methods

```typescript
const agent = createAgent();
await agent.connect(config);

// Export in TOON format (default and recommended for AI agents)
const result = await agent.query("SELECT * FROM users LIMIT 10");
const toonData = await agent.exportData(result, "toon"); // Default format - use for agents

// For human consumption only - use JSON
const jsonData = await agent.exportData(result, "json"); // Human-readable format

// Direct table export in TOON
const tableToon = await agent.exportTableToToon("products", {
  limit: 100,
  includeMetadata: true
});
```

### TOON vs JSON Comparison

**JSON (verbose)**:
```json
{"data":[{"id":1,"name":"Alice","role":"admin"}]}
```

**TOON (compact)**:
```
data[1]{id,name,role}:
  1,Alice,admin
```

### Format Selection Guidelines

**When to use TOON format:**
- ✅ **AI Agent Data Exchange**: All programmatic agent interactions should use TOON
- ✅ **Token Optimization**: When minimizing LLM token usage is critical
- ✅ **Structured Data**: Tabular data with uniform schemas
- ✅ **Automation Scripts**: CI/CD pipelines and automated workflows

**When to use JSON format:**
- ✅ **Human Consumption**: Interactive terminal output for users
- ✅ **API Integration**: Standard web service responses
- ✅ **Tool Compatibility**: When integrating with JSON-only tools
- ✅ **Debugging**: Human-readable output for troubleshooting

**Default Behaviors:**
- **Agent API**: TOON format by default
- **Headless Mode**: TOON format by default (specify `--output json` for humans)
- **API Mode**: JSON format (protocol requirement)

## Quick Start

### Programmatic Interface (Recommended)

```typescript
import { createAgent } from "seerdb/agent-api";

const agent = createAgent();

// Connect to database
await agent.connect({
  type: "postgresql",
  host: "localhost",
  database: "mydb",
  user: "myuser",
  password: "mypassword"
});

// Safe queries with automatic warnings
const result = await agent.query("SELECT * FROM users LIMIT 10");
console.log(`Found ${result.rowCount} users`);

// Safe user sampling (max 10 users)
const users = await agent.getUsersSample(10);

// Safe table browsing (max 1000 rows)
const data = await agent.getTableData("users", {
  limit: 100,
  where: "active = true",
  orderBy: "created_at DESC"
});

await agent.disconnect();
```

### API Mode (Interactive JSON)

```bash
sdb --api
```

Send JSON commands via stdin:
```json
{"type": "connect", "payload": {"type": "postgresql", "host": "localhost", "database": "mydb", "user": "myuser", "password": "mypassword"}}
{"type": "query", "payload": {"sql": "SELECT * FROM users LIMIT 5"}}
{"type": "get_schema"}
{"type": "exit"}
```

### Headless Mode (One-off Operations)

```bash
# 🔄 AI AGENTS: Use TOON format (default for agents, 30-60% fewer tokens)
sdb --headless --db-type postgresql --connect "postgresql://user:pass@host/db" --query "SELECT * FROM users LIMIT 10" --output toon

# 👥 HUMANS: Use JSON format (readable, standard interchange)
sdb --headless --db-type postgresql --connect "postgresql://user:pass@host/db" --query "SELECT * FROM users LIMIT 10" --output json

# 🔄 AI AGENTS: List saved connections in TOON format
sdb --headless --list-connections --output toon
```

## Security Features

### Automatic Protection
- **Query Limits**: Warns about queries without LIMIT clauses
- **Dangerous Operations**: Detects DROP, DELETE, TRUNCATE, UPDATE without WHERE
- **🛡️ User Confirmation Required**: All dangerous operations must be explicitly confirmed by the user before execution to prevent accidental data loss
- **Large Result Warnings**: Alerts when queries return >1000 rows
- **Safe Methods**: `getUsersSample()` and `getTableData()` have automatic limits

### Credential Security
- **Encrypted Storage**: Passwords encrypted at rest
- **Sanitized Output**: Connection strings in prompts have passwords masked
- **Secure Transit**: Credentials never exposed in logs or error messages

## 🚨 IMPORTANT: Connection Security for AI Agents

**To protect sensitive credentials, never share database passwords or connection strings in conversations with AI agents.**

### Safe Connection Setup

**Option 1: Use Interactive Mode**
```bash
# Launch SeerDB interactively to add connections safely
sdb

# Then use the UI to:
# 1. Select database type (PostgreSQL, MySQL, SQLite)
# 2. Enter connection details (passwords are masked)
# 3. Save the connection with a descriptive name
```

**Option 2: Use Command Line (without exposing passwords)**
```bash
# For PostgreSQL (password will be prompted or use existing auth)
sdb --headless --db-type postgresql --host localhost --database mydb --user myuser --query "SELECT 1"

# For MySQL
sdb --headless --db-type mysql --host localhost --database mydb --user myuser --query "SELECT 1"

# For SQLite
sdb --headless --db-type sqlite --connect /path/to/database.db --query "SELECT 1"
```

**Option 3: Use Saved Connections**
```bash
# List existing saved connections (shows ID, name, type, masked connection string)
sdb --headless --list-connections --output toon

# Use a saved connection by name (human-readable)
sdb --headless --connection-name "My Database" --query "SELECT * FROM users LIMIT 10"

# Use a saved connection by ID (most reliable for automation)
sdb --headless --connection-id "QvdD72rW6TEL1cSdoPOPP" --query "SELECT * FROM users LIMIT 10"

# Use saved connection in API mode
echo '{"type": "connect", "payload": {"type": "use_saved", "name": "My Database"}}' | sdb --api
```

### Connection IDs: The Reliable Method

**Connection IDs are unique identifiers that never change**, making them perfect for automation:

```bash
# List connections to see their IDs
sdb --headless --list-connections --output toon

# Output shows:
# [
#   {
#     "id": "QvdD72rW6TEL1cSdoPOPP",
#     "name": "Intro Main",
#     "type": "postgresql",
#     "connectionString": "postgres:********@metro.proxy.rlwy.net:21306/railway"
#   }
# ]

# Use the ID for reliable programmatic access
sdb --headless --connection-id "QvdD72rW6TEL1cSdoPOPP" --query "SELECT table_name FROM information_schema.tables"
```

**Why use connection IDs:**
- ✅ **Unique**: Guaranteed unique across all connections
- ✅ **Stable**: Never change once created
- ✅ **Reliable**: Perfect for automation and scripts
- ✅ **Precise**: No ambiguity if multiple connections have similar names
- ✅ **Secure**: No credential exposure in connection references

### What to Do When Asked to Connect

❌ **Don't do this:**
- Share database passwords in the conversation
- Provide complete connection strings with passwords
- Let agents handle sensitive credentials directly

✅ **Do this instead:**
1. **Use the interactive SeerDB UI** to save connections first
2. **Instruct users to run connection commands locally**
3. **Use saved connections** that don't expose credentials
4. **Use passwordless authentication** when possible (SSH keys, integrated auth)
5. **Update connections directly** in `~/.seerdb/connections.json` if a connection cannot be accessed

### Example Safe Instructions

**Instead of asking for credentials:**
> "Please run `sdb` to open the interactive interface, then add your database connection there. Once saved, you can use it in our sessions."

**Instead of sharing connection strings:**
> "Add your database connection using the SeerDB interface with a name like 'project_db', then I can help you query it using that saved connection."

## Agent API Reference

### Connection Management

```typescript
interface DatabaseConfig {
  type: "postgresql" | "mysql" | "sqlite";
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
}

// Connect and disconnect
await agent.connect(config);
await agent.disconnect();
agent.isConnected(); // boolean
```

### Query Execution

```typescript
// Simple query with safety warnings
const result = await agent.query("SELECT * FROM users");

// Query with options
const result = await agent.query("SELECT * FROM users WHERE active = $1", [true], {
  skipLimitWarning: true,
  skipDangerWarning: true
});

// Transaction execution
const results = await agent.transaction([
  "INSERT INTO users (name) VALUES ('John')",
  "UPDATE stats SET count = count + 1"
]);
```

### Schema Introspection

```typescript
const schema = await agent.getSchema();
// Returns: { tables: TableInfo[], columns: Record<string, ColumnInfo[]> }
```

### Safe Data Access

```typescript
// Safe user sampling (max 10)
const users = await agent.getUsersSample(10);

// Safe table browsing (max 1000 rows)
const data = await agent.getTableData("users", {
  limit: 100,
  offset: 0,
  where: "active = true",
  orderBy: "created_at DESC"
});
```

## API Mode Protocol

### Commands

#### Connect
```json
{
  "type": "connect",
  "payload": {
    "type": "postgresql",
    "host": "localhost",
    "database": "mydb",
    "user": "myuser",
    "password": "mypassword"
  }
}
```

#### Query
```json
{
  "type": "query",
  "payload": {
    "sql": "SELECT * FROM users WHERE active = true"
  }
}
```

#### Get Schema
```json
{
  "type": "get_schema"
}
```

#### Exit
```json
{
  "type": "exit"
}
```

### Response Format

```json
{
  "success": true,
  "data": { /* result data */ },
  "error": "error message (if failed)",
  "requestId": "optional request tracking ID"
}
```

## Headless Mode Examples

```bash
# 🔄 AI AGENTS: PostgreSQL query in TOON format (default for agents)
sdb --headless --db-type postgresql --connect "postgresql://user:pass@host/db" --query "SELECT 1" --output toon

# 🔄 AI AGENTS: MySQL query in TOON format (specify explicitly for clarity)
sdb --headless --db-type mysql --host localhost --database mydb --user myuser --password mypass --query "SELECT * FROM users LIMIT 10" --output toon

# 🔄 AI AGENTS: SQLite query in TOON format
sdb --headless --db-type sqlite --connect /path/to/db.sqlite --query "SELECT * FROM table1" --output toon

# 🔄 AI AGENTS: List connections in TOON format
sdb --headless --list-connections --output toon

# 👥 HUMANS: Same queries but in JSON format for readability
sdb --headless --db-type postgresql --connect "postgresql://user:pass@host/db" --query "SELECT * FROM users LIMIT 10" --output json
```

## Database Support

- **PostgreSQL**: Full support with connection pooling
- **MySQL**: Full support with connection pooling
- **SQLite**: Full support with Bun's native driver

## Best Practices

### 1. Always Use LIMIT Clauses
```typescript
// ❌ Avoid - triggers warning
await agent.query("SELECT * FROM users");

// ✅ Do - safe with LIMIT
await agent.query("SELECT * FROM users LIMIT 100");
```

### 2. Use Safe Methods for Exploration
```typescript
// ❌ Avoid during exploration
await agent.query("SELECT * FROM users WHERE last_login > '2024-01-01'");

// ✅ Use safe methods
const recentUsers = await agent.getTableData("users", {
  where: "last_login > '2024-01-01'",
  limit: 10
});
```

### 3. Handle Errors Properly
```typescript
try {
  await agent.connect(config);
  const result = await agent.query("SELECT * FROM users LIMIT 10");
  console.log(`Found ${result.rowCount} users`);
} catch (error) {
  console.error("Database operation failed:", error.message);
} finally {
  await agent.disconnect();
}
```

### 4. Use Parameterized Queries
```typescript
// PostgreSQL
const users = await agent.query("SELECT * FROM users WHERE role = $1 AND active = $2", ["admin", true]);

// MySQL/SQLite
const users = await agent.query("SELECT * FROM users WHERE role = ? AND active = ?", ["admin", true]);
```

### 5. Override Warnings When Appropriate
```typescript
// For intentional large queries
const allUsers = await agent.query("SELECT id, name FROM users ORDER BY name", {
  skipLimitWarning: true
});

// For intentional dangerous operations (requires explicit confirmation)
const result = await agent.query("UPDATE users SET active = false WHERE last_login < '2024-01-01'", [], {
  skipDangerWarning: true
});
```

### 6. User Confirmation for Dangerous Operations
```typescript
// This will prompt for user confirmation before execution:
await agent.query("DELETE FROM old_logs WHERE created_at < '2023-01-01'");
// User will see: "This operation will delete records. Are you sure? (y/N)"

// For automation scripts, bypass confirmation:
await agent.query("DELETE FROM temp_data WHERE expires_at < NOW()", [], {
  skipDangerWarning: true  // Bypasses confirmation prompt
});
```

## Error Handling

All methods throw descriptive errors for:
- Connection failures
- Invalid queries
- Permission issues
- Network timeouts

```typescript
try {
  await agent.connect(config);
  const result = await agent.query("SELECT * FROM users LIMIT 10");
} catch (error) {
  console.error("Database operation failed:", error.message);
}
```

## Performance Considerations

### Choose the Right Interface
- **API Mode**: Interactive exploration and debugging
- **Headless Mode**: CI/CD, scripts, one-off operations
- **Programmatic API**: Complex applications, batch operations

### Connection Management
```typescript
// ✅ Reuse connections
const agent = createAgent();
await agent.connect(config);

// Multiple operations
const users = await agent.query("SELECT * FROM users LIMIT 10");
const products = await agent.query("SELECT * FROM products LIMIT 10");

await agent.disconnect();
```

### Batch Operations
```typescript
// ✅ Use transactions for related operations
await agent.transaction([
  "INSERT INTO users (name, email) VALUES ('John', 'john@example.com')",
  "INSERT INTO user_profiles (user_id, bio) VALUES (LASTVAL(), 'Hello world')"
]);
```

## TypeScript Types

```typescript
import type {
  SeerDBAgentInterface,
  AgentDatabaseConfig,
  AgentQueryResult,
  AgentSchemaInfo,
  AgentQueryOptions
} from "seerdb/types/agent";
```

## Available Methods

- `connect(config)` - Connect to database
- `disconnect()` - Close connection
- `query(sql, params?, options?)` - Execute SQL with safety guardrails
- `getSchema()` - Get database schema information
- `getTableData(tableName, options)` - Safe table browsing
- `getUsersSample(limit?)` - Safe user sampling
- `transaction(queries)` - Execute multiple queries as transaction
- `exportData(result, format="toon")` - Export query results in TOON (default for AI agents), JSON, or CSV formats
- `exportTableToToon(tableName, options)` - Direct table export in TOON format
- `isConnected()` - Check connection status

## Get Help

For more information about SeerDB agent capabilities:

```bash
sdb --agent-help    # Show this help information
sdb -h              # Show all command line options
```

**🤖 End of AI Agent Documentation.** These rules and guidelines are mandatory for all AI agent interactions with SeerDB. Always prioritize security, use TOON format for data exchange, and follow the safety protocols outlined in this document.
