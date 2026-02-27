import { encode } from "@toon-format/toon";
import { createDatabaseConnection } from "./database/connection.js";
import { ActionType } from "./state/actions.js";
import { initializeApp } from "./state/effects.js";
import { createStore } from "./state/store.js";
import type { DBType } from "./types/state.js";
import type { CliArgs } from "./utils/cli-args.js";
import { buildConnectionString } from "./utils/connection-string.js";
import {
	generateUniqueConnectionId,
	generateUniqueConnectionName,
} from "./utils/id-generator.js";
import { maskPassword } from "./utils/mask.js";
import { loadConnections } from "./utils/persistence.js";

export const runHeadlessMode = async (args: CliArgs): Promise<void> => {
	const store = createStore();
	const dispatch = store.dispatch.bind(store);

	try {
		// Initialize the app (loads saved connections and query history)
		await initializeApp(dispatch);

		// Load connections once for reuse
		const connectionsResult = await loadConnections();

		// Handle list connections
		if (args.listConnections) {
			// Mask connection strings in output
			const maskedConnections = connectionsResult.connections.map((conn) => ({
				...conn,
				connectionString: maskPassword(conn.connectionString),
			}));
			outputResult(maskedConnections, args.output);
			process.exit(0);
		}

		let activeConnection = null;
		let connectionInfo = null;

		// Handle connection by ID first
		if (args.connectionId) {
			const savedConnection = connectionsResult.connections.find(
				(conn) => conn.id === args.connectionId,
			);

			if (!savedConnection) {
				console.error(
					`Error: Saved connection with ID '${args.connectionId}' not found`,
				);
				process.exit(1);
			}

			// Use the connection string from saved connection (password already decrypted by loadConnections)
			const connection = createDatabaseConnection({
				type: savedConnection.type as DBType,
				connectionString: savedConnection.connectionString,
			});
			await connection.connect();
			activeConnection = connection;
			connectionInfo = savedConnection;
		}
		// Handle connection by name
		else if (args.connectionName) {
			const savedConnection = connectionsResult.connections.find(
				(conn) => conn.name === args.connectionName,
			);

			if (!savedConnection) {
				console.error(
					`Error: Saved connection '${args.connectionName}' not found`,
				);
				process.exit(1);
			}

			// Use the connection string from saved connection (password already decrypted by loadConnections)
			const connection = createDatabaseConnection({
				type: savedConnection.type as DBType,
				connectionString: savedConnection.connectionString,
			});
			await connection.connect();
			activeConnection = connection;
			connectionInfo = savedConnection;
		}
		// Handle direct connection
		else if (args.connect && args.dbType) {
			const connection = createDatabaseConnection({
				type: args.dbType as DBType,
				connectionString: args.connect,
			});
			await connection.connect();
			activeConnection = connection;
			const connectionId = await generateUniqueConnectionId();
			const connectionName = await generateUniqueConnectionName(
				"Headless Connection",
				args.dbType as DBType,
			);
			connectionInfo = {
				id: connectionId,
				name: connectionName,
				type: args.dbType as DBType,
				connectionString: args.connect,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};
		}
		// Handle connection from individual parameters
		else if (args.dbType && args.host && args.database && args.user) {
			// Build connection string from individual parameters
			const connectionString = buildConnectionString({
				dbType: args.dbType,
				host: args.host,
				port: args.port,
				database: args.database,
				user: args.user,
				password: args.password,
			});

			const connection = createDatabaseConnection({
				type: args.dbType as DBType,
				connectionString: connectionString,
			});
			await connection.connect();
			activeConnection = connection;
			const connectionId = await generateUniqueConnectionId();
			const connectionName = await generateUniqueConnectionName(
				"Headless Connection",
				args.dbType as DBType,
			);
			connectionInfo = {
				id: connectionId,
				name: connectionName,
				type: args.dbType as DBType,
				connectionString: connectionString,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};
		}

		// Update state if we have a connection
		if (activeConnection && connectionInfo) {
			dispatch({
				type: ActionType.SetActiveConnection,
				connection: connectionInfo,
			});
			dispatch({
				type: ActionType.SetDBType,
				dbType: connectionInfo.type as DBType,
			});
		}

		// Handle query
		if (args.query) {
			if (activeConnection) {
				const queryResult = await activeConnection.query(args.query);
				outputResult(queryResult, args.output);
				process.exit(0);
			} else {
				console.error("Error: No database connection available for query");
				process.exit(1);
			}
		}

		// If no specific action was taken, just exit successfully
		process.exit(0);
	} catch (err) {
		console.error("Error:", err instanceof Error ? err.message : String(err));
		process.exit(1);
	}
};

/**
 * Output result in the specified format
 */
function outputResult(
	result: unknown,
	format: "json" | "table" | "toon" | undefined,
): void {
	if (format === "json") {
		console.log(JSON.stringify(result, null, 2));
	} else if (format === "toon") {
		// TOON format output for AI agents
		console.log(encode(result));
	} else {
		// Simple table output for query results
		if (result && typeof result === "object" && "rows" in result) {
			console.table((result as { rows: unknown[] }).rows);
		} else {
			console.table(result);
		}
	}
}
