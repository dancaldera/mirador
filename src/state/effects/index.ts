import { nanoid } from "nanoid";
import { createDatabaseConnection } from "../../database/connection.js";
import { ConnectionError, DatabaseError } from "../../database/errors.js";
import { parameterize } from "../../database/parameterize.js";
import type {
	DatabaseConfig,
	DatabaseConnection,
	QueryRow,
} from "../../database/types.js";
import { withConnection } from "../../database/with-connection.js";
import type {
	AppState,
	BreadcrumbSegment,
	ColumnInfo,
	ConnectionInfo,
	DataRow,
	NotificationLevel,
	QueryHistoryItem,
	TableInfo,
} from "../../types/state.js";
import { DBType, ViewState } from "../../types/state.js";
import { processRows } from "../../utils/data-processing.js";
import { exportData, formatExportSummary } from "../../utils/export.js";
import { historyHelpers } from "../../utils/history.js";
import {
	loadConnections,
	loadQueryHistory,
	saveConnections,
	saveQueryHistory,
} from "../../utils/persistence.js";
import { ActionType } from "../actions.js";
import type { AppDispatch } from "../store.js";
import { connectionLifecycle } from "./connection-lifecycle.js";
import { sqlBuilder } from "./sql-builder.js";

/**
 * Main effects module - orchestrates state changes and side effects
 */

export { connectionLifecycle } from "./connection-lifecycle.js";
// Re-export from sub-modules
export { sqlBuilder } from "./sql-builder.js";

// Re-export individual functions for convenience
export const {
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
} = sqlBuilder;

export const {
	connectToDatabase,
	removeSavedConnection,
	updateSavedConnection,
	persistConnections,
	enqueueNotification,
} = connectionLifecycle;

export async function initializeApp(dispatch: AppDispatch): Promise<void> {
	dispatch({ type: ActionType.StartLoading });

	try {
		const connectionsResult = await loadConnections();
		dispatch({
			type: ActionType.SetSavedConnections,
			connections: connectionsResult.connections,
		});

		const queryHistory = await loadQueryHistory();
		dispatch({ type: ActionType.SetQueryHistory, history: queryHistory });

		dispatch({
			type: ActionType.SetInfo,
			message: "SeerDB initialized successfully.",
		});
	} catch (error) {
		dispatch({
			type: ActionType.SetError,
			error:
				error instanceof Error ? error.message : "Failed to initialize app.",
		});
	} finally {
		dispatch({ type: ActionType.StopLoading });
	}
}

export async function fetchTables(
	dispatch: AppDispatch,
	dbConfig: DatabaseConfig,
): Promise<TableInfo[]> {
	dispatch({ type: ActionType.StartLoading });

	try {
		return await withConnection(dbConfig, async (connection) => {
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
		});
	} catch (error) {
		dispatch({
			type: ActionType.SetError,
			error: error instanceof Error ? error.message : "Failed to fetch tables.",
		});
		return [];
	} finally {
		dispatch({ type: ActionType.StopLoading });
	}
}

export async function fetchColumns(
	dispatch: AppDispatch,
	state: AppState,
	dbConfig: DatabaseConfig,
	table: TableInfo,
): Promise<void> {
	dispatch({ type: ActionType.StartLoading });

	let connection: DatabaseConnection | null = null;

	try {
		connection = createDatabaseConnection(dbConfig);
		await connection.connect();

		const { query, params } = sqlBuilder.buildColumnQuery(dbConfig.type, table);
		const result = await connection.query(query, params);

		const columns: ColumnInfo[] = result.rows.map((row) =>
			sqlBuilder.mapColumnRow(dbConfig.type, row as QueryRow),
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
	dispatch({ type: ActionType.StartLoading });

	let connection: DatabaseConnection | null = null;

	const offset = Math.max(options.offset ?? 0, 0);
	const limit = Math.max(options.limit ?? DEFAULT_PAGE_SIZE, 1);

	try {
		connection = createDatabaseConnection(dbConfig);
		await connection.connect();

		const query = sqlBuilder.buildTableDataQuery(
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
	const parsedValue = sqlBuilder.interpretEditedInput(inputValue, column);
	if (sqlBuilder.valuesAreEqual(originalValue, parsedValue)) {
		dispatch({
			type: ActionType.SetInfo,
			message: `No changes made to ${column.name}.`,
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
		const tableRef = sqlBuilder.buildTableReference(dbType, table);
		const columnRef = sqlBuilder.quoteIdentifier(dbType, column.name);

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
			return `${sqlBuilder.quoteIdentifier(dbType, pk.name)} = $${paramIndex++}`;
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

	const whereClause = sqlBuilder.buildSearchWhereClause(dbConfig.type, columns);
	const orderColumn = sqlBuilder.selectSearchOrderColumn(
		dbConfig.type,
		columns,
	);
	const queries = sqlBuilder.buildSearchQueries(
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
		const totalCount = sqlBuilder.extractCount(countResult.rows[0]);

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

export async function exportTableData(
	dispatch: AppDispatch,
	state: AppState,
	format: "csv" | "json" | "toon",
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

export const __internal = {
	...sqlBuilder,
	enqueueNotification,
} as const;
