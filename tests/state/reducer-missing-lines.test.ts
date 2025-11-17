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
			queryHistory: null,
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
			history: null,
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

	it("clears refreshingTableKey after cache update", () => {
		const state = {
			...initialAppState,
			loading: false,
			refreshingTableKey: "public|users",
			selectedTable: { name: "users", schema: "public", type: "table" },
				"public|users": {
					columns: [],
					rows: [],
					hasMore: false,
					offset: 0,
				},
			},
		};

		const result = appReducer(state, {
			type: ActionType.SetHasMoreRows,
			hasMore: true,
		});

		expect(result.refreshingTableKey).toBeNull();
	});
});
