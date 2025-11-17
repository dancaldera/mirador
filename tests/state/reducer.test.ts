import { describe, expect, it } from "bun:test";
import { ActionType } from "../../src/state/actions.js";
import { appReducer } from "../../src/state/reducer.js";
import { DBType, initialAppState, ViewState } from "../../src/types/state.js";

describe("appReducer", () => {
	it("switches view and clears messages", () => {
		const state = {
			...initialAppState,
			errorMessage: "fail",
			infoMessage: "info",
		};

		const result = appReducer(state, {
			type: ActionType.SetView,
			view: ViewState.Tables,
		});
		expect(result.currentView).toBe(ViewState.Tables);
		expect(result.errorMessage).toBeNull();
		expect(result.infoMessage).toBeNull();
	});

	it("sets db type and moves to connection view", () => {
		const result = appReducer(initialAppState, {
			type: ActionType.SelectDBType,
			dbType: DBType.PostgreSQL,
		});
		expect(result.dbType).toBe(DBType.PostgreSQL);
		expect(result.currentView).toBe(ViewState.Connection);
	});

	it("adds query history items to the front", () => {
		const historyItem = {
			id: "1",
			connectionId: "c1",
			query: "SELECT 1",
			executedAt: new Date().toISOString(),
			durationMs: 10,
			rowCount: 1,
		};

		const result = appReducer(initialAppState, {
			type: ActionType.AddQueryHistoryItem,
			item: historyItem,
		});
		expect(result.queryHistory[0]).toEqual(historyItem);
	});

	it("sets selected table and clears prior preview data", () => {
		const table = { name: "users", schema: "public", type: "table" as const };
		const state = {
			...initialAppState,
			columns: [{ name: "id", dataType: "int", nullable: false }],
			dataRows: [{ id: 1 }],
			hasMoreRows: true,
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
	});

	it("updates current offset via action", () => {
		const state = {
			...initialAppState,
			currentOffset: 0,
		};

		const result = appReducer(state, {
			type: ActionType.SetCurrentOffset,
			offset: 100,
		});
		expect(result.currentOffset).toBe(100);
	});

	it("restores cached table preview when reselecting", () => {
		const table = { name: "users", schema: "public", type: "table" as const };
		const cacheKey = "public|users";
		const state = {
			...initialAppState,
				[cacheKey]: {
					columns: [
						{
							name: "id",
							dataType: "int",
							nullable: false,
							isPrimaryKey: true,
						},
					],
					rows: [{ id: 1, name: "Alice" }],
					hasMore: true,
					offset: 50,
				},
			},
		};

		const result = appReducer(state, {
			type: ActionType.SetSelectedTable,
			table,
		});
		expect(result.hasMoreRows).toBe(true);
		expect(result.currentOffset).toBe(50);
	});

	it("removes cache entry when requested", () => {
		const cacheKey = "public|users";
		const state = {
			...initialAppState,
				[cacheKey]: {
					columns: [],
					rows: [{ id: 1 }],
					hasMore: false,
					offset: 0,
				},
			},
			selectedTable: { name: "users", schema: "public", type: "table" },
		};

		const result = appReducer(state, {
			type: ActionType.RemoveTableCacheEntry,
			key: cacheKey,
		});
		expect(result.dataRows).toEqual([]);
		expect(result.columns).toEqual([]);
		expect(result.currentOffset).toBe(0);
		expect(result.refreshingTableKey).toBe(cacheKey);
	});
});
