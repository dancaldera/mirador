import { render } from "ink";
import React from "react";
import { createDatabaseConnection } from "./database/connection.js";
import { ActionType } from "./state/actions.js";
import { AppProvider, useAppDispatch, useAppState } from "./state/context.js";
import { initializeApp } from "./state/effects.js";
import { type DBType, ViewState } from "./types/state.js";
import {
	generateUniqueConnectionId,
	generateUniqueConnectionName,
} from "./utils/id-generator.js";
import { createReadlineInterface } from "./utils/readline.js";

interface ApiCommand {
	type: "get_state" | "dispatch" | "connect" | "query" | "exit";
	payload?: any;
}

interface ApiResponse {
	success: boolean;
	data?: any;
	error?: string;
}

class ApiModeHandler {
	private dispatch: ReturnType<typeof useAppDispatch> | null = null;
	private state: ReturnType<typeof useAppState> | null = null;

	setContext(
		dispatch: ReturnType<typeof useAppDispatch>,
		state: ReturnType<typeof useAppState>,
	) {
		this.dispatch = dispatch;
		this.state = state;
	}

	async handleCommand(command: ApiCommand): Promise<ApiResponse> {
		try {
			switch (command.type) {
				case "get_state":
					return { success: true, data: this.state };

				case "dispatch":
					if (!this.dispatch || !command.payload) {
						return { success: false, error: "Invalid dispatch command" };
					}
					this.dispatch(command.payload);
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

	private async handleConnect(payload: any): Promise<ApiResponse> {
		if (!payload || typeof payload !== "object") {
			return { success: false, error: "Invalid connection payload" };
		}

		const { type, connectionString, host, port, database, user, password } =
			payload;

		try {
			let connString = connectionString;

			// Build connection string if individual parameters provided
			if (!connString && type) {
				switch (type) {
					case "postgresql":
						connString = `postgresql://${user}:${password}@${host}:${port || 5432}/${database}`;
						break;
					case "mysql":
						connString = `mysql://${user}:${password}@${host}:${port || 3306}/${database}`;
						break;
					case "sqlite":
						connString = host || database; // file path
						break;
					default:
						return {
							success: false,
							error: `Unsupported database type: ${type}`,
						};
				}
			}

			if (!connString) {
				return { success: false, error: "No connection string provided" };
			}

			const connection = createDatabaseConnection({
				type: type as DBType,
				connectionString: connString,
			});
			await connection.connect();

			if (this.dispatch) {
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
			}

			return { success: true, data: { message: "Connected successfully" } };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	private async handleQuery(payload: any): Promise<ApiResponse> {
		if (!payload || typeof payload !== "object" || !payload.sql) {
			return { success: false, error: "Invalid query payload" };
		}

		if (!this.state?.activeConnection) {
			return { success: false, error: "No active database connection" };
		}

		try {
			const connection = createDatabaseConnection({
				type: this.state.activeConnection.type,
				connectionString: this.state.activeConnection.connectionString,
			});
			await connection.connect();

			const result = await connection.query(payload.sql);

			// Add to query history
			if (this.dispatch) {
				this.dispatch({
					type: ActionType.AddQueryHistoryItem,
					item: {
						id: `query-${Date.now()}`,
						connectionId: this.state.activeConnection.id,
						query: payload.sql,
						executedAt: new Date().toISOString(),
						durationMs: 0, // TODO: measure actual duration
						rowCount: Array.isArray(result) ? result.length : 0,
					},
				});
			}

			return { success: true, data: result };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}
}

const apiHandler = new ApiModeHandler();

const ApiModeApp: React.FC = () => {
	const dispatch = useAppDispatch();
	const state = useAppState();

	React.useEffect(() => {
		apiHandler.setContext(dispatch, state);
		void initializeApp(dispatch);
	}, [dispatch]);

	return null; // No UI in API mode
};

export const runApiMode = async (): Promise<void> => {
	console.log("SeerDB API Mode");
	console.log("Send JSON commands via stdin, receive responses via stdout");
	console.log('Example: {"type": "get_state"}');
	console.log('Type {"type": "exit"} to quit');
	console.log("");

	// Render the app context without UI
	render(
		<AppProvider>
			<ApiModeApp />
		</AppProvider>,
	);

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
