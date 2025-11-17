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

describe("appReducer - Expanded Coverage", () => {
	describe("basic state management", () => {
		it("sets DB type without changing view", () => {
			const result = appReducer(initialAppState, {
				type: ActionType.SetDBType,
				dbType: DBType.MySQL,
			});
			expect(result.dbType).toBe(DBType.MySQL);
			expect(result.currentView).toBe(initialAppState.currentView);
		});

		it("starts and stops loading", () => {
			let result = appReducer(initialAppState, {
				type: ActionType.StartLoading,
			});
			expect(result.loading).toBe(true);

			result = appReducer(result, {
				type: ActionType.StopLoading,
			});
			expect(result.loading).toBe(false);
		});

		it("sets error message and stops loading", () => {
			const result = appReducer(
				{ ...initialAppState, loading: true },
				{
					type: ActionType.SetError,
					error: "Connection failed",
				},
			);
			expect(result.errorMessage).toBe("Connection failed");
			expect(result.loading).toBe(false);
		});

		it("sets DatabaseError message", () => {
			const dbError = new Error("Database connection failed");
			const result = appReducer(initialAppState, {
				type: ActionType.SetError,
				error: dbError,
			});
			expect(result.errorMessage).toBe("Database connection failed");
		});

		it("clears error message", () => {
			const stateWithError = {
				...initialAppState,
				errorMessage: "Previous error",
			};
			const result = appReducer(stateWithError, {
				type: ActionType.ClearError,
			});
			expect(result.errorMessage).toBeNull();
		});

		it("sets and clears info message", () => {
			let result = appReducer(initialAppState, {
				type: ActionType.SetInfo,
				message: "Operation completed",
			});
			expect(result.infoMessage).toBe("Operation completed");

			result = appReducer(result, {
				type: ActionType.ClearInfo,
			});
			expect(result.infoMessage).toBeNull();
		});
	});

	describe("connection management", () => {
		it("sets active connection", () => {
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

		it("clears active connection and resets related state", () => {
			const stateWithConnection = {
				...initialAppState,
				activeConnection: {
					id: "1",
					name: "Test",
					type: DBType.PostgreSQL,
					connectionString: "postgres://localhost/test",
					createdAt: "2023-01-01T00:00:00.000Z",
					updatedAt: "2023-01-01T00:00:00.000Z",
				},
				tables: [{ name: "users", schema: "public", type: "table" }],
				columns: [{ name: "id", dataType: "integer", nullable: false }],
				selectedTable: { name: "users", schema: "public", type: "table" },
				dataRows: [{ id: 1 }],
				hasMoreRows: true,
				currentOffset: 10,
				refreshingTableKey: "public|users",
				refreshTimestamps: { "public|users": Date.now() },
				notifications: [{ id: "1", message: "Test", level: "info" }],
				searchTerm: "test",
				searchResults: [{ id: 1 }],
			};
			const result = appReducer(stateWithConnection, {
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

		it("adds saved connection", () => {
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

		it("updates existing saved connection", () => {
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

		it("does not update non-existent saved connection", () => {
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

		it("removes saved connection", () => {
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
		it("sets tables list", () => {
			const tables: TableInfo[] = [
				{ name: "users", schema: "public", type: "table" },
				{ name: "posts", schema: "public", type: "table" },
				{ name: "user_view", schema: "public", type: "view" },
			];
			const result = appReducer(initialAppState, {
				type: ActionType.SetTables,
				tables,
			});
			expect(result.tables).toEqual(tables);
		});

		it("sets columns and updates cache", () => {
			const state = {
				...initialAppState,
				selectedTable: { name: "users", schema: "public", type: "table" },
				dataRows: [{ id: 1, name: "Alice" }],
				hasMoreRows: true,
				currentOffset: 10,
			};

			const columns: ColumnInfo[] = [
				{ name: "id", dataType: "integer", nullable: false },
				{ name: "name", dataType: "varchar", nullable: false },
			];

			const result = appReducer(state, {
				type: ActionType.SetColumns,
				columns,
			});

			expect(result.columns).toEqual(columns);
				columns,
				rows: [{ id: 1, name: "Alice" }],
				hasMore: true,
				offset: 10,
			});
		});

		it("clears selected table and resets state", () => {
			const state = {
				...initialAppState,
				selectedTable: { name: "users", schema: "public", type: "table" },
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
			expect(result.dataRows).toEqual([]);
			expect(result.hasMoreRows).toBe(false);
			expect(result.currentOffset).toBe(0);
			expect(result.refreshingTableKey).toBeNull();
			expect(result.searchTerm).toBe("");
			expect(result.searchResults).toEqual([]);
		});

		it("sets data rows and updates cache", () => {
			const state = {
				...initialAppState,
				selectedTable: { name: "users", schema: "public", type: "table" },
				columns: [{ name: "id", dataType: "integer", nullable: false }],
				refreshingTableKey: "public|users",
			};

			const rows: DataRow[] = [
				{ id: 1, name: "Alice" },
				{ id: 2, name: "Bob" },
			];

			const result = appReducer(state, {
				type: ActionType.SetDataRows,
				rows,
			});

			expect(result.dataRows).toEqual(rows);
				columns: [{ name: "id", dataType: "integer", nullable: false }],
				rows,
				hasMore: false,
				offset: 0,
			});
			expect(result.refreshingTableKey).toBeNull();
		});

		it("sets has more rows and updates cache", () => {
			const state = {
				...initialAppState,
				selectedTable: { name: "users", schema: "public", type: "table" },
				columns: [{ name: "id", dataType: "integer", nullable: false }],
				dataRows: [{ id: 1 }],
			};

			const result = appReducer(state, {
				type: ActionType.SetHasMoreRows,
				hasMore: true,
			});

			expect(result.hasMoreRows).toBe(true);
				columns: [{ name: "id", dataType: "integer", nullable: false }],
				rows: [{ id: 1 }],
				hasMore: true,
				offset: 0,
			});
		});

		it("sets current offset and clears selection", () => {
			const state = {
				...initialAppState,
				selectedTable: { name: "users", schema: "public", type: "table" },
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
				columns: [],
				rows: [],
				hasMore: false,
				offset: 50,
			});
		});

		it("sets selected row index and clears expanded row", () => {
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

		it("sets expanded row", () => {
			const row: DataRow = { id: 1, name: "Alice", email: "alice@example.com" };
			const result = appReducer(initialAppState, {
				type: ActionType.SetExpandedRow,
				row,
			});
			expect(result.expandedRow).toEqual(row);
		});

		it("sets column visibility mode", () => {
			const result = appReducer(initialAppState, {
				type: ActionType.SetColumnVisibilityMode,
				mode: "hidden",
			});
			expect(result.columnVisibilityMode).toBe("hidden");
		});
	});

	describe("cache management", () => {
		it("sets table cache", () => {
			const cache = {
				"public|users": {
					columns: [{ name: "id", dataType: "integer", nullable: false }],
					rows: [{ id: 1 }],
					hasMore: false,
					offset: 0,
				},
			};
			const result = appReducer(initialAppState, {
				type: ActionType.SetTableCache,
				cache,
			});
			expect(result.refreshingTableKey).toBeNull();
		});

		it("removes table cache entry", () => {
			const cacheKey = "public|users";
			const state = {
				...initialAppState,
					[cacheKey]: {
						columns: [{ name: "id", dataType: "integer", nullable: false }],
						rows: [{ id: 1 }],
						hasMore: false,
						offset: 0,
					},
				},
				selectedTable: { name: "users", schema: "public", type: "table" },
				columns: [{ name: "id", dataType: "integer", nullable: false }],
				dataRows: [{ id: 1 }],
				hasMoreRows: true,
				currentOffset: 10,
			};

			const result = appReducer(state, {
				type: ActionType.RemoveTableCacheEntry,
				key: cacheKey,
			});

			expect(result.columns).toEqual([]);
			expect(result.dataRows).toEqual([]);
			expect(result.hasMoreRows).toBe(false);
			expect(result.currentOffset).toBe(0);
			expect(result.refreshingTableKey).toBe(cacheKey);
		});

		it("sets refreshing table key", () => {
			const result = appReducer(initialAppState, {
				type: ActionType.SetRefreshingTable,
				key: "public|users",
			});
			expect(result.refreshingTableKey).toBe("public|users");
		});

		it("sets refresh timestamp", () => {
			const timestamp = Date.now();
			const result = appReducer(initialAppState, {
				type: ActionType.SetRefreshTimestamp,
				key: "public|users",
				timestamp,
			});
			expect(result.refreshTimestamps["public|users"]).toBe(timestamp);
		});
	});

	describe("notifications", () => {
		it("adds notification", () => {
			const notification: Notification = {
				id: "1",
				message: "Test notification",
				level: "info",
			};
			const result = appReducer(initialAppState, {
				type: ActionType.AddNotification,
				notification,
			});
			expect(result.notifications).toContain(notification);
		});

		it("removes notification", () => {
			const notification1: Notification = {
				id: "1",
				message: "Notification 1",
				level: "info",
			};
			const notification2: Notification = {
				id: "2",
				message: "Notification 2",
				level: "warning",
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
		it("sets query history", () => {
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

		it("sets undefined query history", () => {
			const result = appReducer(initialAppState, {
				type: ActionType.SetQueryHistory,
				history: undefined,
			});
			expect(result.queryHistory).toEqual([]);
		});
	});

	describe("sorting and filtering", () => {
		it("sets sort config", () => {
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

		it("sets filter value", () => {
			const result = appReducer(initialAppState, {
				type: ActionType.SetFilterValue,
				filterValue: "test filter",
			});
			expect(result.filterValue).toBe("test filter");
		});
	});

	describe("search functionality", () => {
		it("sets search term", () => {
			const result = appReducer(initialAppState, {
				type: ActionType.SetSearchTerm,
				term: "search query",
			});
			expect(result.searchTerm).toBe("search query");
		});

		it("sets search results page", () => {
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

		it("sets search results page with empty results", () => {
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

		it("sets search selected index", () => {
			const result = appReducer(initialAppState, {
				type: ActionType.SetSearchSelectedIndex,
				index: 5,
			});
			expect(result.searchSelectedIndex).toBe(5);
		});

		it("clears search state", () => {
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
		it("adds view history entry", () => {
			const entry: ViewHistoryEntry = {
				id: "1",
				view: ViewState.Tables,
				summary: "Viewed tables",
				timestamp: "2023-01-01T00:00:00.000Z",
			};

			const result = appReducer(initialAppState, {
				type: ActionType.AddViewHistoryEntry,
				entry,
			});

			expect(result.viewHistory).toContain(entry);
		});

		it("prevents duplicate view history entries", () => {
			const entry: ViewHistoryEntry = {
				id: "1",
				view: ViewState.Tables,
				summary: "Viewed tables",
				timestamp: "2023-01-01T00:00:00.000Z",
			};

			const state = {
				...initialAppState,
				viewHistory: [entry],
			};

			const result = appReducer(state, {
				type: ActionType.AddViewHistoryEntry,
				entry: { ...entry, id: "2", timestamp: "2023-01-01T00:01:00.000Z" },
			});

			// Should not add duplicate entry
			expect(result.viewHistory).toHaveLength(1);
		});

		it("sets breadcrumbs", () => {
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

		it("adds breadcrumb", () => {
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

		it("prevents duplicate consecutive breadcrumbs", () => {
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

		it("clears history", () => {
			const state = {
				...initialAppState,
				viewHistory: [
					{
						id: "1",
						view: ViewState.Tables,
						summary: "Viewed tables",
						timestamp: "2023-01-01T00:00:00.000Z",
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
		it("returns original state for unknown action", () => {
			const unknownAction = {
				type: "UNKNOWN_ACTION" as any,
			};

			const result = appReducer(initialAppState, unknownAction);

			expect(result).toBe(initialAppState);
		});
	});

	describe("complex interaction scenarios", () => {
		it("handles complete workflow from connection to data viewing", () => {
			let state = initialAppState;

			// Select DB type
			state = appReducer(state, {
				type: ActionType.SelectDBType,
				dbType: DBType.PostgreSQL,
			});
			expect(state.currentView).toBe(ViewState.Connection);

			// Set active connection
			const connection: ConnectionInfo = {
				id: "1",
				name: "Test DB",
				type: DBType.PostgreSQL,
				connectionString: "postgres://localhost/test",
				createdAt: "2023-01-01T00:00:00.000Z",
				updatedAt: "2023-01-01T00:00:00.000Z",
			};
			state = appReducer(state, {
				type: ActionType.SetActiveConnection,
				connection,
			});

			// Set tables
			const tables: TableInfo[] = [
				{ name: "users", schema: "public", type: "table" },
			];
			state = appReducer(state, {
				type: ActionType.SetTables,
				tables,
			});

			// Select table
			state = appReducer(state, {
				type: ActionType.SetSelectedTable,
				table: tables[0],
			});

			// Set columns
			const columns: ColumnInfo[] = [
				{ name: "id", dataType: "integer", nullable: false },
				{ name: "name", dataType: "varchar", nullable: false },
			];
			state = appReducer(state, {
				type: ActionType.SetColumns,
				columns,
			});

			// Set data rows
			const rows: DataRow[] = [
				{ id: 1, name: "Alice" },
				{ id: 2, name: "Bob" },
			];
			state = appReducer(state, {
				type: ActionType.SetDataRows,
				rows,
			});

			// Verify final state
			expect(state.activeConnection).toEqual(connection);
			expect(state.tables).toEqual(tables);
			expect(state.selectedTable).toEqual(tables[0]);
			expect(state.columns).toEqual(columns);
			expect(state.dataRows).toEqual(rows);
				columns,
				rows,
				hasMore: false,
				offset: 0,
			});
		});
	});
});
