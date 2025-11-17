import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { parseArgs } from "util";

export interface CliArgs {
	/** Run in API mode for programmatic control */
	api?: boolean;
	/** Database type (postgresql, mysql, sqlite) */
	dbType?: string;
	/** Connection string or file path for SQLite */
	connect?: string;
	/** SQL query to execute */
	query?: string;
	/** Output format (json, table, toon) */
	output?: "json" | "table" | "toon";
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
			output: (values.output as "json" | "table" | "toon") || "table",
			headless: values.headless as boolean,
			listConnections: values["list-connections"] as boolean,
			help: values.help as boolean,
			agentHelp: values["agent-help"] as boolean,
			host: values.host as string,
			port: values.port ? parseInt(values.port as string, 10) : undefined,
			database: values.database as string,
			user: values.user as string,
			password:
				(values.password as string) && (values.password as string).trim() !== ""
					? (values.password as string)
					: undefined,
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
  --connection-id <id>         Use a saved connection by ID (recommended for automation)
  --host <host>                Database host
  --port <port>                Database port
  --database, -d <name>        Database name
  --user, -u <username>        Database username
  --password, -p <password>    Database password

QUERY OPTIONS:
  --query, -q <sql>            SQL query to execute
   --output <format>            Output format: json, table, toon (default: table)

OTHER:
  --help, -h                   Show this help message
  --agent-help                 Show AI agent instructions (if you're an agent READ THIS)

DATABASE SUPPORT:
  - PostgreSQL: Full support with connection pooling
  - MySQL: Full support with connection pooling
  - SQLite: Full support with Bun's native driver

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

  # Headless mode with TOON output (optimized for AI agents - 30-60% fewer tokens)
  seerdb --headless --db-type postgresql --connect "postgresql://user:pass@host/db" --query "SELECT * FROM users LIMIT 10" --output toon

  # List saved connections (shows ID, name, type, masked connection string)
  seerdb --headless --list-connections --output toon

  # Use saved connection by ID (most reliable for automation)
  seerdb --headless --connection-id "QvdD72rW6TEL1cSdoPOPP" --query "SELECT table_name FROM information_schema.tables"

  # Use saved connection by name
  seerdb --headless --connection-name "My Database" --query "SELECT * FROM users LIMIT 10"

SECURITY NOTES:
  - Passwords are encrypted at rest and masked in output
  - Use saved connections to avoid exposing credentials
  - Connection IDs are unique and never change (perfect for automation)
  - Never share database passwords or complete connection strings with passwords

TOON FORMAT (AI Agent Optimized):
  - 30-60% fewer tokens than JSON for uniform data arrays
  - LLM-friendly with explicit array lengths [N] and field declarations {fields}
  - Schema-aware with column metadata
  - Compact tabular format for uniform object arrays

  Example TOON output:
  data[1]{id,name,role}:
    1,Alice,admin

For complete AI agent documentation, see AGENTS.md or run: seerdb --agent-help
`);
};

export const showAgentHelp = () => {
	try {
		let agentsMdPath: string | null = null;

		// Try multiple possible locations for AGENTS.md
		const possiblePaths = [
			// When running from project root
			join(process.cwd(), "AGENTS.md"),
			// When running from dist/
			join(process.cwd(), "..", "AGENTS.md"),
			// When running as installed binary (try common locations)
			"/usr/local/share/seerdb/AGENTS.md",
			"/opt/seerdb/AGENTS.md",
		];

		for (const path of possiblePaths) {
			try {
				readFileSync(path, "utf-8");
				agentsMdPath = path;
				break;
			} catch {
				// Continue to next path
			}
		}

		if (!agentsMdPath) {
			throw new Error("AGENTS.md not found in any expected location");
		}

		const content = readFileSync(agentsMdPath, "utf-8");
		console.log(content);
	} catch (error) {
		console.error("Error reading AGENTS.md:", error);
		console.log(`
# SeerDB AI Agent Documentation

Unable to load AGENTS.md file. Please check that it exists in the project root.

For more information about SeerDB agent capabilities, see the AGENTS.md file in the repository root.
`);
	}
};
