#!/usr/bin/env node
import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { runApiMode } from "./api-mode.js";
import { createDatabaseConnection } from "./database/connection.js";
import { runHeadlessMode } from "./headless-mode.js";
import type { DBType } from "./types/state.js";
import { parseCliArgs, showHelp } from "./utils/cli-args.js";
import { buildConnectionString } from "./utils/connection-string.js";
import {
	generateUniqueConnectionId,
	generateUniqueConnectionName,
} from "./utils/id-generator.js";
import { loadConnections, saveConnections } from "./utils/persistence.js";
import { APP_VERSION } from "./version.js";

const main = async () => {
	// Handle opencode subcommand before parsing other args
	if (process.argv[2] === "opencode") {
		const opencodeArgs = process.argv.slice(3);
		const subcommand = opencodeArgs[0];

		if (subcommand === "run") {
			// Parse arguments for "sdb opencode run"
			const userMessageIndex = opencodeArgs.indexOf("run") + 1;
			const message = opencodeArgs.slice(userMessageIndex).join(" ");

			// Parse additional flags
			const flags = opencodeArgs.slice(0, userMessageIndex);
			let model: string | undefined;

			// Extract --model flag
			for (let i = 0; i < flags.length; i++) {
				if (flags[i] === "--model" && flags[i + 1]) {
					model = flags[i + 1];
					break;
				}
			}

			// Default model
			const defaultModel = "opencode/big-pickle";
			const finalModel = model || defaultModel;

			// Get SeerDB agent documentation
			try {
				const header =
					"# SeerDB Agent API Documentation\n# Use this context for AI agents to understand SeerDB capabilities\n\n";

				// Try multiple possible locations for AGENTS.md
				let agentsMdPath: string | null = null;
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
					if (existsSync(path)) {
						agentsMdPath = path;
						break;
					}
				}

				let agentsContent: string;

				if (agentsMdPath) {
					// Load from local file
					agentsContent = readFileSync(agentsMdPath, "utf-8");
				} else {
					// Fallback: fetch from GitHub
					console.log(
						"📥 Downloading SeerDB agent documentation from GitHub...",
					);
					const githubUrl =
						"https://raw.githubusercontent.com/dancaldera/seerdb/main/AGENTS.md";
					const response = await fetch(githubUrl);

					if (!response.ok) {
						throw new Error(
							`Failed to fetch AGENTS.md from GitHub: ${response.statusText}`,
						);
					}

					agentsContent = await response.text();
				}

				// Combine documentation with user message
				const fullPrompt =
					header + agentsContent + "\n\n---\n\nUser Request:\n" + message;

				// Run opencode with the combined prompt
				console.log("🚀 Running OpenCode.ai with SeerDB context...");

				// Use stdin to pass the prompt to opencode
				const command = `opencode run -m ${finalModel}`;
				execSync(command, {
					input: fullPrompt,
					stdio: ["pipe", "inherit", "inherit"],
				});

				process.exit(0);
			} catch (error) {
				console.error("Error running OpenCode.ai:", error);
				process.exit(1);
			}
		} else {
			console.error("Unknown opencode subcommand:", subcommand);
			console.log("Supported subcommands: run");
			process.exit(1);
		}
	}

	const args = parseCliArgs();

	// Connection management operations
	// --add-connection: Add and save a new database connection
	if (args.addConnection) {
		try {
			// Validate required parameters
			if (!args.dbType) {
				console.error("Error: --db-type is required for --add-connection");
				console.error(
					'Example: sdb --add-connection --db-type postgresql --connect "postgresql://user:pass@host/db" --name "My Database"',
				);
				process.exit(1);
			}

			// Build connection string from parameters
			let connectionString: string;
			if (args.connect) {
				connectionString = args.connect;
			} else if (args.host && args.database && args.user) {
				connectionString = buildConnectionString({
					dbType: args.dbType,
					host: args.host,
					port: args.port,
					database: args.database,
					user: args.user,
					password: args.password,
				});
			} else {
				console.error(
					"Error: Either --connect or (--host --database --user) are required for --add-connection",
				);
				console.error(
					'Example: sdb --add-connection --db-type postgresql --connect "postgresql://user:pass@host/db" --name "My Database"',
				);
				process.exit(1);
			}

			// Test the connection first
			const connection = createDatabaseConnection({
				type: args.dbType as DBType,
				connectionString,
			});

			try {
				await connection.connect();
				await connection.close();
				console.log("✓ Connection test successful");
			} catch (error) {
				console.error(
					`Error: Connection test failed: ${error instanceof Error ? error.message : String(error)}`,
				);
				process.exit(1);
			}

			// Load existing connections
			const connectionsResult = await loadConnections();
			const connections = connectionsResult.connections;

			// Generate unique ID and name
			const connectionId = await generateUniqueConnectionId();
			const connectionName = args.name
				? await generateUniqueConnectionName(args.name, args.dbType as DBType)
				: await generateUniqueConnectionName(
						`${args.dbType} Database`,
						args.dbType as DBType,
					);

			// Create connection info
			const timestamp = new Date().toISOString();
			const newConnection = {
				id: connectionId,
				name: connectionName,
				type: args.dbType as DBType,
				connectionString: connectionString,
				createdAt: timestamp,
				updatedAt: timestamp,
			};

			// Add to connections and save
			connections.push(newConnection);
			await saveConnections(connections, true);

			console.log(
				`✓ Connection saved: "${connectionName}" (ID: ${connectionId})`,
			);
			process.exit(0);
		} catch (error) {
			console.error(
				"Error adding connection:",
				error instanceof Error ? error.message : String(error),
			);
			process.exit(1);
		}
	}

	// --delete-connection: Delete a saved connection
	if (args.deleteConnection) {
		try {
			if (!args.connectionId && !args.connectionName) {
				console.error(
					"Error: Either --connection-id or --connection-name is required for --delete-connection",
				);
				console.error(
					'Example: sdb --delete-connection --connection-id "QvdD72rW6TEL1cSdoPOPP"',
				);
				console.error(
					'Example: sdb --delete-connection --connection-name "My Database"',
				);
				process.exit(1);
			}

			const connectionsResult = await loadConnections();
			const connections = connectionsResult.connections;

			let targetIndex = -1;
			let targetId = "";
			let targetName = "";

			if (args.connectionId) {
				targetIndex = connections.findIndex(
					(conn) => conn.id === args.connectionId,
				);
				if (targetIndex === -1) {
					console.error(
						`Error: Connection with ID "${args.connectionId}" not found`,
					);
					process.exit(1);
				}
				targetId = args.connectionId;
				targetName = connections[targetIndex].name;
			} else if (args.connectionName) {
				targetIndex = connections.findIndex(
					(conn) =>
						conn.name.toLowerCase() === args.connectionName!.toLowerCase(),
				);
				if (targetIndex === -1) {
					console.error(
						`Error: Connection with name "${args.connectionName}" not found`,
					);
					process.exit(1);
				}
				targetId = connections[targetIndex].id;
				targetName = connections[targetIndex].name;
			}

			// Remove the connection
			const deletedConnection = connections.splice(targetIndex, 1)[0];
			await saveConnections(connections, true);

			console.log(
				`✓ Connection deleted: "${deletedConnection.name}" (ID: ${deletedConnection.id})`,
			);
			process.exit(0);
		} catch (error) {
			console.error(
				"Error deleting connection:",
				error instanceof Error ? error.message : String(error),
			);
			process.exit(1);
		}
	}

	// --test-connection: Test a connection without saving
	if (args.testConnection) {
		try {
			// Validate required parameters
			if (!args.dbType) {
				console.error("Error: --db-type is required for --test-connection");
				console.error(
					'Example: sdb --test-connection --db-type postgresql --connect "postgresql://user:pass@host/db"',
				);
				process.exit(1);
			}

			// Build connection string from parameters
			let connectionString: string;
			if (args.connect) {
				connectionString = args.connect;
			} else if (args.host && args.database && args.user) {
				connectionString = buildConnectionString({
					dbType: args.dbType,
					host: args.host,
					port: args.port,
					database: args.database,
					user: args.user,
					password: args.password,
				});
			} else {
				console.error(
					"Error: Either --connect or (--host --database --user) are required for --test-connection",
				);
				console.error(
					'Example: sdb --test-connection --db-type postgresql --connect "postgresql://user:pass@host/db"',
				);
				process.exit(1);
			}

			// Test the connection
			const connection = createDatabaseConnection({
				type: args.dbType as DBType,
				connectionString,
			});

			try {
				await connection.connect();
				await connection.close();
				console.log("✓ Connection test successful");
				process.exit(0);
			} catch (error) {
				console.error(
					`✗ Connection test failed: ${error instanceof Error ? error.message : String(error)}`,
				);
				process.exit(1);
			}
		} catch (error) {
			console.error(
				"Error testing connection:",
				error instanceof Error ? error.message : String(error),
			);
			process.exit(1);
		}
	}

	if (args.help) {
		showHelp();
		process.exit(0);
	}

	if (args.version) {
		console.log(APP_VERSION);
		process.exit(0);
	}

	if (args.agentHelp) {
		// Output agent documentation to stdout
		try {
			const header =
				"# SeerDB Agent API Documentation\n# Use this context for AI agents to understand SeerDB capabilities\n\n";

			// Try multiple possible locations for AGENTS.md
			let agentsMdPath: string | null = null;
			const possiblePaths = [
				// When running from dist/ (bundled with binary)
				join(process.cwd(), "AGENTS.md"),
				// When running from project root
				join(process.cwd(), "..", "AGENTS.md"),
				// When running as installed binary (try common locations)
				"/usr/local/share/seerdb/AGENTS.md",
				"/opt/seerdb/AGENTS.md",
			];

			for (const path of possiblePaths) {
				if (existsSync(path)) {
					agentsMdPath = path;
					break;
				}
			}

			let agentsContent: string;

			if (agentsMdPath) {
				// Load from local file
				agentsContent = readFileSync(agentsMdPath, "utf-8");
			} else {
				// Fallback: fetch from GitHub
				console.error("Downloading SeerDB agent documentation from GitHub...");
				const githubUrl =
					"https://raw.githubusercontent.com/dancaldera/seerdb/main/AGENTS.md";
				const response = await fetch(githubUrl);

				if (!response.ok) {
					throw new Error(
						`Failed to fetch AGENTS.md from GitHub: ${response.statusText}`,
					);
				}

				agentsContent = await response.text();
			}

			console.log(header + agentsContent);
		} catch (error) {
			console.error("Error reading agent documentation:", error);
			process.exit(1);
		}
		process.exit(0);
	}

	if (args.copy) {
		// Copy agent documentation to clipboard
		try {
			const header =
				"# SeerDB Agent API Documentation\n# Use this context for AI agents to understand SeerDB capabilities\n\n";

			// Try multiple possible locations for AGENTS.md
			let agentsMdPath: string | null = null;
			const possiblePaths = [
				// When running from dist/ (bundled with binary)
				join(process.cwd(), "AGENTS.md"),
				// When running from project root
				join(process.cwd(), "..", "AGENTS.md"),
				// When running as installed binary (try common locations)
				"/usr/local/share/seerdb/AGENTS.md",
				"/opt/seerdb/AGENTS.md",
			];

			for (const path of possiblePaths) {
				if (existsSync(path)) {
					agentsMdPath = path;
					break;
				}
			}

			let agentsContent: string;

			if (agentsMdPath) {
				// Load from local file
				agentsContent = readFileSync(agentsMdPath, "utf-8");
			} else {
				// Fallback: fetch from GitHub
				console.log("📥 Downloading SeerDB agent documentation from GitHub...");
				const githubUrl =
					"https://raw.githubusercontent.com/dancaldera/seerdb/main/AGENTS.md";
				const response = await fetch(githubUrl);

				if (!response.ok) {
					throw new Error(
						`Failed to fetch AGENTS.md from GitHub: ${response.statusText}`,
					);
				}

				agentsContent = await response.text();
			}

			const fullContent = header + agentsContent;

			// Try different clipboard commands
			if (process.platform === "darwin") {
				// macOS
				execSync("pbcopy", { input: fullContent });
				console.log("✅ SeerDB agent documentation copied to clipboard!");
			} else if (process.platform === "linux") {
				// Linux
				try {
					execSync("xclip -selection clipboard", { input: fullContent });
					console.log("✅ SeerDB agent documentation copied to clipboard!");
				} catch {
					console.log("No clipboard tool found. Output:");
					console.log();
					console.log(fullContent);
				}
			} else if (process.platform === "win32") {
				// Windows
				try {
					execSync("clip", { input: fullContent });
					console.log("✅ SeerDB agent documentation copied to clipboard!");
				} catch {
					console.log("No clipboard tool found. Output:");
					console.log();
					console.log(fullContent);
				}
			} else {
				console.log("No clipboard tool found. Output:");
				console.log();
				console.log(fullContent);
			}
		} catch (error) {
			console.error("Error copying to clipboard:", error);
			process.exit(1);
		}
		process.exit(0);
	}

	// API mode for programmatic control
	if (args.api) {
		await runApiMode();
		return;
	}

	// Headless mode for automation
	if (args.headless) {
		await runHeadlessMode(args);
		return;
	}

	// No mode specified - show help
	console.log("SeerDB - Terminal Database Explorer (Headless CLI)\n");
	console.log("No mode specified. Use one of the following:\n");
	console.log("  --headless    Run in headless mode for automation");
	console.log("  --api         Run in API mode for programmatic control");
	console.log("  --help        Show full help message\n");
	console.log("Examples:");
	console.log("  sdb --headless --list-connections --output toon");
	console.log(
		'  sdb --headless --connection-id "ID" --query "SELECT * FROM users" --output toon',
	);
	console.log('  echo \'{"type": "get_state"}\' | sdb --api\n');
	console.log("For AI agents: See AGENTS.md or run: sdb --copy");
};

main().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});
