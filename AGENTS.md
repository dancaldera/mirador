# SeerDB AI Agent Documentation

This guide explains how AI agents can programmatically interact with SeerDB, the terminal-based database explorer.

## Overview

SeerDB provides multiple interfaces for AI agents to safely interact with databases:

1. **Programmatic Agent API** - TypeScript/JavaScript interface for complex applications
2. **API Mode** - JSON-based stdin/stdout protocol for interactive control
3. **Headless Mode** - Command-line execution with JSON output for automation

**🚀 TOON Format (Recommended)**: SeerDB uses TOON (Token-Oriented Object Notation) as the default format for AI agent data exchange. TOON provides **30-60% fewer tokens** than JSON while maintaining full compatibility and adding LLM-friendly structure validation.

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

// Export in TOON format (default for agents)
const result = await agent.query("SELECT * FROM users LIMIT 10");
const toonData = await agent.exportData(result, "toon"); // Default format

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

// Safe user sampling (max 50 users)
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
seerdb --api
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
# Query with automatic limits
seerdb --headless --db-type postgresql --connect "postgresql://user:pass@host/db" --query "SELECT * FROM users LIMIT 10" --output json

# List saved connections
seerdb --headless --list-connections --output json
```

## Security Features

### Automatic Protection
- **Query Limits**: Warns about queries without LIMIT clauses
- **Dangerous Operations**: Detects DROP, DELETE, TRUNCATE, UPDATE without WHERE
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
seerdb

# Then use the UI to:
# 1. Select database type (PostgreSQL, MySQL, SQLite)
# 2. Enter connection details (passwords are masked)
# 3. Save the connection with a descriptive name
```

**Option 2: Use Command Line (without exposing passwords)**
```bash
# For PostgreSQL (password will be prompted or use existing auth)
seerdb --headless --db-type postgresql --host localhost --database mydb --user myuser --query "SELECT 1"

# For MySQL
seerdb --headless --db-type mysql --host localhost --database mydb --user myuser --query "SELECT 1"

# For SQLite
seerdb --headless --db-type sqlite --connect /path/to/database.db --query "SELECT 1"
```

**Option 3: Use Saved Connections**
```bash
# List existing saved connections (shows ID, name, type, masked connection string)
seerdb --headless --list-connections --output json

# Use a saved connection by name (human-readable)
seerdb --headless --connection-name "My Database" --query "SELECT * FROM users LIMIT 10"

# Use a saved connection by ID (most reliable for automation)
seerdb --headless --connection-id "QvdD72rW6TEL1cSdoPOPP" --query "SELECT * FROM users LIMIT 10"

# Use saved connection in API mode
echo '{"type": "connect", "payload": {"type": "use_saved", "name": "My Database"}}' | seerdb --api
```

### Connection IDs: The Reliable Method

**Connection IDs are unique identifiers that never change**, making them perfect for automation:

```bash
# List connections to see their IDs
seerdb --headless --list-connections --output json

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
seerdb --headless --connection-id "QvdD72rW6TEL1cSdoPOPP" --query "SELECT table_name FROM information_schema.tables"
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

### Example Safe Instructions

**Instead of asking for credentials:**
> "Please run `seerdb` to open the interactive interface, then add your database connection there. Once saved, you can use it in our sessions."

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
// Safe user sampling (max 50)
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
# PostgreSQL with connection string
seerdb --headless --db-type postgresql --connect "postgresql://user:pass@host/db" --query "SELECT 1" --output json

# MySQL with individual parameters
seerdb --headless --db-type mysql --host localhost --database mydb --user myuser --password mypass --query "SELECT * FROM users LIMIT 10" --output json

# SQLite
seerdb --headless --db-type sqlite --connect /path/to/db.sqlite --query "SELECT * FROM table1" --output json

# List all saved connections
seerdb --headless --list-connections --output json
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
  limit: 50
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
- `exportData(result, format="toon")` - Export query results in TOON/JSON/CSV formats
- `exportTableToToon(tableName, options)` - Direct table export in TOON format
- `isConnected()` - Check connection status

## Get Help

For more information about SeerDB agent capabilities:

```bash
seerdb --agent-help    # Show this help information
seerdb -h              # Show all command line options
```

See the project documentation for complete setup and usage instructions.