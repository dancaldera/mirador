import { encode } from "@toon-format/toon";
import { render } from "ink";
import React from "react";
import { createDatabaseConnection } from "./database/connection.js";
import type { DatabaseConnection } from "./database/types.js";
import { ActionType } from "./state/actions.js";
import { AppProvider, useAppDispatch, useAppState } from "./state/context.js";
import { initializeApp } from "./state/effects.js";
import type { DBType, ViewState } from "./types/state.js";
import type { CliArgs } from "./utils/cli-args.js";
import {
	generateUniqueConnectionId,
	generateUniqueConnectionName,
} from "./utils/id-generator.js";
import { loadConnections, maskPassword } from "./utils/persistence.js";

const HeadlessApp: React.FC<{ args: CliArgs }> = ({ args }) => {
	const dispatch = useAppDispatch();
	const state = useAppState();
	const [initialized, setInitialized] = React.useState(false);
	const [result, setResult] = React.useState<any>(null);
	const [error, setError] = React.useState<string | null>(null);

	React.useEffect(() => {
		const run = async () => {
			try {
				await initializeApp(dispatch);
				setInitialized(true);

				// Handle list connections
				if (args.listConnections) {
					const connectionsResult = await loadConnections();
					// Mask connection strings in output
					const maskedConnections = connectionsResult.connections.map(
						(conn) => ({
							...conn,
							connectionString: maskPassword(conn.connectionString),
						}),
					);
					setResult(maskedConnections);
					return;
				}

				let activeConnection = null;
				let connectionInfo = null;

				// Handle connection by ID first
				if (args.connectionId) {
					const connectionsResult = await loadConnections();
					const savedConnection = connectionsResult.connections.find(
						(conn) => conn.id === args.connectionId,
					);

					if (!savedConnection) {
						setError(
							`Saved connection with ID '${args.connectionId}' not found`,
						);
						return;
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
					const connectionsResult = await loadConnections();
					const savedConnection = connectionsResult.connections.find(
						(conn) => conn.name === args.connectionName,
					);

					if (!savedConnection) {
						setError(`Saved connection '${args.connectionName}' not found`);
						return;
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
					let connectionString: string;
					switch (args.dbType) {
						case "postgresql":
							connectionString =
								args.password && args.password.trim() !== ""
									? `postgresql://${args.user}:${args.password}@${args.host}:${args.port || 5432}/${args.database}`
									: `postgresql://${args.user}@${args.host}:${args.port || 5432}/${args.database}`;
							break;
						case "mysql":
							connectionString =
								args.password && args.password.trim() !== ""
									? `mysql://${args.user}:${args.password}@${args.host}:${args.port || 3306}/${args.database}`
									: `mysql://${args.user}@${args.host}:${args.port || 3306}/${args.database}`;
							break;
						case "sqlite":
							connectionString = args.host || args.database || "";
							break;
						default:
							throw new Error(`Unsupported database type: ${args.dbType}`);
					}

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
						setResult(queryResult);
					} else {
						setError("No database connection available for query");
					}
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
			}
		};

		void run();
	}, [dispatch, args]);

	React.useEffect(() => {
		if (initialized && (result !== null || error !== null)) {
			// Output result and exit
			if (error) {
				console.error("Error:", error);
				process.exit(1);
			} else if (result !== null) {
				if (args.output === "json") {
					console.log(JSON.stringify(result, null, 2));
				} else if (args.output === "toon") {
					// TOON format output for AI agents
					console.log(encode(result));
				} else {
					// Simple table output for query results
					if (result && result.rows) {
						console.table(result.rows);
					} else {
						console.table(result);
					}
				}
				process.exit(0);
			}
		}
	}, [initialized, result, error, args.output]);

	return null; // No UI in headless mode
};

export const runHeadlessMode = async (args: CliArgs): Promise<void> => {
	// Render the app context without UI
	const instance = render(
		<AppProvider>
			<HeadlessApp args={args} />
		</AppProvider>,
	);

	// Wait for the app to complete
	return new Promise((resolve) => {
		const checkInterval = setInterval(() => {
			// The component will call process.exit when done
			if (instance) {
				clearInterval(checkInterval);
				resolve();
			}
		}, 100);
	});
};
