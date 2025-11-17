import { describe, expect, it } from "bun:test";
import { ActionType } from "../../src/state/actions.js";
import { appReducer } from "../../src/state/reducer.js";
import type {
	BreadcrumbSegment,
	ColumnInfo,
	ConnectionInfo,
	DataRow,
	Notification,
	QueryHistoryItem,
	SortConfig,
	TableInfo,
	ViewHistoryEntry,
} from "../../src/types/state.js";
import { DBType, initialAppState, ViewState } from "../../src/types/state.js";

describe("appReducer", () => {
	describe("view management", () => {
		it("should set view and clear messages", () => {
			const state = {
				...initialAppState,
				infoMessage: "Previous info",
				errorMessage: "Previous error",
			};

			const result = appReducer(state, {
				type: ActionType.SetView,
				view: ViewState.Tables,
			});

			expect(result.currentView).toBe(ViewState.Tables);
			expect(result.infoMessage).toBeNull();
			expect(result.errorMessage).toBeNull();
		});

		it("should select DB type and change view to connection", () => {
			const result = appReducer(initialAppState, {
				type: ActionType.SelectDBType,
				dbType: DBType.PostgreSQL,
			});

			expect(result.dbType).toBe(DBType.PostgreSQL);
			expect(result.currentView).toBe(ViewState.Connection);
		});

		it("should set DB type without changing view", () => {
			const result = appReducer(initialAppState, {
				type: ActionType.SetDBType,
				dbType: DBType.MySQL,
			});

			expect(result.dbType).toBe(DBType.MySQL);
			expect(result.currentView).toBe(initialAppState.currentView);
		});
	});

	describe("loading state", () => {
		it("should start loading", () => {
			const result = appReducer(initialAppState, {
				type: ActionType.StartLoading,
			});

			expect(result.loading).toBe(true);
		});

		it("should stop loading", () => {
			const state = { ...initialAppState, loading: true };

			const result = appReducer(state, {
				type: ActionType.StopLoading,
			});

			expect(result.loading).toBe(false);
		});
	});

	describe("error and info messages", () => {
		it("should set error message from string and stop loading", () => {
			const state = { ...initialAppState, loading: true };

			const result = appReducer(state, {
				type: ActionType.SetError,
				error: "Connection failed",
			});

			expect(result.errorMessage).toBe("Connection failed");
			expect(result.loading).toBe(false);
		});

		it("should set error message from DatabaseError and stop loading", () => {
			const state = { ...initialAppState, loading: true };
			const dbError = new Error("Database connection failed");

			const result = appReducer(state, {
				type: ActionType.SetError,
				error: dbError,
			});

			expect(result.errorMessage).toBe("Database connection failed");
			expect(result.loading).toBe(false);
		});

		it("should clear error message", () => {
			const state = { ...initialAppState, errorMessage: "Previous error" };

			const result = appReducer(state, {
				type: ActionType.ClearError,
			});

			expect(result.errorMessage).toBeNull();
		});

		it("should set info message", () => {
			const result = appReducer(initialAppState, {
				type: ActionType.SetInfo,
				message: "Operation completed",
			});

			expect(result.infoMessage).toBe("Operation completed");
		});

		it("should clear info message", () => {
			const state = { ...initialAppState, infoMessage: "Previous info" };

			const result = appReducer(state, {
				type: ActionType.ClearInfo,
			});

			expect(result.infoMessage).toBeNull();
		});
	});

	describe("command hints", () => {
		it("should set show command hints", () => {
			const result = appReducer(initialAppState, {
				type: ActionType.SetShowCommandHints,
				show: true,
			});

			expect(result.showCommandHints).toBe(true);
		});
	});

	describe("connection management", () => {
		it("should set active connection", () => {
			const connection: ConnectionInfo = {
				id: "1",
				name: "Test DB",
				type: DBType.PostgreSQL,
				connectionString: "postgres://localhost/test",
				createdAt: "2023-01-01T00:00:00.000Z",
				updatedAt: "2023-01-01T00:00:00.000Z",
			};

			const result = appReducer(initialAppState, {
				type: ActionType.SetActiveConnection,
				connection,
			});

			expect(result.activeConnection).toEqual(connection);
		});

		it("should clear active connection and reset related state", () => {
			const state = {
				...initialAppState,
				activeConnection: {
					id: "1",
					name: "Test",
					type: DBType.PostgreSQL,
					connectionString: "postgres://localhost/test",
					createdAt: "2023-01-01T00:00:00.000Z",
					updatedAt: "2023-01-01T00:00:00.000Z",
				},
				tables: [{ name: "users", schema: "public", type: "table" as const }],
				columns: [{ name: "id", dataType: "integer", nullable: false }],
				selectedTable: {
					name: "users",
					schema: "public",
					type: "table" as const,
				},
				dataRows: [{ id: 1 }],
				hasMoreRows: true,
				currentOffset: 10,
				refreshingTableKey: "public|users",
				refreshTimestamps: { "public|users": Date.now() },
				notifications: [
					{
						id: "1",
						message: "Test",
						level: "info" as const,
						createdAt: Date.now(),
					},
				],
				searchTerm: "test",
				searchResults: [{ id: 1 }],
			};

			const result = appReducer(state, {
				type: ActionType.ClearActiveConnection,
			});

			expect(result.activeConnection).toBeNull();
			expect(result.tables).toEqual([]);
			expect(result.columns).toEqual([]);
			expect(result.selectedTable).toBeNull();
			expect(result.dataRows).toEqual([]);
			expect(result.hasMoreRows).toBe(false);
			expect(result.currentOffset).toBe(0);
			expect(result.refreshingTableKey).toBeNull();
			expect(result.refreshTimestamps).toEqual({});
			expect(result.notifications).toEqual([]);
			expect(result.searchTerm).toBe("");
			expect(result.searchResults).toEqual([]);
		});

		it("should set saved connections", () => {
			const connections: ConnectionInfo[] = [
				{
					id: "1",
					name: "DB 1",
					type: DBType.PostgreSQL,
					connectionString: "postgres://localhost/db1",
					createdAt: "2023-01-01T00:00:00.000Z",
					updatedAt: "2023-01-01T00:00:00.000Z",
				},
			];

			const result = appReducer(initialAppState, {
				type: ActionType.SetSavedConnections,
				connections,
			});

			expect(result.savedConnections).toEqual(connections);
		});

		it("should add saved connection", () => {
			const connection: ConnectionInfo = {
				id: "1",
				name: "New DB",
				type: DBType.SQLite,
				connectionString: "/path/to/db.sqlite",
				createdAt: "2023-01-01T00:00:00.000Z",
				updatedAt: "2023-01-01T00:00:00.000Z",
			};

			const result = appReducer(initialAppState, {
				type: ActionType.AddSavedConnection,
				connection,
			});

			expect(result.savedConnections).toContain(connection);
		});

		it("should update existing saved connection", () => {
			const originalConnection: ConnectionInfo = {
				id: "1",
				name: "Old Name",
				type: DBType.PostgreSQL,
				connectionString: "postgres://localhost/old",
				createdAt: "2023-01-01T00:00:00.000Z",
				updatedAt: "2023-01-01T00:00:00.000Z",
			};
			const updatedConnection: ConnectionInfo = {
				...originalConnection,
				name: "New Name",
				connectionString: "postgres://localhost/new",
				updatedAt: "2023-01-02T00:00:00.000Z",
			};

			const state = {
				...initialAppState,
				savedConnections: [originalConnection],
			};

			const result = appReducer(state, {
				type: ActionType.UpdateSavedConnection,
				connection: updatedConnection,
			});

			expect(result.savedConnections).toHaveLength(1);
			expect(result.savedConnections[0]).toEqual(updatedConnection);
		});

		it("should not update non-existent saved connection", () => {
			const connection: ConnectionInfo = {
				id: "999",
				name: "Non-existent",
				type: DBType.PostgreSQL,
				connectionString: "postgres://localhost/test",
				createdAt: "2023-01-01T00:00:00.000Z",
				updatedAt: "2023-01-01T00:00:00.000Z",
			};

			const result = appReducer(initialAppState, {
				type: ActionType.UpdateSavedConnection,
				connection,
			});

			expect(result.savedConnections).toEqual([]);
		});

		it("should remove saved connection", () => {
			const connection1: ConnectionInfo = {
				id: "1",
				name: "DB 1",
				type: DBType.PostgreSQL,
				connectionString: "postgres://localhost/db1",
				createdAt: "2023-01-01T00:00:00.000Z",
				updatedAt: "2023-01-01T00:00:00.000Z",
			};
			const connection2: ConnectionInfo = {
				id: "2",
				name: "DB 2",
				type: DBType.MySQL,
				connectionString: "mysql://localhost/db2",
				createdAt: "2023-01-01T00:00:00.000Z",
				updatedAt: "2023-01-01T00:00:00.000Z",
			};

			const state = {
				...initialAppState,
				savedConnections: [connection1, connection2],
			};

			const result = appReducer(state, {
				type: ActionType.RemoveSavedConnection,
				connectionId: "1",
			});

			expect(result.savedConnections).toHaveLength(1);
			expect(result.savedConnections[0]).toEqual(connection2);
		});
	});

	describe("table and data management", () => {
		it("should set tables", () => {
			const tables: TableInfo[] = [
				{ name: "users", schema: "public", type: "table" as const },
				{ name: "posts", schema: "public", type: "table" as const },
			];

			const result = appReducer(initialAppState, {
				type: ActionType.SetTables,
				tables,
			});

			expect(result.tables).toEqual(tables);
		});

		it("should set columns", () => {
			const columns: ColumnInfo[] = [
				{
					name: "id",
					dataType: "integer",
					nullable: false,
					isPrimaryKey: true,
				},
				{ name: "name", dataType: "varchar", nullable: false },
			];

			const result = appReducer(initialAppState, {
				type: ActionType.SetColumns,
				columns,
			});

			expect(result.columns).toEqual(columns);
		});

		it("should set selected table and reset related state", () => {
			const table: TableInfo = {
				name: "users",
				schema: "public",
				type: "table" as const,
			};

			const state = {
				...initialAppState,
				columns: [{ name: "id", dataType: "integer", nullable: false }],
				dataRows: [{ id: 1 }],
				hasMoreRows: true,
				currentOffset: 10,
				searchTerm: "test",
				searchResults: [{ id: 1 }],
			};

			const result = appReducer(state, {
				type: ActionType.SetSelectedTable,
				table,
			});

			expect(result.selectedTable).toEqual(table);
			expect(result.columns).toEqual([]);
			expect(result.dataRows).toEqual([]);
			expect(result.hasMoreRows).toBe(false);
			expect(result.currentOffset).toBe(0);
			expect(result.refreshingTableKey).toBe("public|users");
			expect(result.searchTerm).toBe("");
			expect(result.searchResults).toEqual([]);
		});

		it("should clear selected table", () => {
			const state = {
				...initialAppState,
				selectedTable: {
					name: "users",
					schema: "public",
					type: "table" as const,
				},
				columns: [{ name: "id", dataType: "integer", nullable: false }],
				dataRows: [{ id: 1 }],
				hasMoreRows: true,
				currentOffset: 10,
				refreshingTableKey: "public|users",
				searchTerm: "test",
				searchResults: [{ id: 1 }],
			};

			const result = appReducer(state, {
				type: ActionType.ClearSelectedTable,
			});

			expect(result.selectedTable).toBeNull();
			expect(result.columns).toEqual([]);
			expect(result.dataRows).toEqual([]);
			expect(result.hasMoreRows).toBe(false);
			expect(result.currentOffset).toBe(0);
			expect(result.refreshingTableKey).toBeNull();
			expect(result.searchTerm).toBe("");
			expect(result.searchResults).toEqual([]);
		});

		it("should set refreshing table key", () => {
			const result = appReducer(initialAppState, {
				type: ActionType.SetRefreshingTable,
				key: "public|users",
			});

			expect(result.refreshingTableKey).toBe("public|users");
		});

		it("should set refresh timestamp", () => {
			const timestamp = Date.now();

			const result = appReducer(initialAppState, {
				type: ActionType.SetRefreshTimestamp,
				key: "public|users",
				timestamp,
			});

			expect(result.refreshTimestamps["public|users"]).toBe(timestamp);
		});

		it("should update data row value with rowIndex", () => {
			const state = {
				...initialAppState,
				dataRows: [
					{ id: 1, name: "Alice" },
					{ id: 2, name: "Bob" },
				],
				expandedRow: { id: 1, name: "Alice", email: "alice@example.com" },
			};

			const result = appReducer(state, {
				type: ActionType.UpdateDataRowValue,
				columnName: "name",
				value: "Alice Updated",
				rowIndex: 0,
				table: null,
			});

			expect(result.dataRows[0].name).toBe("Alice Updated");
			expect(result.expandedRow?.name).toBe("Alice Updated");
		});

		it("should update data row value with selectedRowIndex", () => {
			const state = {
				...initialAppState,
				selectedRowIndex: 1,
				dataRows: [
					{ id: 1, name: "Alice" },
					{ id: 2, name: "Bob" },
				],
				expandedRow: { id: 2, name: "Bob", email: "bob@example.com" },
			};

			const result = appReducer(state, {
				type: ActionType.UpdateDataRowValue,
				columnName: "name",
				value: "Bob Updated",
				rowIndex: null,
				table: null,
			});

			expect(result.dataRows[1].name).toBe("Bob Updated");
			expect(result.expandedRow?.name).toBe("Bob Updated");
		});

		it("should set data rows", () => {
			const rows: DataRow[] = [
				{ id: 1, name: "Alice" },
				{ id: 2, name: "Bob" },
			];

			const result = appReducer(initialAppState, {
				type: ActionType.SetDataRows,
				rows,
			});

			expect(result.dataRows).toEqual(rows);
		});

		it("should set has more rows", () => {
			const result = appReducer(initialAppState, {
				type: ActionType.SetHasMoreRows,
				hasMore: true,
			});

			expect(result.hasMoreRows).toBe(true);
		});

		it("should set current offset and clear selection", () => {
			const state = {
				...initialAppState,
				selectedRowIndex: 5,
				expandedRow: { id: 5, name: "Test" },
			};

			const result = appReducer(state, {
				type: ActionType.SetCurrentOffset,
				offset: 50,
			});

			expect(result.currentOffset).toBe(50);
			expect(result.selectedRowIndex).toBeNull();
			expect(result.expandedRow).toBeNull();
		});

		it("should set selected row index and clear expanded row", () => {
			const state = {
				...initialAppState,
				selectedRowIndex: 2,
				expandedRow: { id: 2, name: "Previous" },
			};

			const result = appReducer(state, {
				type: ActionType.SetSelectedRowIndex,
				index: 5,
			});

			expect(result.selectedRowIndex).toBe(5);
			expect(result.expandedRow).toBeNull();
		});

		it("should set expanded row", () => {
			const row: DataRow = { id: 1, name: "Alice", email: "alice@example.com" };

			const result = appReducer(initialAppState, {
				type: ActionType.SetExpandedRow,
				row,
			});

			expect(result.expandedRow).toEqual(row);
		});

		it("should set column visibility mode", () => {
			const result = appReducer(initialAppState, {
				type: ActionType.SetColumnVisibilityMode,
				mode: "minimal",
			});

			expect(result.columnVisibilityMode).toBe("minimal");
		});
	});

	describe("notifications", () => {
		it("should add notification", () => {
			const notification: Notification = {
				id: "1",
				message: "Test notification",
				level: "info" as const,
				createdAt: Date.now(),
			};

			const result = appReducer(initialAppState, {
				type: ActionType.AddNotification,
				notification,
			});

			expect(result.notifications).toContain(notification);
		});

		it("should remove notification", () => {
			const notification1: Notification = {
				id: "1",
				message: "Notification 1",
				level: "info" as const,
				createdAt: Date.now(),
			};
			const notification2: Notification = {
				id: "2",
				message: "Notification 2",
				level: "warning" as const,
				createdAt: Date.now(),
			};

			const state = {
				...initialAppState,
				notifications: [notification1, notification2],
			};

			const result = appReducer(state, {
				type: ActionType.RemoveNotification,
				id: "1",
			});

			expect(result.notifications).toHaveLength(1);
			expect(result.notifications[0]).toEqual(notification2);
		});
	});

	describe("query history", () => {
		it("should set query history", () => {
			const history: QueryHistoryItem[] = [
				{
					id: "1",
					connectionId: "conn1",
					query: "SELECT * FROM users",
					executedAt: "2023-01-01T00:00:00.000Z",
					durationMs: 100,
					rowCount: 10,
				},
			];

			const result = appReducer(initialAppState, {
				type: ActionType.SetQueryHistory,
				history,
			});

			expect(result.queryHistory).toEqual(history);
		});

		it("should set empty query history", () => {
			const result = appReducer(initialAppState, {
				type: ActionType.SetQueryHistory,
				history: [],
			});

			expect(result.queryHistory).toEqual([]);
		});

		it("should add query history item", () => {
			const item: QueryHistoryItem = {
				id: "1",
				connectionId: "conn1",
				query: "SELECT * FROM users",
				executedAt: "2023-01-01T00:00:00.000Z",
				durationMs: 100,
				rowCount: 10,
			};

			const result = appReducer(initialAppState, {
				type: ActionType.AddQueryHistoryItem,
				item,
			});

			expect(result.queryHistory).toHaveLength(1);
			expect(result.queryHistory?.[0]).toEqual(item);
		});

		it("should add to existing query history", () => {
			const existingItem: QueryHistoryItem = {
				id: "existing",
				connectionId: "conn1",
				query: "SELECT 1",
				executedAt: "2023-01-01T00:00:00.000Z",
				durationMs: 50,
				rowCount: 1,
			};

			const newItem: QueryHistoryItem = {
				id: "1",
				connectionId: "conn1",
				query: "SELECT * FROM users",
				executedAt: "2023-01-01T00:00:00.000Z",
				durationMs: 100,
				rowCount: 10,
			};

			const state = { ...initialAppState, queryHistory: [existingItem] };

			const result = appReducer(state, {
				type: ActionType.AddQueryHistoryItem,
				item: newItem,
			});

			expect(result.queryHistory).toHaveLength(2);
			expect(result.queryHistory?.[0]).toEqual(newItem);
			expect(result.queryHistory?.[1]).toEqual(existingItem);
		});
	});

	describe("sorting and filtering", () => {
		it("should set sort config", () => {
			const sortConfig: SortConfig = {
				column: "name",
				direction: "desc",
			};

			const result = appReducer(initialAppState, {
				type: ActionType.SetSortConfig,
				sortConfig,
			});

			expect(result.sortConfig).toEqual(sortConfig);
		});

		it("should enter sort picker mode", () => {
			const result = appReducer(initialAppState, {
				type: ActionType.EnterSortPickerMode,
			});

			expect(result.sortPickerMode).toBe(true);
			expect(result.sortPickerColumnIndex).toBe(0);
		});

		it("should exit sort picker mode", () => {
			const state = {
				...initialAppState,
				sortPickerMode: true,
				sortPickerColumnIndex: 2,
			};

			const result = appReducer(state, {
				type: ActionType.ExitSortPickerMode,
			});

			expect(result.sortPickerMode).toBe(false);
		});

		it("should set sort picker column", () => {
			const result = appReducer(initialAppState, {
				type: ActionType.SetSortPickerColumn,
				columnIndex: 3,
			});

			expect(result.sortPickerColumnIndex).toBe(3);
		});

		it("should set filter value", () => {
			const result = appReducer(initialAppState, {
				type: ActionType.SetFilterValue,
				filterValue: "test filter",
			});

			expect(result.filterValue).toBe("test filter");
		});
	});

	describe("search functionality", () => {
		it("should set search term", () => {
			const result = appReducer(initialAppState, {
				type: ActionType.SetSearchTerm,
				term: "search query",
			});

			expect(result.searchTerm).toBe("search query");
		});

		it("should set search results page", () => {
			const rows: DataRow[] = [{ id: 1, name: "Result 1" }];

			const result = appReducer(initialAppState, {
				type: ActionType.SetSearchResultsPage,
				rows,
				totalCount: 100,
				offset: 50,
				hasMore: true,
			});

			expect(result.searchResults).toEqual(rows);
			expect(result.searchTotalCount).toBe(100);
			expect(result.searchOffset).toBe(50);
			expect(result.searchHasMore).toBe(true);
			expect(result.searchSelectedIndex).toBe(0);
		});

		it("should set search results page with empty results", () => {
			const result = appReducer(initialAppState, {
				type: ActionType.SetSearchResultsPage,
				rows: [],
				totalCount: 0,
				offset: 0,
				hasMore: false,
			});

			expect(result.searchResults).toEqual([]);
			expect(result.searchSelectedIndex).toBeNull();
		});

		it("should set search selected index", () => {
			const result = appReducer(initialAppState, {
				type: ActionType.SetSearchSelectedIndex,
				index: 5,
			});

			expect(result.searchSelectedIndex).toBe(5);
		});

		it("should clear search state", () => {
			const state = {
				...initialAppState,
				searchTerm: "test",
				searchResults: [{ id: 1 }],
				searchTotalCount: 10,
				searchOffset: 5,
				searchHasMore: true,
				searchSelectedIndex: 2,
			};

			const result = appReducer(state, {
				type: ActionType.ClearSearch,
			});

			expect(result.searchTerm).toBe("");
			expect(result.searchResults).toEqual([]);
			expect(result.searchTotalCount).toBe(0);
			expect(result.searchOffset).toBe(0);
			expect(result.searchHasMore).toBe(false);
			expect(result.searchSelectedIndex).toBeNull();
		});
	});

	describe("view history and breadcrumbs", () => {
		it("should add view history entry", () => {
			const entry: ViewHistoryEntry = {
				id: "1",
				view: ViewState.Tables,
				summary: "Viewed tables",
				timestamp: Date.now(),
			};

			const result = appReducer(initialAppState, {
				type: ActionType.AddViewHistoryEntry,
				entry,
			});

			expect(result.viewHistory).toContain(entry);
		});

		it("should prevent duplicate view history entries", () => {
			const entry: ViewHistoryEntry = {
				id: "1",
				view: ViewState.Tables,
				summary: "Viewed tables",
				timestamp: Date.now(),
			};

			const state = {
				...initialAppState,
				viewHistory: [entry],
			};

			const result = appReducer(state, {
				type: ActionType.AddViewHistoryEntry,
				entry: { ...entry, id: "2", timestamp: Date.now() + 1000 },
			});

			expect(result.viewHistory).toHaveLength(1);
		});

		it("should set breadcrumbs", () => {
			const breadcrumbs: BreadcrumbSegment[] = [
				{ label: "Home", view: ViewState.SavedConnections },
				{ label: "Tables", view: ViewState.Tables },
			];

			const result = appReducer(initialAppState, {
				type: ActionType.SetBreadcrumbs,
				breadcrumbs,
			});

			expect(result.breadcrumbs).toEqual(breadcrumbs);
		});

		it("should add breadcrumb", () => {
			const breadcrumb: BreadcrumbSegment = {
				label: "Users",
				view: ViewState.DataPreview,
			};

			const result = appReducer(initialAppState, {
				type: ActionType.AddBreadcrumb,
				breadcrumb,
			});

			expect(result.breadcrumbs).toContain(breadcrumb);
		});

		it("should prevent duplicate consecutive breadcrumbs", () => {
			const breadcrumb: BreadcrumbSegment = {
				label: "Tables",
				view: ViewState.Tables,
			};

			const state = {
				...initialAppState,
				breadcrumbs: [breadcrumb],
			};

			const result = appReducer(state, {
				type: ActionType.AddBreadcrumb,
				breadcrumb: { ...breadcrumb },
			});

			expect(result.breadcrumbs).toHaveLength(1);
		});

		it("should clear history", () => {
			const state = {
				...initialAppState,
				viewHistory: [
					{
						id: "1",
						view: ViewState.Tables,
						summary: "Viewed tables",
						timestamp: Date.now(),
					},
				],
				breadcrumbs: [
					{ label: "Home", view: ViewState.SavedConnections },
					{ label: "Tables", view: ViewState.Tables },
				],
			};

			const result = appReducer(state, {
				type: ActionType.ClearHistory,
			});

			expect(result.viewHistory).toEqual([]);
			expect(result.breadcrumbs).toEqual([]);
		});
	});

	describe("default case", () => {
		it("should return original state for unknown action", () => {
			const unknownAction = {
				type: "UNKNOWN_ACTION" as any,
			};

			const result = appReducer(initialAppState, unknownAction);

			expect(result).toBe(initialAppState);
		});
	});
});
