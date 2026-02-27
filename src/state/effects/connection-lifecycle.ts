import { nanoid } from "nanoid";
import { createDatabaseConnection } from "../../database/connection.js";
import { ConnectionError, DatabaseError } from "../../database/errors.js";
import type {
	DatabaseConfig,
	DatabaseConnection,
} from "../../database/types.js";
import type {
	AppState,
	BreadcrumbSegment,
	ConnectionInfo,
	NotificationLevel,
	QueryHistoryItem,
	TableInfo,
} from "../../types/state.js";
import { DBType, ViewState } from "../../types/state.js";
import { historyHelpers } from "../../utils/history.js";
import {
	generateUniqueConnectionId,
	generateUniqueConnectionName,
	validateConnectionNameComplete,
} from "../../utils/id-generator.js";
import { loadConnections, saveConnections } from "../../utils/persistence.js";
import { ActionType } from "../actions.js";
import type { AppDispatch } from "../store.js";

/**
 * Connection lifecycle management functions
 */

export async function connectToDatabase(
	dispatch: AppDispatch,
	state: AppState,
	config: DatabaseConfig,
): Promise<void> {
	dispatch({ type: ActionType.SetDBType, dbType: config.type });
	dispatch({ type: ActionType.StartLoading });

	try {
		const connection = createDatabaseConnection(config);
		await connection.connect();
		await connection.close();

		const existing = state.savedConnections.find(
			(conn) =>
				conn.connectionString === config.connectionString &&
				conn.type === config.type,
		);

		const now = new Date().toISOString();
		const connectionInfo: ConnectionInfo = existing
			? { ...existing, updatedAt: now }
			: {
					id: await generateUniqueConnectionId(),
					name: await generateUniqueConnectionName(
						`${config.type} connection`,
						config.type,
					),
					type: config.type,
					connectionString: config.connectionString,
					createdAt: now,
					updatedAt: now,
				};

		dispatch({
			type: ActionType.SetActiveConnection,
			connection: connectionInfo,
		});
		dispatch({
			type: ActionType.SetInfo,
			message: "Database connection established.",
		});

		// Add history entry for connection
		dispatch({
			type: ActionType.AddViewHistoryEntry,
			entry: historyHelpers.connectionEstablished(
				connectionInfo.name,
				connectionInfo.type,
			),
		});

		const breadcrumbs: BreadcrumbSegment[] = [];
		if (config.type) {
			breadcrumbs.push({
				label: config.type.toUpperCase(),
				view: ViewState.DBType,
			});
		}
		breadcrumbs.push({
			label: connectionInfo.name,
			view: ViewState.Connection,
		});
		breadcrumbs.push({
			label: "Tables",
			view: ViewState.Tables,
		});
		dispatch({ type: ActionType.SetBreadcrumbs, breadcrumbs });

		dispatch({ type: ActionType.SetView, view: ViewState.Tables });

		if (existing) {
			dispatch({
				type: ActionType.UpdateSavedConnection,
				connection: connectionInfo,
			});
		} else {
			dispatch({
				type: ActionType.AddSavedConnection,
				connection: connectionInfo,
			});
		}

		const updatedConnections = existing
			? state.savedConnections.map((conn) =>
					conn.id === connectionInfo.id ? connectionInfo : conn,
				)
			: [...state.savedConnections, connectionInfo];
		await persistConnections(dispatch, updatedConnections);

		// TODO: fetchTables is still in main effects.ts - will be moved later
		// const tables = await fetchTables(dispatch, config);

		// Add history entry for tables loaded (only after successful fetch)
		// if (tables.length > 0) {
		// 	dispatch({
		// 		type: ActionType.AddViewHistoryEntry,
		// 		entry: historyHelpers.tablesLoaded(tables.length),
		// 	});
		// }
	} catch (error) {
		if (error instanceof ConnectionError || error instanceof DatabaseError) {
			dispatch({ type: ActionType.SetError, error });
		} else {
			dispatch({
				type: ActionType.SetError,
				error: "Failed to connect to database.",
			});
		}
	} finally {
		dispatch({ type: ActionType.StopLoading });
	}
}

export async function removeSavedConnection(
	dispatch: AppDispatch,
	state: AppState,
	connectionId: string,
): Promise<void> {
	const updatedConnections = state.savedConnections.filter(
		(connection) => connection.id !== connectionId,
	);
	if (updatedConnections.length === state.savedConnections.length) {
		return;
	}

	dispatch({ type: ActionType.RemoveSavedConnection, connectionId });

	if (state.activeConnection?.id === connectionId) {
		dispatch({ type: ActionType.ClearActiveConnection });
	}

	await persistConnections(dispatch, updatedConnections);
	enqueueNotification(dispatch, "Removed saved connection.", "info");
}

export async function updateSavedConnection(
	dispatch: AppDispatch,
	state: AppState,
	connectionId: string,
	updates: Partial<Pick<ConnectionInfo, "name" | "connectionString" | "type">>,
): Promise<void> {
	const existing = state.savedConnections.find(
		(connection) => connection.id === connectionId,
	);
	if (!existing) {
		return;
	}

	const trimmedName =
		updates.name !== undefined ? updates.name.trim() : undefined;
	const trimmedConnectionString =
		updates.connectionString !== undefined
			? updates.connectionString.trim()
			: undefined;

	if (trimmedName !== undefined) {
		if (trimmedName.length === 0) {
			enqueueNotification(
				dispatch,
				"Connection name cannot be empty.",
				"warning",
			);
			return;
		}

		// Use comprehensive validation including format and uniqueness
		const validation = await validateConnectionNameComplete(
			trimmedName,
			connectionId,
		);
		if (!validation.isValid) {
			let message = validation.error || "Invalid connection name.";
			if (validation.suggestion) {
				message += ` Suggestion: "${validation.suggestion}"`;
			}
			enqueueNotification(dispatch, message, "warning");
			return;
		}
	}

	if (
		trimmedConnectionString !== undefined &&
		trimmedConnectionString.length === 0
	) {
		enqueueNotification(
			dispatch,
			"Connection string cannot be empty.",
			"warning",
		);
		return;
	}

	if (
		updates.type !== undefined &&
		!Object.values(DBType).includes(updates.type)
	) {
		enqueueNotification(dispatch, "Unsupported database type.", "warning");
		return;
	}

	const typeChanged =
		updates.type !== undefined && updates.type !== existing.type;

	if (
		trimmedName === existing.name &&
		(trimmedConnectionString === undefined ||
			trimmedConnectionString === existing.connectionString) &&
		!typeChanged
	) {
		enqueueNotification(dispatch, "No changes detected.", "info");
		return;
	}

	const connectionStringChanged =
		trimmedConnectionString !== undefined &&
		trimmedConnectionString !== existing.connectionString;

	const updatedConnection: ConnectionInfo = {
		...existing,
		...(trimmedName !== undefined ? { name: trimmedName } : {}),
		...(trimmedConnectionString !== undefined
			? { connectionString: trimmedConnectionString }
			: {}),
		...(typeChanged ? { type: updates.type! } : {}),
		updatedAt: new Date().toISOString(),
	};

	const updatedConnections = state.savedConnections.map((connection) =>
		connection.id === connectionId ? updatedConnection : connection,
	);

	dispatch({
		type: ActionType.UpdateSavedConnection,
		connection: updatedConnection,
	});
	if (state.activeConnection?.id === connectionId) {
		dispatch({
			type: ActionType.SetActiveConnection,
			connection: updatedConnection,
		});
	}
	await persistConnections(dispatch, updatedConnections);
	enqueueNotification(dispatch, "Saved connection updated.", "info");

	if (
		state.activeConnection?.id === connectionId &&
		(connectionStringChanged || typeChanged)
	) {
		enqueueNotification(
			dispatch,
			"Connection details changed; reconnecting…",
			"info",
		);
		await connectToDatabase(
			dispatch,
			{
				...state,
				savedConnections: updatedConnections,
				dbType: updatedConnection.type,
			},
			{
				type: updatedConnection.type,
				connectionString: updatedConnection.connectionString,
			},
		);
	}
}

export async function persistConnections(
	dispatch: AppDispatch,
	connections: ConnectionInfo[],
): Promise<void> {
	try {
		await saveConnections(connections);
	} catch (error) {
		dispatch({
			type: ActionType.SetError,
			error:
				error instanceof Error ? error.message : "Failed to save connections.",
		});
	}
}

function enqueueNotification(
	dispatch: AppDispatch,
	message: string,
	level: NotificationLevel,
): void {
	dispatch({
		type: ActionType.AddNotification,
		notification: {
			id: nanoid(),
			message,
			level,
			createdAt: Date.now(),
		},
	});
}

export const connectionLifecycle = {
	connectToDatabase,
	removeSavedConnection,
	updateSavedConnection,
	persistConnections,
	enqueueNotification,
} as const;
