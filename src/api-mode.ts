import { createDatabaseConnection } from "./database/connection.js";
import { ActionType } from "./state/actions.js";
import { initializeApp } from "./state/effects.js";
import {
	type AppDispatch,
	createStore,
	type StateStore,
} from "./state/store.js";
import type { AppState, DBType } from "./types/state.js";
import { buildConnectionString } from "./utils/connection-string.js";
import {
	generateUniqueConnectionId,
	generateUniqueConnectionName,
} from "./utils/id-generator.js";
import { loadConnections } from "./utils/persistence.js";
import { createReadlineInterface } from "./utils/readline.js";

interface ApiCommand {
	type: "get_state" | "dispatch" | "connect" | "query" | "exit";
	payload?: unknown;
}

interface ApiResponse {
	success: boolean;
	data?: unknown;
	error?: string;
}

class ApiModeHandler {
	private store: StateStore;

	constructor(store: StateStore) {
		this.store = store;
	}

	private get dispatch(): AppDispatch {
		return this.store.dispatch.bind(this.store);
	}

	private get state(): AppState {
		return this.store.getState();
	}

	async handleCommand(command: ApiCommand): Promise<ApiResponse> {
		try {
			switch (command.type) {
				case "get_state":
					return { success: true, data: this.state };

				case "dispatch":
					if (!command.payload) {
						return { success: false, error: "Invalid dispatch command" };
					}
					this.dispatch(command.payload as Parameters<AppDispatch>[0]);
					return { success: true };

				case "connect":
					return await this.handleConnect(command.payload);

				case "query":
					return await this.handleQuery(command.payload);

				case "exit":
					return { success: true, data: { message: "Exiting..." } };

				default:
					return {
						success: false,
						error: `Unknown command type: ${command.type}`,
					};
			}
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	private async handleConnect(payload: unknown): Promise<ApiResponse> {
		if (!payload || typeof payload !== "object") {
			return { success: false, error: "Invalid connection payload" };
		}

		const connectPayload = payload as {
			type?: string;
			connectionString?: string;
			host?: string;
			port?: number;
			database?: string;
			user?: string;
			password?: string;
			id?: string;
			name?: string;
		};

		// Handle saved connection by ID
		if (connectPayload.type === "use_saved" && connectPayload.id) {
			const connectionsResult = await loadConnections();
			const savedConnection = connectionsResult.connections.find(
				(conn) => conn.id === connectPayload.id,
			);

			if (!savedConnection) {
				return {
					success: false,
					error: `Saved connection with ID '${connectPayload.id}' not found`,
				};
			}

			try {
				const connection = createDatabaseConnection({
					type: savedConnection.type,
					connectionString: savedConnection.connectionString,
				});
				await connection.connect();

				this.dispatch({
					type: ActionType.SetActiveConnection,
					connection: savedConnection,
				});
				this.dispatch({
					type: ActionType.SetDBType,
					dbType: savedConnection.type,
				});

				return { success: true, data: { message: "Connected successfully" } };
			} catch (error) {
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		}

		// Handle saved connection by name
		if (connectPayload.type === "use_saved" && connectPayload.name) {
			const connectionsResult = await loadConnections();
			const savedConnection = connectionsResult.connections.find(
				(conn) => conn.name === connectPayload.name,
			);

			if (!savedConnection) {
				return {
					success: false,
					error: `Saved connection '${connectPayload.name}' not found`,
				};
			}

			try {
				const connection = createDatabaseConnection({
					type: savedConnection.type,
					connectionString: savedConnection.connectionString,
				});
				await connection.connect();

				this.dispatch({
					type: ActionType.SetActiveConnection,
					connection: savedConnection,
				});
				this.dispatch({
					type: ActionType.SetDBType,
					dbType: savedConnection.type,
				});

				return { success: true, data: { message: "Connected successfully" } };
			} catch (error) {
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		}

		const { type, connectionString, host, port, database, user, password } =
			connectPayload;

		try {
			let connString = connectionString;

			// Build connection string if individual parameters provided
			if (!connString && type) {
				connString = buildConnectionString({
					dbType: type,
					host,
					port,
					database,
					user,
					password,
				});
			}

			if (!connString) {
				return { success: false, error: "No connection string provided" };
			}

			const connection = createDatabaseConnection({
				type: type as DBType,
				connectionString: connString,
			});
			await connection.connect();

			const connectionId = await generateUniqueConnectionId();
			const connectionName = await generateUniqueConnectionName(
				"API Connection",
				type as DBType,
			);
			this.dispatch({
				type: ActionType.SetActiveConnection,
				connection: {
					id: connectionId,
					name: connectionName,
					type: type as DBType,
					connectionString: connString,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
			});
			this.dispatch({ type: ActionType.SetDBType, dbType: type as DBType });

			return { success: true, data: { message: "Connected successfully" } };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	private async handleQuery(payload: unknown): Promise<ApiResponse> {
		if (
			!payload ||
			typeof payload !== "object" ||
			!("sql" in payload) ||
			typeof (payload as { sql: unknown }).sql !== "string"
		) {
			return { success: false, error: "Invalid query payload" };
		}

		const { sql } = payload as { sql: string };

		if (!this.state.activeConnection) {
			return { success: false, error: "No active database connection" };
		}

		try {
			const connection = createDatabaseConnection({
				type: this.state.activeConnection.type,
				connectionString: this.state.activeConnection.connectionString,
			});
			await connection.connect();

			const result = await connection.query(sql);

			// Add to query history
			this.dispatch({
				type: ActionType.AddQueryHistoryItem,
				item: {
					id: `query-${Date.now()}`,
					connectionId: this.state.activeConnection.id,
					query: sql,
					executedAt: new Date().toISOString(),
					durationMs: 0, // TODO: measure actual duration
					rowCount: Array.isArray(result) ? result.length : 0,
				},
			});

			return { success: true, data: result };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}
}

export const runApiMode = async (): Promise<void> => {
	console.log("SeerDB API Mode");
	console.log("Send JSON commands via stdin, receive responses via stdout");
	console.log('Example: {"type": "get_state"}');
	console.log('Type {"type": "exit"} to quit');
	console.log("");

	// Create store and initialize
	const store = createStore();
	await initializeApp(store.dispatch.bind(store));

	const apiHandler = new ApiModeHandler(store);

	// Set up readline interface for JSON commands
	const rl = createReadlineInterface();

	rl.on("line", async (line) => {
		try {
			const command: ApiCommand = JSON.parse(line.trim());
			const response: ApiResponse = await apiHandler.handleCommand(command);
			console.log(JSON.stringify(response));

			// Handle exit command
			if (command.type === "exit") {
				process.exit(0);
			}
		} catch (error) {
			console.log(
				JSON.stringify({
					success: false,
					error:
						error instanceof Error ? error.message : "Invalid JSON command",
				}),
			);
		}
	});

	return new Promise((resolve) => {
		rl.on("close", resolve);
	});
};
