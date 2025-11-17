// Example: Basic AI agent usage with SeerDB

import { createAgent, type DatabaseConfig, type AgentQueryResult } from "./agent-api.js";

async function exampleBasicUsage() {
	// Create an agent instance
	const agent = createAgent();

	try {
		// Connect to a PostgreSQL database
		const config: DatabaseConfig = {
			type: "postgresql",
			host: "localhost",
			port: 5432,
			database: "mydb",
			user: "myuser",
			password: "mypassword"
		};

		await agent.connect(config);
		console.log("Connected to database");

		// Execute a simple query
		const result: AgentQueryResult = await agent.query("SELECT * FROM users LIMIT 10");
		console.log(`Found ${result.rowCount} users`);
		console.log("First user:", result.rows[0]);

		// Get schema information
		const schema = await agent.getSchema();
		console.log(`Database has ${schema.tables.length} tables`);

		// Get specific table data
		const tableData = await agent.getTableData("users", {
			limit: 5,
			where: "active = true",
			orderBy: "created_at DESC"
		});

		console.log("Recent active users:", tableData.rows);

	} finally {
		// Always disconnect
		await agent.disconnect();
		console.log("Disconnected from database");
	}
}

// Example: Using the one-off query function
import { executeQuery } from "./agent-api.js";

async function exampleOneOffQuery() {
	const config: DatabaseConfig = {
		type: "sqlite",
		connectionString: "/path/to/database.db"
	};

	try {
		const result = await executeQuery(config, "SELECT COUNT(*) as user_count FROM users");
		console.log("Total users:", result.rows[0].user_count);
	} catch (error) {
		console.error("Query failed:", error);
	}
}

// Example: Transaction support
async function exampleTransaction() {
	const agent = createAgent();

	try {
		await agent.connect({
			type: "postgresql",
			host: "localhost",
			database: "mydb",
			user: "myuser",
			password: "mypassword"
		});

		// Execute multiple queries in a transaction
		const results = await agent.transaction([
			"INSERT INTO users (name, email) VALUES ('John Doe', 'john@example.com')",
			"INSERT INTO user_profiles (user_id, bio) VALUES (LASTVAL(), 'Hello world')",
			"UPDATE user_stats SET total_users = total_users + 1"
		]);

		console.log("Transaction completed successfully");
		console.log("Results:", results);

	} catch (error) {
		console.error("Transaction failed:", error);
	} finally {
		await agent.disconnect();
	}
}

// Example: API mode usage (programmatic control)
async function exampleApiMode() {
	// This would be used when running seerdb --api
	// Send JSON commands via stdin, receive responses via stdout

	const commands = [
		{
			type: "connect",
			payload: {
				type: "postgresql",
				host: "localhost",
				database: "mydb",
				user: "myuser",
				password: "mypassword"
			}
		},
		{
			type: "query",
			payload: { sql: "SELECT * FROM users LIMIT 5" }
		},
		{
			type: "get_schema"
		},
		{
			type: "exit"
		}
	];

	// In a real scenario, you'd send these via stdin to the API mode process
	console.log("API Commands:", JSON.stringify(commands, null, 2));
}

// Example: Headless mode usage
async function exampleHeadlessMode() {
	// Run seerdb with command line arguments
	// seerdb --headless --db-type postgresql --connect "postgresql://user:pass@host/db" --query "SELECT * FROM users" --output json

	console.log("Headless mode automatically connects, runs query, and outputs results");
}

// Example: Export functionality for AI agents
import { exportToJsonString, exportSchema } from "./utils/export.js";

async function exampleExport() {
	const agent = createAgent();

	try {
		await agent.connect({
			type: "postgresql",
			host: "localhost",
			database: "mydb",
			user: "myuser",
			password: "mypassword"
		});

		// Get data and export to JSON string
		const result = await agent.query("SELECT * FROM users");
		const jsonString = exportToJsonString(result.rows);
		console.log("JSON export:", jsonString);

		// Export schema
		const schema = await agent.getSchema();
		const schemaPath = await exportSchema(schema.tables, schema.columns);
		console.log("Schema exported to:", schemaPath);

	} finally {
		await agent.disconnect();
	}
}

// Run examples
async function main() {
	try {
		console.log("=== Basic Usage Example ===");
		await exampleBasicUsage();

		console.log("\n=== One-off Query Example ===");
		await exampleOneOffQuery();

		console.log("\n=== Transaction Example ===");
		await exampleTransaction();

		console.log("\n=== API Mode Example ===");
		exampleApiMode();

		console.log("\n=== Headless Mode Example ===");
		exampleHeadlessMode();

		console.log("\n=== Export Example ===");
		await exampleExport();

	} catch (error) {
		console.error("Example failed:", error);
	}
}

// Uncomment to run examples
// main();