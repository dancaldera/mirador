import { parseArgs } from "node:util";

export interface CliArgs {
	/** Run in API mode for programmatic control */
	api?: boolean;
	/** Database type (postgresql, mysql, sqlite) */
	dbType?: string;
	/** Connection string or file path for SQLite */
	connect?: string;
	/** SQL query to execute */
	query?: string;
	/** Output format (json, table) */
	output?: "json" | "table";
	/** Run in headless mode (no TUI) */
	headless?: boolean;
	/** List saved connections */
	listConnections?: boolean;
	/** Show help */
	help?: boolean;
	/** Show AI agent instructions */
	agentHelp?: boolean;
	/** Host for database connection */
	host?: string;
	/** Port for database connection */
	port?: number;
	/** Database name */
	database?: string;
	/** Username for database connection */
	user?: string;
	/** Password for database connection */
	password?: string;
	/** Name of saved connection to use */
	connectionName?: string;
	/** ID of saved connection to use */
	connectionId?: string;
}

export const parseCliArgs = (): CliArgs => {
	try {
		const { values } = parseArgs({
			args: process.argv.slice(2),
			options: {
				api: { type: "boolean", short: "a" },
				"db-type": { type: "string" },
				connect: { type: "string", short: "c" },
				query: { type: "string", short: "q" },
				output: { type: "string", default: "table" },
				headless: { type: "boolean" },
				"list-connections": { type: "boolean" },
				help: { type: "boolean", short: "h" },
				"agent-help": { type: "boolean" },
				host: { type: "string" },
				port: { type: "string" },
				database: { type: "string", short: "d" },
				user: { type: "string", short: "u" },
				password: { type: "string", short: "p" },
				"connection-name": { type: "string" },
				"connection-id": { type: "string" },
			},
			allowPositionals: false,
		});

		return {
			api: values.api as boolean,
			dbType: values["db-type"] as string,
			connect: values.connect as string,
			query: values.query as string,
			output: (values.output as "json" | "table") || "table",
			headless: values.headless as boolean,
			listConnections: values["list-connections"] as boolean,
			help: values.help as boolean,
			agentHelp: values["agent-help"] as boolean,
			host: values.host as string,
			port: values.port ? parseInt(values.port as string, 10) : undefined,
			database: values.database as string,
			user: values.user as string,
			password: values.password as string,
			connectionName: values["connection-name"] as string,
			connectionId: values["connection-id"] as string,
		};
	} catch (error) {
		console.error("Error parsing command line arguments:", error);
		return { help: true };
	}
};

export const showHelp = () => {
	console.log(`
SeerDB - Terminal Database Explorer

AI Agents: Use --agent-help for comprehensive API documentation and usage examples.

USAGE:
  seerdb [OPTIONS]

 MODES:
   --api, -a                    Run in API mode for programmatic control
   --headless                   Run in headless mode (no TUI)
   --list-connections           List all saved connections

 CONNECTION OPTIONS:
  --db-type <type>             Database type: postgresql, mysql, sqlite
  --connect, -c <string>       Connection string or SQLite file path
  --connection-name <name>     Use a saved connection by name
  --connection-id <id>         Use a saved connection by ID
  --host <host>                Database host
  --port <port>                Database port
  --database, -d <name>        Database name
  --user, -u <username>        Database username
  --password, -p <password>    Database password

QUERY OPTIONS:
  --query, -q <sql>            SQL query to execute
  --output <format>            Output format: json, table (default: table)

OTHER:
  --help, -h                   Show this help message
  --agent-help                 Show AI agent instructions (if you're an agent READ THIS)

EXAMPLES:
  # Interactive mode (default)
  seerdb

  # Connect to PostgreSQL and run a query
  seerdb --db-type postgresql --host localhost --database mydb --user myuser --query "SELECT * FROM users"

  # Connect to SQLite file
  seerdb --db-type sqlite --connect /path/to/db.sqlite --query "SELECT * FROM table1"

  # API mode for programmatic control
  seerdb --api

  # Headless mode with JSON output
  seerdb --headless --db-type postgresql --connect "postgresql://user:pass@host/db" --query "SELECT * FROM users" --output json
`);
};

export const showAgentHelp = () => {
	console.log(`
# SeerDB AI Agent Documentation

Complete documentation for AI agents is available in AGENTS.md in the repository root.

## Quick Start

### Programmatic Interface
\`\`\`typescript
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
console.log(\`Found \${result.rowCount} users\`);
await agent.disconnect();
\`\`\`

### API Mode (Interactive JSON)
\`\`\`bash
seerdb --api
\`\`\`
Send JSON commands via stdin:
\`\`\`json
{"type": "connect", "payload": {"type": "postgresql", "host": "localhost", "database": "mydb", "user": "myuser", "password": "mypassword"}}
{"type": "query", "payload": {"sql": "SELECT * FROM users LIMIT 5"}}
{"type": "exit"}
\`\`\`

### Headless Mode (One-off Operations)
\`\`\`bash
seerdb --headless --db-type postgresql --connect "postgresql://user:pass@host/db" --query "SELECT * FROM users LIMIT 10" --output json
\`\`\`

## Key Safety Features
- **Query Limits**: Warns about queries without LIMIT clauses
- **Dangerous Operations**: Detects DROP, DELETE, TRUNCATE, UPDATE without WHERE
- **Large Result Warnings**: Alerts when queries return >1000 rows
- **Credential Security**: Passwords encrypted at rest, masked in output

## 🚨 IMPORTANT: Connection Security for AI Agents

**To protect sensitive credentials, never share database passwords or connection strings in conversations with AI agents.**

### Safe Connection Setup
\`\`\`bash
# Use interactive mode to add connections safely
seerdb

# Use saved connections by name (credentials are masked)
seerdb --headless --list-connections --output json

# Use saved connections by ID (most reliable)
seerdb --headless --connection-id "QvdD72rW6TEL1cSdoPOPP" --query "SELECT * FROM users LIMIT 10"

# Use command line without exposing passwords
seerdb --headless --db-type postgresql --host localhost --database mydb --user myuser --query "SELECT 1"
\`\`\`

### What to Do When Asked to Connect
❌ **Don't**: Share passwords or complete connection strings with passwords
✅ **Do**: Use interactive SeerDB UI to save connections first, then use saved connections by ID or name

## List Saved Connections
\`\`\`bash
# List all connections with their IDs
seerdb --headless --list-connections --output json

# List connections in table format (shows ID, name, type)
seerdb --headless --list-connections --output table
\`\`\`

See AGENTS.md for complete API reference, examples, and best practices.
`);
};
