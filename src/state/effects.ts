import { performance } from "node:perf_hooks";
import { nanoid } from "nanoid";
import { createDatabaseConnection } from "../database/connection.js";
import { ConnectionError, DatabaseError } from "../database/errors.js";
import { parameterize } from "../database/parameterize.js";
import type {
	DatabaseConfig,
	DatabaseConnection,
	QueryRow,
} from "../database/types.js";
import type {
	AppState,
	BreadcrumbSegment,
	ColumnInfo,
	ConnectionInfo,
	DataRow,
	NotificationLevel,
	QueryHistoryItem,
	TableInfo,
} from "../types/state.js";
import { DBType, ViewState } from "../types/state.js";
import { processRows } from "../utils/data-processing.js";
import { exportData, formatExportSummary } from "../utils/export.js";
import { historyHelpers } from "../utils/history.js";
import {
	generateUniqueConnectionId,
	generateUniqueConnectionName,
	validateConnectionNameComplete,
} from "../utils/id-generator.js";

// Simple function to create a cache key for a table
const tableCacheKey = (table: TableInfo | null): string | null => {
	if (!table) return null;
	return table.schema ? `${table.schema}.${table.name}` : table.name;
};

import {
	loadConnections,
	loadQueryHistory,
	saveConnections,
	saveQueryHistory,
} from "../utils/persistence.js";
import { ActionType } from "./actions.js";
import type { AppDispatch } from "./context.js";

export async function initializeApp(dispatch: AppDispatch): Promise<void> {
	dispatch({ type: ActionType.StartLoading });
	try {
		const [connectionsResult, history] = await Promise.all([
			loadConnections(),
			loadQueryHistory(),
		]);
		dispatch({
			type: ActionType.SetSavedConnections,
			connections: connectionsResult.connections,
		});
		dispatch({ type: ActionType.SetQueryHistory, history });
		if (connectionsResult.normalized > 0) {
			enqueueNotification(
				dispatch,
				`Normalized ${connectionsResult.normalized} legacy connection${connectionsResult.normalized === 1 ? "" : "s"}.`,
				"info",
			);
		}
		if (connectionsResult.skipped > 0) {
			enqueueNotification(
				dispatch,
				`Skipped ${connectionsResult.skipped} invalid connection entr${connectionsResult.skipped === 1 ? "y" : "ies"}.`,
				"warning",
			);
		}
		if (connectionsResult.normalized > 0 || connectionsResult.skipped > 0) {
			await saveConnections(connectionsResult.connections);
		}
	} catch (error) {
		dispatch({
			type: ActionType.SetError,
			error: error instanceof Error ? error.message : "Initialization failed.",
		});
	} finally {
		dispatch({ type: ActionType.StopLoading });
	}
}

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

		const tables = await fetchTables(dispatch, config);

		// Add history entry for tables loaded (only after successful fetch)
		if (tables.length > 0) {
			dispatch({
				type: ActionType.AddViewHistoryEntry,
				entry: historyHelpers.tablesLoaded(tables.length),
			});
		}
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

export async function fetchTables(
	dispatch: AppDispatch,
	dbConfig: DatabaseConfig,
): Promise<TableInfo[]> {
	dispatch({ type: ActionType.StartLoading });

	let connection: DatabaseConnection | null = null;

	try {
		connection = createDatabaseConnection(dbConfig);
		await connection.connect();
		let query: string;
		switch (dbConfig.type) {
			case DBType.SQLite:
				query = `
          SELECT
            NULL AS table_schema,
            name AS table_name,
            type AS table_type
          FROM sqlite_master
          WHERE type IN ('table', 'view')
          ORDER BY name
        `;
				break;
			case DBType.MySQL:
				query = `
          SELECT
            table_schema,
            table_name,
            table_type
          FROM information_schema.tables
          WHERE table_schema NOT IN ('information_schema', 'performance_schema', 'mysql', 'sys')
          ORDER BY table_schema, table_name
        `;
				break;
			case DBType.PostgreSQL:
			default:
				query = `
          SELECT
            table_schema,
            table_name,
            table_type
          FROM information_schema.tables
          WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
          ORDER BY table_schema, table_name
        `;
				break;
		}

		const result = await connection.query(query);

		const tables: TableInfo[] = result.rows.map((row) => {
			const record = row as QueryRow;
			const tableTypeRaw = String(record.table_type ?? "").toLowerCase();
			const tableType: TableInfo["type"] =
				tableTypeRaw.includes("view") && tableTypeRaw.includes("materialized")
					? "materialized-view"
					: tableTypeRaw.includes("view")
						? "view"
						: "table";

			return {
				schema:
					typeof record.table_schema === "string"
						? record.table_schema
						: undefined,
				name: String(record.table_name ?? ""),
				type: tableType,
			};
		});

		dispatch({ type: ActionType.SetTables, tables });
		return tables;
	} catch (error) {
		dispatch({
			type: ActionType.SetError,
			error: error instanceof Error ? error.message : "Failed to fetch tables.",
		});
		return [];
	} finally {
		if (connection) {
			try {
				await connection.close();
			} catch {
				// ignore close errors during cleanup
			}
		}
		dispatch({ type: ActionType.StopLoading });
	}
}

export async function fetchColumns(
	dispatch: AppDispatch,
	state: AppState,
	dbConfig: DatabaseConfig,
	table: TableInfo,
): Promise<void> {
	if (!shouldProceedWithRefresh(dispatch, state, table)) {
		return;
	}
	dispatch({ type: ActionType.StartLoading });
	dispatch({ type: ActionType.SetRefreshingTable, key: null });

	let connection: DatabaseConnection | null = null;

	try {
		connection = createDatabaseConnection(dbConfig);
		await connection.connect();

		const { query, params } = buildColumnQuery(dbConfig.type, table);
		const result = await connection.query(query, params);

		const columns: ColumnInfo[] = result.rows.map((row) =>
			mapColumnRow(dbConfig.type, row as QueryRow),
		);
		dispatch({ type: ActionType.SetColumns, columns });
	} catch (error) {
		dispatch({
			type: ActionType.SetError,
			error:
				error instanceof Error ? error.message : "Failed to fetch columns.",
		});
	} finally {
		if (connection) {
			try {
				await connection.close();
			} catch {
				// ignore close errors
			}
		}
		dispatch({ type: ActionType.StopLoading });
		trackRefreshTimestamp(dispatch, table);
	}
}

export interface FetchTableDataOptions {
	offset?: number;
	limit?: number;
}

const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_SEARCH_PAGE_SIZE = 25;

export async function fetchTableData(
	dispatch: AppDispatch,
	state: AppState,
	dbConfig: DatabaseConfig,
	table: TableInfo,
	options: FetchTableDataOptions = {},
): Promise<void> {
	if (!shouldProceedWithRefresh(dispatch, state, table)) {
		return;
	}
	dispatch({ type: ActionType.StartLoading });
	dispatch({ type: ActionType.SetRefreshingTable, key: null });

	let connection: DatabaseConnection | null = null;

	const offset = Math.max(options.offset ?? 0, 0);
	const limit = Math.max(options.limit ?? DEFAULT_PAGE_SIZE, 1);

	try {
		connection = createDatabaseConnection(dbConfig);
		await connection.connect();

		const query = buildTableDataQuery(
			dbConfig.type,
			table,
			limit,
			offset,
			state.sortConfig,
		);
		const result = await connection.query(query);

		dispatch({ type: ActionType.SetDataRows, rows: result.rows });
		dispatch({
			type: ActionType.SetHasMoreRows,
			hasMore: result.rows.length === limit,
		});
		dispatch({ type: ActionType.SetCurrentOffset, offset });
	} catch (error) {
		dispatch({
			type: ActionType.SetError,
			error: error instanceof Error ? error.message : "Failed to fetch rows.",
		});
	} finally {
		if (connection) {
			try {
				await connection.close();
			} catch {
				// ignore close errors
			}
		}
		dispatch({ type: ActionType.StopLoading });
		trackRefreshTimestamp(dispatch, table);
	}
}

export async function updateTableFieldValue(
	dispatch: AppDispatch,
	state: AppState,
	table: TableInfo | null,
	column: ColumnInfo,
	rowIndex: number | null,
	row: DataRow,
	inputValue: string,
): Promise<boolean> {
	if (!table) {
		dispatch({
			type: ActionType.SetError,
			error: "No table selected for editing.",
		});
		return false;
	}

	if (!state.activeConnection || !state.dbType) {
		dispatch({
			type: ActionType.SetError,
			error: "No active database connection.",
		});
		return false;
	}

	const primaryKeys = state.columns.filter((col) => col.isPrimaryKey);
	if (primaryKeys.length === 0) {
		dispatch({
			type: ActionType.SetError,
			error: "Editing requires a primary key to identify the row.",
		});
		return false;
	}

	const originalValue = row[column.name];
	const parsedValue = interpretEditedInput(inputValue, column);
	if (valuesAreEqual(originalValue, parsedValue)) {
		dispatch({
			type: ActionType.SetInfo,
			message: `No changes made to ${column.name}.`,
		});
		return false;
	}

	if (!state.dbType) {
		dispatch({
			type: ActionType.SetError,
			error: "Database type not set.",
		});
		return false;
	}

	const config: DatabaseConfig = {
		type: state.dbType,
		connectionString: state.activeConnection.connectionString,
	};

	let connection: DatabaseConnection | null = null;

	try {
		connection = createDatabaseConnection(config);
		await connection.connect();

		const dbType = state.dbType; // Capture for use in closures
		const tableRef = buildTableReference(dbType, table);
		const columnRef = quoteIdentifier(dbType, column.name);

		let paramIndex = 1;
		const params: unknown[] = [parsedValue];
		const assignments = `${columnRef} = $${paramIndex++}`;
		const predicates = primaryKeys.map((pk) => {
			const pkValue = row[pk.name];
			if (pkValue === undefined) {
				throw new Error(
					`Missing primary key value for column ${pk.name}. Unable to update row.`,
				);
			}
			params.push(pkValue);
			return `${quoteIdentifier(dbType, pk.name)} = $${paramIndex++}`;
		});

		const updateSql = `UPDATE ${tableRef} SET ${assignments} WHERE ${predicates.join(
			" AND ",
		)}`;
		const { sql, params: finalParams } = parameterize(
			updateSql,
			state.dbType,
			params,
		);

		await connection.execute(sql, finalParams);

		dispatch({
			type: ActionType.UpdateDataRowValue,
			columnName: column.name,
			value: parsedValue,
			rowIndex,
			table,
		});
		dispatch({
			type: ActionType.SetInfo,
			message: `Updated ${column.name}.`,
		});
		return true;
	} catch (error) {
		dispatch({
			type: ActionType.SetError,
			error: error instanceof Error ? error.message : "Failed to update value.",
		});
		return false;
	} finally {
		if (connection) {
			try {
				await connection.close();
			} catch {
				// ignore cleanup errors
			}
		}
	}
}

export interface SearchTableOptions {
	term: string;
	offset?: number;
	limit?: number;
}

export async function searchTableRows(
	dispatch: AppDispatch,
	state: AppState,
	dbConfig: DatabaseConfig,
	table: TableInfo,
	columns: ColumnInfo[],
	options: SearchTableOptions,
): Promise<void> {
	const normalizedTerm = options.term.trim();
	dispatch({ type: ActionType.SetSearchTerm, term: normalizedTerm });

	if (!normalizedTerm) {
		dispatch({ type: ActionType.ClearSearch });
		dispatch({
			type: ActionType.SetInfo,
			message: "Enter a search term to find matching rows.",
		});
		return;
	}

	if (columns.length === 0) {
		dispatch({
			type: ActionType.SetError,
			error: "Column metadata is required before searching.",
		});
		return;
	}

	const offset = Math.max(options.offset ?? 0, 0);
	const limit = Math.min(
		Math.max(options.limit ?? DEFAULT_SEARCH_PAGE_SIZE, 1),
		DEFAULT_SEARCH_PAGE_SIZE,
	);
	const likeTerm = `%${normalizedTerm}%`;

	const whereClause = buildSearchWhereClause(dbConfig.type, columns);
	const orderColumn = selectSearchOrderColumn(dbConfig.type, columns);
	const queries = buildSearchQueries(
		dbConfig.type,
		table,
		whereClause,
		orderColumn,
		limit,
		offset,
	);

	let connection: DatabaseConnection | null = null;

	dispatch({ type: ActionType.StartLoading });

	try {
		connection = createDatabaseConnection(dbConfig);
		await connection.connect();

		const { sql: countSql, params: countParams } = parameterize(
			queries.countQuery,
			dbConfig.type,
			[likeTerm],
		);
		const countResult = await connection.query(countSql, countParams);
		const totalCount = extractCount(countResult.rows[0]);

		const { sql: dataSql, params: dataParams } = parameterize(
			queries.dataQuery,
			dbConfig.type,
			[likeTerm],
		);
		const dataResult = await connection.query(dataSql, dataParams);

		const hasMore = offset + dataResult.rows.length < totalCount;
		dispatch({
			type: ActionType.SetSearchResultsPage,
			rows: dataResult.rows as DataRow[],
			totalCount,
			offset,
			hasMore,
		});
	} catch (error) {
		dispatch({
			type: ActionType.SetError,
			error:
				error instanceof Error ? error.message : "Search execution failed.",
		});
	} finally {
		if (connection) {
			try {
				await connection.close();
			} catch {
				// ignore close errors
			}
		}
		dispatch({ type: ActionType.StopLoading });
	}
}

export async function clearTableCacheEntry(
	dispatch: AppDispatch,
	state: AppState,
	dbConfig: DatabaseConfig,
	table: TableInfo,
): Promise<void> {
	const cacheKey = tableCacheKey(table);

	dispatch({ type: ActionType.SetRefreshingTable, key: cacheKey });

	const resetState: AppState = {
		...state,
		columns: [],
		dataRows: [],
		hasMoreRows: false,
		currentOffset: 0,
	};

	await fetchColumns(dispatch, resetState, dbConfig, table);
	await fetchTableData(dispatch, resetState, dbConfig, table, {
		offset: 0,
		limit: DEFAULT_PAGE_SIZE,
	});
	enqueueNotification(dispatch, "Table cache cleared and refreshed.", "info");
}

export async function clearConnectionCache(
	dispatch: AppDispatch,
	state: AppState,
): Promise<void> {
	dispatch({ type: ActionType.SetRefreshingTable, key: null });
	enqueueNotification(
		dispatch,
		"Cache cleared for current connection.",
		"info",
	);
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

const REFRESH_THROTTLE_MS = 1500;

function shouldProceedWithRefresh(
	dispatch: AppDispatch,
	state: AppState,
	table: TableInfo,
): boolean {
	const key = tableCacheKey(table);
	if (!key) return true;
	const last = state.refreshTimestamps[key] ?? 0;
	const canProceed = Date.now() - last >= REFRESH_THROTTLE_MS;
	if (!canProceed) {
		enqueueNotification(
			dispatch,
			"Please wait before refreshing this table again.",
			"warning",
		);
	}
	return canProceed;
}

function trackRefreshTimestamp(dispatch: AppDispatch, table: TableInfo): void {
	const key = tableCacheKey(table);
	if (!key) return;
	dispatch({
		type: ActionType.SetRefreshTimestamp,
		key,
		timestamp: Date.now(),
	});
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

export async function executeQuery(
	dispatch: AppDispatch,
	state: AppState,
	dbConfig: DatabaseConfig,
	sql: string,
	params: unknown[] = [],
): Promise<void> {
	if (!state.activeConnection || !state.dbType) {
		dispatch({ type: ActionType.SetError, error: "No active connection." });
		return;
	}

	dispatch({ type: ActionType.StartLoading });

	const { sql: parameterizedSql, params: parameterizedParams } = parameterize(
		sql,
		state.dbType,
		params,
	);

	let connection: DatabaseConnection | null = null;

	try {
		connection = createDatabaseConnection(dbConfig);
		await connection.connect();

		const start = performance.now();
		const result = await connection.query(
			parameterizedSql,
			parameterizedParams,
		);
		const duration = performance.now() - start;

		const historyItem: QueryHistoryItem = {
			id: nanoid(),
			connectionId: state.activeConnection.id,
			query: sql,
			executedAt: new Date().toISOString(),
			durationMs: Math.round(duration),
			rowCount: result.rowCount,
			error: undefined,
		};

		const updatedHistory = [historyItem, ...state.queryHistory].slice(0, 100);
		dispatch({ type: ActionType.AddQueryHistoryItem, item: historyItem });
		await saveQueryHistory(updatedHistory);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Query execution failed.";
		dispatch({ type: ActionType.SetError, error: message });

		const historyItem: QueryHistoryItem = {
			id: nanoid(),
			connectionId: state.activeConnection.id,
			query: sql,
			executedAt: new Date().toISOString(),
			durationMs: 0,
			rowCount: 0,
			error: message,
		};

		const updatedHistory = [historyItem, ...state.queryHistory].slice(0, 100);
		dispatch({ type: ActionType.AddQueryHistoryItem, item: historyItem });
		await saveQueryHistory(updatedHistory);
	} finally {
		if (connection) {
			try {
				await connection.close();
			} catch {
				// ignore close errors to avoid masking original failures
			}
		}
		dispatch({ type: ActionType.StopLoading });
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

function buildColumnQuery(
	dbType: DBType,
	table: TableInfo,
): { query: string; params?: unknown[] } {
	const schema = table.schema;
	if (dbType === DBType.SQLite) {
		const tableName = quoteIdentifier(dbType, table.name);
		return {
			query: `PRAGMA table_info(${tableName});`,
		};
	}

	if (dbType === DBType.MySQL) {
		return {
			query: `
          SELECT
            COLUMN_NAME AS column_name,
            DATA_TYPE AS data_type,
            IS_NULLABLE AS is_nullable,
            COLUMN_DEFAULT AS column_default,
            COLUMN_KEY AS column_key
          FROM information_schema.columns
          WHERE table_schema = ?
            AND table_name = ?
          ORDER BY ORDINAL_POSITION
        `,
			params: [schema ?? "", table.name],
		};
	}

	const params = schema ? [table.name, schema] : [table.name, "public"];
	return {
		query: `
          SELECT
            cols.column_name,
            cols.data_type,
            cols.is_nullable,
            cols.column_default,
            cols.ordinal_position,
            EXISTS (
              SELECT 1
              FROM information_schema.table_constraints tc
              JOIN information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name
               AND tc.table_schema = kcu.table_schema
               AND tc.table_name = kcu.table_name
              WHERE tc.constraint_type = 'PRIMARY KEY'
                AND kcu.table_schema = cols.table_schema
                AND kcu.table_name = cols.table_name
                AND kcu.column_name = cols.column_name
            ) AS is_primary_key
          FROM information_schema.columns cols
          WHERE cols.table_name = $1
            AND cols.table_schema = $2
          ORDER BY cols.ordinal_position
        `,
		params,
	};
}

function mapColumnRow(dbType: DBType, row: QueryRow): ColumnInfo {
	switch (dbType) {
		case DBType.SQLite:
			return {
				name: String(row.name),
				dataType: String(row.type ?? "text"),
				nullable: row.notnull === 0,
				defaultValue: row.dflt_value ? String(row.dflt_value) : null,
				isPrimaryKey: row.pk === 1,
			};
		case DBType.MySQL:
			return {
				name: String(row.column_name),
				dataType: String(row.data_type ?? ""),
				nullable: String(row.is_nullable ?? "").toUpperCase() !== "NO",
				defaultValue: row.column_default ? String(row.column_default) : null,
				isPrimaryKey: String(row.column_key ?? "").toUpperCase() === "PRI",
			};
		case DBType.PostgreSQL:
		default:
			return {
				name: String(row.column_name),
				dataType: String(row.data_type ?? ""),
				nullable: String(row.is_nullable ?? "").toUpperCase() !== "NO",
				defaultValue: row.column_default ? String(row.column_default) : null,
				isPrimaryKey: Boolean(row.is_primary_key),
			};
	}
}

function buildTableDataQuery(
	dbType: DBType,
	table: TableInfo,
	limit: number,
	offset: number,
	sortConfig?: { column: string | null; direction: "asc" | "desc" | "off" },
): string {
	const tableRef = buildTableReference(dbType, table);

	// Build ORDER BY clause if sorting is active
	let orderByClause = "";
	if (sortConfig && sortConfig.column && sortConfig.direction !== "off") {
		const sortColumn = quoteIdentifier(dbType, sortConfig.column);
		const sortDirection = sortConfig.direction === "asc" ? "ASC" : "DESC";
		orderByClause = ` ORDER BY ${sortColumn} ${sortDirection}`;
	}

	switch (dbType) {
		case DBType.SQLite:
			return `SELECT * FROM ${tableRef}${orderByClause} LIMIT ${limit} OFFSET ${offset}`;
		case DBType.MySQL:
			return `SELECT * FROM ${tableRef}${orderByClause} LIMIT ${offset}, ${limit}`;
		case DBType.PostgreSQL:
		default:
			return `SELECT * FROM ${tableRef}${orderByClause} LIMIT ${limit} OFFSET ${offset}`;
	}
}

function buildTableReference(dbType: DBType, table: TableInfo): string {
	const tableName = quoteIdentifier(dbType, table.name);
	if (table.schema) {
		const schemaName = quoteIdentifier(dbType, table.schema);
		return `${schemaName}.${tableName}`;
	}
	return tableName;
}

function extractCount(row: unknown): number {
	if (!row || typeof row !== "object") {
		return 0;
	}
	const record = row as Record<string, unknown>;
	const value =
		record.total_count ??
		record.count ??
		record.COUNT ??
		Object.values(record)[0];

	if (typeof value === "number") {
		return Number.isNaN(value) ? 0 : value;
	}
	if (typeof value === "bigint") {
		return Number(value);
	}
	if (typeof value === "string") {
		const parsed = Number(value);
		return Number.isNaN(parsed) ? 0 : parsed;
	}
	return 0;
}

function buildSearchWhereClause(dbType: DBType, columns: ColumnInfo[]): string {
	const expressions = columns
		.map((column) => buildSearchExpression(dbType, column.name))
		.filter(Boolean);
	if (expressions.length === 0) {
		return "1=1";
	}
	return expressions.join(" OR ");
}

function buildSearchExpression(dbType: DBType, columnName: string): string {
	const columnRef = quoteIdentifier(dbType, columnName);
	switch (dbType) {
		case DBType.MySQL:
			return `LOWER(CAST(${columnRef} AS CHAR)) LIKE LOWER($1)`;
		case DBType.SQLite:
			return `LOWER(CAST(${columnRef} AS TEXT)) LIKE LOWER($1)`;
		case DBType.PostgreSQL:
		default:
			return `(${columnRef})::TEXT ILIKE $1`;
	}
}

function selectSearchOrderColumn(
	dbType: DBType,
	columns: ColumnInfo[],
): string | null {
	if (columns.length === 0) {
		return null;
	}
	const primary = columns.find((column) => column.isPrimaryKey);
	const chosen = primary ?? columns[0];
	return quoteIdentifier(dbType, chosen.name);
}

function interpretEditedInput(value: string, _column: ColumnInfo): unknown {
	const trimmed = value.trim();
	if (trimmed.toUpperCase() === "NULL") {
		return null;
	}
	return value;
}

function valuesAreEqual(a: unknown, b: unknown): boolean {
	if (a === b) {
		return true;
	}
	if ((a === null || a === undefined) && (b === null || b === undefined)) {
		return true;
	}
	if (typeof a === "object" || typeof b === "object") {
		try {
			return JSON.stringify(a) === JSON.stringify(b);
		} catch {
			return false;
		}
	}
	return false;
}

function buildSearchQueries(
	dbType: DBType,
	table: TableInfo,
	whereClause: string,
	orderColumn: string | null,
	limit: number,
	offset: number,
): { countQuery: string; dataQuery: string } {
	const tableRef = buildTableReference(dbType, table);
	const orderClause = orderColumn ? ` ORDER BY ${orderColumn}` : "";
	switch (dbType) {
		case DBType.MySQL:
			return {
				countQuery: `SELECT COUNT(*) AS total_count FROM ${tableRef} WHERE ${whereClause}`,
				dataQuery: `SELECT * FROM ${tableRef} WHERE ${whereClause}${orderClause} LIMIT ${offset}, ${limit}`,
			};
		case DBType.SQLite:
		case DBType.PostgreSQL:
		default:
			return {
				countQuery: `SELECT COUNT(*) AS total_count FROM ${tableRef} WHERE ${whereClause}`,
				dataQuery: `SELECT * FROM ${tableRef} WHERE ${whereClause}${orderClause} LIMIT ${limit} OFFSET ${offset}`,
			};
	}
}

export async function exportTableData(
	dispatch: AppDispatch,
	state: AppState,
	format: "csv" | "json",
	includeHeaders: boolean,
): Promise<void> {
	if (state.dataRows.length === 0 || state.columns.length === 0) {
		dispatch({
			type: ActionType.SetError,
			error: "No data available to export.",
		});
		return;
	}

	dispatch({ type: ActionType.StartLoading });

	try {
		// Apply current sorting and filtering to the export
		const processedRows = processRows(
			state.dataRows,
			state.sortConfig,
			state.filterValue,
			state.columns,
		);

		const filepath = await exportData(processedRows, state.columns, {
			format,
			includeHeaders,
			filename: undefined,
			outputDir: undefined,
		});

		const summary = formatExportSummary(
			filepath,
			processedRows.length,
			format,
			state.columns.length,
		);
		dispatch({ type: ActionType.SetInfo, message: summary });
	} catch (error) {
		dispatch({
			type: ActionType.SetError,
			error: error instanceof Error ? error.message : "Export failed.",
		});
	} finally {
		dispatch({ type: ActionType.StopLoading });
	}
}

function quoteIdentifier(dbType: DBType, identifier: string): string {
	switch (dbType) {
		case DBType.MySQL:
			return `\`${identifier.replace(/`/g, "``")}\``;
		case DBType.SQLite:
		case DBType.PostgreSQL:
		default:
			return `"${identifier.replace(/"/g, '""')}"`;
	}
}

export const __internal = {
	buildColumnQuery,
	mapColumnRow,
	buildTableDataQuery,
	buildTableReference,
	extractCount,
	buildSearchWhereClause,
	buildSearchExpression,
	selectSearchOrderColumn,
	buildSearchQueries,
	quoteIdentifier,
	interpretEditedInput,
	valuesAreEqual,
} as const;
