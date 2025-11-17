import { describe, expect, it } from "bun:test";
import { ActionType } from "../../src/state/actions.js";
import { appReducer } from "../../src/state/reducer.js";
import type {
	ConnectionInfo,
	QueryHistoryItem,
} from "../../src/types/state.js";
import { DBType, initialAppState, ViewState } from "../../src/types/state.js";

describe("appReducer - Missing line coverage", () => {
	it("sets infoMessage and errorMessage to null in SetView action", () => {
		const state = {
			...initialAppState,
			infoMessage: "Previous info",
			errorMessage: "Previous error",
		};

		const result = appReducer(state, {
			type: ActionType.SetView,
			view: ViewState.Tables,
		});

		expect(result.infoMessage).toBeNull();
		expect(result.errorMessage).toBeNull();
	});

	it("sets saved connections array", () => {
		const connections: ConnectionInfo[] = [
			{
				id: "1",
				name: "Test DB",
				type: DBType.PostgreSQL,
				connectionString: "postgres://localhost/test",
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

	it("adds connection to saved connections", () => {
		const existingConnection: ConnectionInfo = {
			id: "1",
			name: "Existing DB",
			type: DBType.MySQL,
			connectionString: "mysql://localhost/existing",
			createdAt: "2023-01-01T00:00:00.000Z",
			updatedAt: "2023-01-01T00:00:00.000Z",
		};

		const state = {
			...initialAppState,
			savedConnections: [existingConnection],
		};

		const newConnection: ConnectionInfo = {
			id: "2",
			name: "New DB",
			type: DBType.SQLite,
			connectionString: "/path/to/new.db",
			createdAt: "2023-01-02T00:00:00.000Z",
			updatedAt: "2023-01-02T00:00:00.000Z",
		};

		const result = appReducer(state, {
			type: ActionType.AddSavedConnection,
			connection: newConnection,
		});

		expect(result.savedConnections).toHaveLength(2);
		expect(result.savedConnections[1]).toEqual(newConnection);
	});

	it("unshifts item to query history when history is provided", () => {
		const existingHistory: QueryHistoryItem[] = [
			{
				id: "1",
				connectionId: "conn1",
				query: "SELECT * FROM users",
				executedAt: "2023-01-01T00:00:00.000Z",
				durationMs: 100,
				rowCount: 10,
			},
		];

		const state = {
			...initialAppState,
			queryHistory: existingHistory,
		};

		const newItem: QueryHistoryItem = {
			id: "2",
			connectionId: "conn1",
			query: "SELECT * FROM posts",
			executedAt: "2023-01-01T01:00:00.000Z",
			durationMs: 150,
			rowCount: 5,
		};

		const result = appReducer(state, {
			type: ActionType.AddQueryHistoryItem,
			item: newItem,
		});

		expect(result.queryHistory).toHaveLength(2);
		expect(result.queryHistory[0]).toEqual(newItem);
		expect(result.queryHistory[1]).toEqual(existingHistory[0]);
	});

	it("unshifts item to query history when history is null/undefined", () => {
		const state = {
			...initialAppState,
			queryHistory: [],
		};

		const newItem: QueryHistoryItem = {
			id: "1",
			connectionId: "conn1",
			query: "SELECT * FROM users",
			executedAt: "2023-01-01T00:00:00.000Z",
			durationMs: 100,
			rowCount: 10,
		};

		const result = appReducer(state, {
			type: ActionType.AddQueryHistoryItem,
			item: newItem,
		});

		expect(result.queryHistory).toHaveLength(1);
		expect(result.queryHistory[0]).toEqual(newItem);
	});

	it("handles query history with default empty array", () => {
		const result = appReducer(initialAppState, {
			type: ActionType.SetQueryHistory,
			history: [],
		});

		expect(result.queryHistory).toEqual([]);
	});

	it("sets breadcrumb without preventing duplicates when last is different", () => {
		const existingBreadcrumb = {
			label: "Home",
			view: ViewState.SavedConnections,
		};

		const state = {
			...initialAppState,
			breadcrumbs: [existingBreadcrumb],
		};

		const newBreadcrumb = {
			label: "Tables",
			view: ViewState.Tables,
		};

		const result = appReducer(state, {
			type: ActionType.AddBreadcrumb,
			breadcrumb: newBreadcrumb,
		});

		expect(result.breadcrumbs).toHaveLength(2);
		expect(result.breadcrumbs[0]).toEqual(existingBreadcrumb);
		expect(result.breadcrumbs[1]).toEqual(newBreadcrumb);
	});

	it("updates hasMoreRows flag", () => {
		const state = {
			...initialAppState,
			loading: false,
			selectedTable: {
				name: "users",
				schema: "public",
				type: "table" as const,
			},
		};

		const result = appReducer(state, {
			type: ActionType.SetHasMoreRows,
			hasMore: true,
		});

		expect(result.hasMoreRows).toBe(true);
	});

	it("sets show command hints", () => {
		const result = appReducer(initialAppState, {
			type: ActionType.SetShowCommandHints,
			show: true,
		});

		expect(result.showCommandHints).toBe(true);
	});

	it("enters sort picker mode", () => {
		const result = appReducer(initialAppState, {
			type: ActionType.EnterSortPickerMode,
		});

		expect(result.sortPickerMode).toBe(true);
		expect(result.sortPickerColumnIndex).toBe(0);
	});

	it("exits sort picker mode", () => {
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

	it("sets sort picker column index", () => {
		const result = appReducer(initialAppState, {
			type: ActionType.SetSortPickerColumn,
			columnIndex: 3,
		});

		expect(result.sortPickerColumnIndex).toBe(3);
	});

	it("updates data row value with explicit row index", () => {
		const state = {
			...initialAppState,
			dataRows: [
				{ id: 1, name: "Alice", age: 30 },
				{ id: 2, name: "Bob", age: 25 },
			],
			selectedRowIndex: 1,
		};

		const result = appReducer(state, {
			type: ActionType.UpdateDataRowValue,
			columnName: "name",
			value: "Charlie",
			rowIndex: 0,
			table: { name: "users", schema: "public", type: "table" },
		});

		expect(result.dataRows[0].name).toBe("Charlie");
		expect(result.dataRows[1].name).toBe("Bob"); // unchanged
	});

	it("updates data row value using selected row index", () => {
		const state = {
			...initialAppState,
			dataRows: [
				{ id: 1, name: "Alice", age: 30 },
				{ id: 2, name: "Bob", age: 25 },
			],
			selectedRowIndex: 1,
		};

		const result = appReducer(state, {
			type: ActionType.UpdateDataRowValue,
			columnName: "age",
			value: 26,
			rowIndex: null,
			table: { name: "users", schema: "public", type: "table" },
		});

		expect(result.dataRows[1].age).toBe(26);
		expect(result.dataRows[0].age).toBe(30); // unchanged
	});

	it("updates expanded row value", () => {
		const state = {
			...initialAppState,
			expandedRow: { id: 1, name: "Alice", age: 30 },
			selectedRowIndex: 0,
		};

		const result = appReducer(state, {
			type: ActionType.UpdateDataRowValue,
			columnName: "name",
			value: "Alice Updated",
			rowIndex: 0,
			table: { name: "users", schema: "public", type: "table" },
		});

		expect(result.expandedRow?.name).toBe("Alice Updated");
	});

	it("handles update data row value when row index is out of bounds", () => {
		const state = {
			...initialAppState,
			dataRows: [{ id: 1, name: "Alice" }],
			selectedRowIndex: 5, // out of bounds
		};

		const result = appReducer(state, {
			type: ActionType.UpdateDataRowValue,
			columnName: "name",
			value: "Bob",
			rowIndex: null,
			table: { name: "users", schema: "public", type: "table" },
		});

		// Should not crash, data should remain unchanged
		expect(result.dataRows[0].name).toBe("Alice");
	});
});
