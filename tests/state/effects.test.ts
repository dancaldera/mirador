import type { Mock } from "bun:test";
import { vi } from "bun:test";

vi.mock("../../src/database/connection.js", () => ({
	createDatabaseConnection: vi.fn(),
}));

vi.mock("../../src/utils/persistence.js", () => ({
	loadConnections: vi.fn(async () => ({
		connections: [],
		normalized: 0,
		skipped: 0,
	})),
	loadQueryHistory: vi.fn(async () => []),
	saveConnections: vi.fn(async () => {}),
	saveQueryHistory: vi.fn(async () => {}),
}));

import { beforeEach, describe, expect, it } from "bun:test";
import { ConnectionError } from "../../src/database/errors.js";
import * as effects from "../../src/state/effects.js";

const {
	connectToDatabase,
	fetchColumns,
	fetchTableData,
	fetchTables,
	removeSavedConnection,
	updateSavedConnection,
	updateTableFieldValue,
	__internal,
} = effects;

const {
	buildColumnQuery,
	mapColumnRow,
	buildTableDataQuery,
	buildTableReference,
	extractCount,
	buildSearchWhereClause,
	selectSearchOrderColumn,
	interpretEditedInput,
	valuesAreEqual,
} = __internal;

import { createDatabaseConnection } from "../../src/database/connection.js";
import { ActionType } from "../../src/state/actions.js";
import {
	type ColumnInfo,
	DBType,
	initialAppState,
	type TableInfo,
	ViewState,
} from "../../src/types/state.js";
import * as persistence from "../../src/utils/persistence.js";

const createDatabaseConnectionMock = createDatabaseConnection as Mock<
	typeof createDatabaseConnection
>;
const loadConnectionsMock = persistence.loadConnections as Mock<
	typeof persistence.loadConnections
>;
const loadQueryHistoryMock = persistence.loadQueryHistory as Mock<
	typeof persistence.loadQueryHistory
>;
const saveConnectionsMock = persistence.saveConnections as Mock<
	typeof persistence.saveConnections
>;
const saveQueryHistoryMock = persistence.saveQueryHistory as Mock<
	typeof persistence.saveQueryHistory
>;

type Dispatch = (action: any) => void;

describe("effects", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		createDatabaseConnectionMock.mockReset();
	});

	it("connectToDatabase establishes connection, persists it, and loads tables", async () => {
		const dispatch = vi.fn() as Dispatch;
		const baseState = {
			...initialAppState,
			dbType: DBType.PostgreSQL,
			savedConnections: [],
		};

		const connectionStub = {
			connect: vi.fn(async () => {}),
			close: vi.fn(async () => {}),
		};

		const tablesConnectionStub = {
			connect: vi.fn(async () => {}),
			query: vi.fn(async () => ({
				rows: [
					{
						table_schema: "public",
						table_name: "users",
						table_type: "BASE TABLE",
					},
				],
				rowCount: 1,
			})),
			close: vi.fn(async () => {}),
		};

		createDatabaseConnectionMock
			.mockImplementationOnce(() => connectionStub as any)
			.mockImplementationOnce(() => tablesConnectionStub as any);

		await connectToDatabase(dispatch, baseState, {
			type: DBType.PostgreSQL,
			connectionString: "postgres://user:pass@localhost:5432/db",
		});

		expect(connectionStub.connect).toHaveBeenCalled();
		expect(connectionStub.close).toHaveBeenCalled();
		expect(tablesConnectionStub.query).toHaveBeenCalled();
		expect(persistence.saveConnections).toHaveBeenCalledTimes(1);
		expect(persistence.loadTableCache).toHaveBeenCalledTimes(1);

		const actions = dispatch.mock.calls.map((call) => call[0]);
		expect(actions).toEqual(
			expect.arrayContaining([
				{ type: ActionType.StartLoading },
				expect.objectContaining({ type: ActionType.SetActiveConnection }),
				{ type: ActionType.SetView, view: ViewState.Tables },
				expect.objectContaining({ type: ActionType.SetTables }),
				{ type: ActionType.StopLoading },
			]),
		);
	});

	it("initializeApp normalizes legacy connections and rewrites file", async () => {
		const dispatch = vi.fn() as Dispatch;
		const legacyConnection = {
			id: "abc",
			name: "Prod",
			type: DBType.PostgreSQL,
			connectionString: "postgres://prod",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

		loadConnectionsMock.mockResolvedValueOnce({
			connections: [legacyConnection],
			normalized: 1,
			skipped: 0,
		});
		loadQueryHistoryMock.mockResolvedValueOnce([]);

		await effects.initializeApp(dispatch);

		expect(persistence.saveConnections).toHaveBeenCalledWith([
			legacyConnection,
		]);
		const actions = dispatch.mock.calls.map((call) => call[0]);
		expect(actions).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ type: ActionType.SetSavedConnections }),
				expect.objectContaining({
					type: ActionType.AddNotification,
					notification: expect.objectContaining({
						message: expect.stringContaining("Normalized"),
					}),
				}),
			]),
		);
	});

	it("fetchTables maps sqlite metadata to table info", async () => {
		const dispatch = vi.fn() as Dispatch;
		const sqliteConnectionStub = {
			connect: vi.fn(async () => {}),
			query: vi.fn(async () => ({
				rows: [
					{ table_schema: null, table_name: "people", table_type: "table" },
					{ table_schema: null, table_name: "view_people", table_type: "view" },
				],
				rowCount: 2,
			})),
			close: vi.fn(async () => {}),
		};

		createDatabaseConnectionMock.mockReturnValueOnce(
			sqliteConnectionStub as any,
		);

		await fetchTables(dispatch, {
			type: DBType.SQLite,
			connectionString: "/tmp/example.sqlite",
		});

		expect(sqliteConnectionStub.query).toHaveBeenCalled();
		const actions = dispatch.mock.calls.map((call) => call[0]);
		const setTablesAction = actions.find(
			(action) => action.type === ActionType.SetTables,
		);
		expect(setTablesAction).toBeDefined();
		expect(setTablesAction.tables).toEqual([
			{ schema: undefined, name: "people", type: "table" },
			{ schema: undefined, name: "view_people", type: "view" },
		]);
	});

	it("fetchColumns maps postgres columns", async () => {
		const dispatch = vi.fn() as Dispatch;
		const columnsConnectionStub = {
			connect: vi.fn(async () => {}),
			query: vi.fn(async () => ({
				rows: [
					{
						column_name: "id",
						data_type: "integer",
						is_nullable: "NO",
						column_default: "nextval",
						is_primary_key: true,
					},
				],
				rowCount: 1,
			})),
			close: vi.fn(async () => {}),
		};

		createDatabaseConnectionMock.mockReturnValueOnce(
			columnsConnectionStub as any,
		);

		const state = {
			...initialAppState,
			activeConnection: {
				id: "conn1",
				name: "Test",
				type: DBType.PostgreSQL,
				connectionString: "postgres://example",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			tableCache: {},
		};

		await fetchColumns(
			dispatch,
			state,
			{
				type: DBType.PostgreSQL,
				connectionString: "postgres://example",
			},
			{
				name: "users",
				schema: "public",
				type: "table",
			},
		);

		const actions = dispatch.mock.calls.map((call) => call[0]);
		const setColumnsAction = actions.find(
			(action) => action.type === ActionType.SetColumns,
		);
		expect(setColumnsAction).toBeDefined();
		expect(setColumnsAction.columns[0]).toEqual(
			expect.objectContaining({
				name: "id",
				dataType: "integer",
				nullable: false,
				isPrimaryKey: true,
			}),
		);
		expect(actions).toEqual(
			expect.arrayContaining([
				{ type: ActionType.SetRefreshingTable, key: "public|users" },
				expect.objectContaining({
					type: ActionType.SetRefreshTimestamp,
					key: "public|users",
				}),
			]),
		);
		expect(persistence.saveTableCache).toHaveBeenCalledWith(
			"conn1",
			expect.any(Object),
		);
	});

	it("fetchTableData appends rows and tracks pagination state", async () => {
		const dispatch = vi.fn() as Dispatch;
		const rowsConnectionStub = {
			connect: vi.fn(async () => {}),
			query: vi.fn(async () => ({
				rows: [
					{ id: 1, name: "Alice" },
					{ id: 2, name: "Bob" },
				],
				rowCount: 2,
			})),
			close: vi.fn(async () => {}),
		};

		createDatabaseConnectionMock.mockReturnValueOnce(rowsConnectionStub as any);

		const state = {
			...initialAppState,
			activeConnection: {
				id: "conn1",
				name: "Test",
				type: DBType.MySQL,
				connectionString: "mysql://example",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			tableCache: {},
			columns: [],
		};

		await fetchTableData(
			dispatch,
			state,
			{
				type: DBType.MySQL,
				connectionString: "mysql://example",
			},
			{
				name: "users",
				schema: "public",
				type: "table",
			},
			{
				offset: 0,
				limit: 2,
				append: false,
			},
		);

		const actions = dispatch.mock.calls.map((call) => call[0]);
		const setRows = actions.find(
			(action) => action.type === ActionType.SetDataRows,
		);
		const hasMore = actions.find(
			(action) => action.type === ActionType.SetHasMoreRows,
		);
		const setOffset = actions.find(
			(action) => action.type === ActionType.SetCurrentOffset,
		);
		expect(setRows).toBeDefined();
		expect(setRows.rows).toHaveLength(2);
		expect(hasMore).toEqual({ type: ActionType.SetHasMoreRows, hasMore: true });
		expect(setOffset).toEqual({ type: ActionType.SetCurrentOffset, offset: 0 });
		expect(actions).toEqual(
			expect.arrayContaining([
				{ type: ActionType.SetRefreshingTable, key: "public|users" },
				expect.objectContaining({
					type: ActionType.SetRefreshTimestamp,
					key: "public|users",
				}),
			]),
		);
		expect(persistence.saveTableCache).toHaveBeenCalledWith(
			"conn1",
			expect.any(Object),
		);
	});

	it("fetchTableData sets non-zero offset when provided", async () => {
		const dispatch = vi.fn() as Dispatch;
		const rowsConnectionStub = {
			connect: vi.fn(async () => {}),
			query: vi.fn(async () => ({
				rows: [{ id: 3 }, { id: 4 }],
				rowCount: 2,
			})),
			close: vi.fn(async () => {}),
		};

		createDatabaseConnectionMock.mockReturnValueOnce(rowsConnectionStub as any);

		const state = {
			...initialAppState,
			activeConnection: {
				id: "conn2",
				name: "Test",
				type: DBType.PostgreSQL,
				connectionString: "postgres://example",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			tableCache: {},
			columns: [],
		};

		await fetchTableData(
			dispatch,
			state,
			{
				type: DBType.PostgreSQL,
				connectionString: "postgres://example",
			},
			{
				name: "orders",
				schema: "public",
				type: "table",
			},
			{
				offset: 50,
				limit: 50,
			},
		);

		const actions = dispatch.mock.calls.map((call) => call[0]);
		const setOffset = actions.find(
			(action) => action.type === ActionType.SetCurrentOffset,
		);
		expect(setOffset).toEqual({
			type: ActionType.SetCurrentOffset,
			offset: 50,
		});
		expect(actions).toEqual(
			expect.arrayContaining([
				{ type: ActionType.SetRefreshingTable, key: "public|orders" },
				expect.objectContaining({
					type: ActionType.SetRefreshTimestamp,
					key: "public|orders",
				}),
			]),
		);
		expect(persistence.saveTableCache).toHaveBeenCalledWith(
			"conn2",
			expect.any(Object),
		);
	});

	it("clearTableCacheEntry removes cache and refreshes data", async () => {
		const dispatch = vi.fn() as Dispatch;
		const columnConnectionStub = {
			connect: vi.fn(async () => {}),
			query: vi.fn(async () => ({
				rows: [
					{
						column_name: "id",
						data_type: "integer",
						is_nullable: "NO",
						column_default: null,
						is_primary_key: true,
					},
				],
				rowCount: 1,
			})),
			close: vi.fn(async () => {}),
		};

		const dataConnectionStub = {
			connect: vi.fn(async () => {}),
			query: vi.fn(async () => ({
				rows: [{ id: 1 }],
				rowCount: 1,
			})),
			close: vi.fn(async () => {}),
		};

		createDatabaseConnectionMock
			.mockImplementationOnce(() => columnConnectionStub as any)
			.mockImplementationOnce(() => dataConnectionStub as any);

		const state = {
			...initialAppState,
			activeConnection: {
				id: "conn3",
				name: "Test",
				type: DBType.PostgreSQL,
				connectionString: "postgres://example",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			tableCache: {
				"public|users": {
					columns: [],
					rows: [{ id: 2 }],
					hasMore: false,
					offset: 0,
				},
			},
		};

		await clearTableCacheEntry(
			dispatch,
			state,
			{
				type: DBType.PostgreSQL,
				connectionString: "postgres://example",
			},
			{
				name: "users",
				schema: "public",
				type: "table",
			},
		);

		const actions = dispatch.mock.calls.map((call) => call[0]);
		expect(actions).toContainEqual({
			type: ActionType.RemoveTableCacheEntry,
			key: "public|users",
		});
		expect(persistence.saveTableCache).toHaveBeenCalledWith("conn3", {});
		expect(
			actions.some((action) => action.type === ActionType.SetColumns),
		).toBe(true);
		expect(
			actions.some((action) => action.type === ActionType.SetDataRows),
		).toBe(true);
		expect(
			actions.some((action) => action.type === ActionType.AddNotification),
		).toBe(true);
	});

	it("clearConnectionCache clears cache and sets info message", async () => {
		const dispatch = vi.fn() as Dispatch;
		const state = {
			...initialAppState,
			activeConnection: {
				id: "conn4",
				name: "Test",
				type: DBType.SQLite,
				connectionString: "/tmp/db.sqlite",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			tableCache: {
				"default|users": {
					columns: [],
					rows: [],
					hasMore: false,
					offset: 0,
				},
			},
		};

		await clearConnectionCache(dispatch, state);

		expect(persistence.saveTableCache).toHaveBeenCalledWith("conn4", {});
		const actions = dispatch.mock.calls.map((call) => call[0]);
		expect(actions).toEqual(
			expect.arrayContaining([
				{ type: ActionType.SetTableCache, cache: {} },
				{ type: ActionType.SetRefreshingTable, key: null },
			]),
		);
		expect(
			actions.some((action) => action.type === ActionType.AddNotification),
		).toBe(true);
	});

	it("throttles repeated table data refreshes", async () => {
		const dispatch = vi.fn() as Dispatch;
		createDatabaseConnectionMock.mockClear();

		const state = {
			...initialAppState,
			activeConnection: {
				id: "conn5",
				name: "Test",
				type: DBType.PostgreSQL,
				connectionString: "postgres://example",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			refreshTimestamps: {
				"public|users": Date.now(),
			},
		};

		await fetchTableData(
			dispatch,
			state,
			{
				type: DBType.PostgreSQL,
				connectionString: "postgres://example",
			},
			{
				name: "users",
				schema: "public",
				type: "table",
			},
		);

		expect(createDatabaseConnection).not.toHaveBeenCalled();
		const actions = dispatch.mock.calls.map((call) => call[0]);
		expect(actions).not.toContainEqual(
			expect.objectContaining({ type: ActionType.SetDataRows }),
		);
		expect(actions).toContainEqual(
			expect.objectContaining({ type: ActionType.AddNotification }),
		);
	});

	it("removeSavedConnection updates state and persists", async () => {
		const dispatch = vi.fn() as Dispatch;
		const state = {
			...initialAppState,
			savedConnections: [
				{
					id: "abc",
					name: "Test",
					type: DBType.PostgreSQL,
					connectionString: "postgres://example",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
			],
			activeConnection: {
				id: "abc",
				name: "Test",
				type: DBType.PostgreSQL,
				connectionString: "postgres://example",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
		};

		await removeSavedConnection(dispatch, state, "abc");

		expect(persistence.saveConnections).toHaveBeenCalledWith([]);
		const actions = dispatch.mock.calls.map((call) => call[0]);
		expect(actions).toEqual(
			expect.arrayContaining([
				{ type: ActionType.RemoveSavedConnection, connectionId: "abc" },
				{ type: ActionType.ClearActiveConnection },
			]),
		);
		expect(
			actions.some((action) => action.type === ActionType.AddNotification),
		).toBe(true);
	});

	it("updateSavedConnection persists renamed connection", async () => {
		const dispatch = vi.fn() as Dispatch;
		const connection = {
			id: "abc",
			name: "Old Name",
			type: DBType.PostgreSQL,
			connectionString: "postgres://example",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

		const state = {
			...initialAppState,
			savedConnections: [connection],
			activeConnection: connection,
		};

		await effects.updateSavedConnection(dispatch, state, "abc", {
			name: "New Name",
		});

		const actions = dispatch.mock.calls.map((call) => call[0]);
		expect(actions).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: ActionType.UpdateSavedConnection,
					connection: expect.objectContaining({ name: "New Name" }),
				}),
				expect.objectContaining({
					type: ActionType.SetActiveConnection,
					connection: expect.objectContaining({ name: "New Name" }),
				}),
				expect.objectContaining({ type: ActionType.AddNotification }),
			]),
		);
		expect(persistence.saveConnections).toHaveBeenCalledWith(
			expect.arrayContaining([expect.objectContaining({ name: "New Name" })]),
		);
	});

	it("updateSavedConnection prevents duplicate names", async () => {
		const dispatch = vi.fn() as Dispatch;
		const state = {
			...initialAppState,
			savedConnections: [
				{
					id: "abc",
					name: "Prod",
					type: DBType.PostgreSQL,
					connectionString: "postgres://prod",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
				{
					id: "def",
					name: "Staging",
					type: DBType.PostgreSQL,
					connectionString: "postgres://staging",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
			],
		};

		await effects.updateSavedConnection(dispatch, state, "def", {
			name: "Prod",
		});

		expect(persistence.saveConnections).not.toHaveBeenCalled();
		const actions = dispatch.mock.calls.map((call) => call[0]);
		expect(actions).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ type: ActionType.AddNotification }),
			]),
		);
	});

	it("updateSavedConnection requires non-empty connection string", async () => {
		const dispatch = vi.fn() as Dispatch;
		const state = {
			...initialAppState,
			savedConnections: [
				{
					id: "abc",
					name: "Prod",
					type: DBType.PostgreSQL,
					connectionString: "postgres://prod",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
			],
		};

		await effects.updateSavedConnection(dispatch, state, "abc", {
			connectionString: "   ",
		});

		expect(persistence.saveConnections).not.toHaveBeenCalled();
		const actions = dispatch.mock.calls.map((call) => call[0]);
		expect(actions).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ type: ActionType.AddNotification }),
			]),
		);
	});

	it("updateSavedConnection refreshes active connection when connection string changes", async () => {
		const dispatch = vi.fn() as Dispatch;
		const connection = {
			id: "abc",
			name: "Prod",
			type: DBType.PostgreSQL,
			connectionString: "postgres://prod",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

		const connectionStub = {
			connect: vi.fn(async () => {}),
			close: vi.fn(async () => {}),
		};

		const tableStub = {
			connect: vi.fn(async () => {}),
			query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
			close: vi.fn(async () => {}),
		};

		createDatabaseConnectionMock
			.mockImplementationOnce(() => connectionStub as any)
			.mockImplementationOnce(() => tableStub as any);

		const state = {
			...initialAppState,
			savedConnections: [connection],
			activeConnection: connection,
			dbType: DBType.PostgreSQL,
		};

		await effects.updateSavedConnection(dispatch, state, "abc", {
			connectionString: "postgres://new",
		});

		const actions = dispatch.mock.calls.map((call) => call[0]);
		expect(actions).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: ActionType.SetActiveConnection,
					connection: expect.objectContaining({
						connectionString: "postgres://new",
					}),
				}),
			]),
		);
		expect(actions).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: ActionType.AddNotification,
					notification: expect.objectContaining({
						message: "Connection details changed; reconnecting…",
					}),
				}),
			]),
		);
	});

	it("updateSavedConnection updates database type and reconnects active session", async () => {
		const dispatch = vi.fn() as Dispatch;
		const connection = {
			id: "abc",
			name: "Prod",
			type: DBType.PostgreSQL,
			connectionString: "postgres://prod",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

		const connectionStub = {
			connect: vi.fn(async () => {}),
			close: vi.fn(async () => {}),
		};

		const tableStub = {
			connect: vi.fn(async () => {}),
			query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
			close: vi.fn(async () => {}),
		};

		createDatabaseConnectionMock
			.mockImplementationOnce(() => connectionStub as any)
			.mockImplementationOnce(() => tableStub as any);

		const state = {
			...initialAppState,
			savedConnections: [connection],
			activeConnection: connection,
			dbType: DBType.PostgreSQL,
		};

		await effects.updateSavedConnection(dispatch, state, "abc", {
			type: DBType.MySQL,
		});

		const actions = dispatch.mock.calls.map((call) => call[0]);
		expect(actions).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: ActionType.SetActiveConnection,
					connection: expect.objectContaining({ type: DBType.MySQL }),
				}),
				expect.objectContaining({
					type: ActionType.AddNotification,
					notification: expect.objectContaining({
						message: "Connection details changed; reconnecting…",
					}),
				}),
			]),
		);
		expect(persistence.saveConnections).toHaveBeenCalled();
	});

	it("initializeApp notifies about skipped connections", async () => {
		const dispatch = vi.fn() as Dispatch;
		loadConnectionsMock.mockResolvedValueOnce({
			connections: [],
			normalized: 0,
			skipped: 2,
		});
		loadQueryHistoryMock.mockResolvedValueOnce([]);

		await effects.initializeApp(dispatch);

		expect(persistence.saveConnections).toHaveBeenCalledWith([]);
		expect(dispatch).toHaveBeenCalledWith(
			expect.objectContaining({
				type: ActionType.AddNotification,
				notification: expect.objectContaining({
					message: "Skipped 2 invalid connection entries.",
					level: "warning",
				}),
			}),
		);
	});

	it("initializeApp reports initialization errors", async () => {
		const dispatch = vi.fn() as Dispatch;
		loadConnectionsMock.mockRejectedValueOnce(new Error("boom"));
		loadQueryHistoryMock.mockResolvedValueOnce([]);

		await effects.initializeApp(dispatch);

		expect(dispatch).toHaveBeenCalledWith(
			expect.objectContaining({
				type: ActionType.SetError,
				error: "boom",
			}),
		);
	});

	it("connectToDatabase surfaces database connection errors", async () => {
		const dispatch = vi.fn() as Dispatch;
		const state = {
			...initialAppState,
			savedConnections: [],
		};
		const connectionStub = {
			connect: vi.fn(async () => {
				throw new ConnectionError("unreachable");
			}),
			close: vi.fn(async () => {}),
		};
		createDatabaseConnectionMock.mockReturnValueOnce(connectionStub as any);

		await connectToDatabase(dispatch, state, {
			type: DBType.PostgreSQL,
			connectionString: "postgres://fail",
		});

		expect(dispatch).toHaveBeenCalledWith(
			expect.objectContaining({
				type: ActionType.SetError,
				error: expect.any(ConnectionError),
			}),
		);
	});

	it("fetchTables dispatches error when query fails", async () => {
		const dispatch = vi.fn() as Dispatch;
		const failingConnection = {
			connect: vi.fn(async () => {}),
			query: vi.fn(async () => {
				throw new Error("tables failed");
			}),
			close: vi.fn(async () => {}),
		};
		createDatabaseConnectionMock.mockReturnValueOnce(failingConnection as any);

		await fetchTables(dispatch, {
			type: DBType.PostgreSQL,
			connectionString: "postgres://fail",
		});

		expect(dispatch).toHaveBeenCalledWith(
			expect.objectContaining({
				type: ActionType.SetError,
				error: "tables failed",
			}),
		);
		expect(failingConnection.close).toHaveBeenCalled();
	});

	it("fetchColumns throttles rapid refresh attempts", async () => {
		const dispatch = vi.fn() as Dispatch;
		const nowSpy = vi.spyOn(Date, "now").mockReturnValue(5_000);
		const state = {
			...initialAppState,
			refreshTimestamps: { "public|users": 5_000 },
		};

		await fetchColumns(
			dispatch,
			state,
			{ type: DBType.PostgreSQL, connectionString: "postgres://example" },
			{ name: "users", schema: "public", type: "table" },
		);

		expect(createDatabaseConnectionMock).not.toHaveBeenCalled();
		expect(dispatch).toHaveBeenCalledWith(
			expect.objectContaining({
				type: ActionType.AddNotification,
				notification: expect.objectContaining({
					message: "Please wait before refreshing this table again.",
				}),
			}),
		);
		nowSpy.mockRestore();
	});

	it("fetchColumns dispatches error on failure", async () => {
		const dispatch = vi.fn() as Dispatch;
		const failingConnection = {
			connect: vi.fn(async () => {}),
			query: vi.fn(async () => {
				throw new Error("columns failed");
			}),
			close: vi.fn(async () => {}),
		};
		createDatabaseConnectionMock.mockReturnValueOnce(failingConnection as any);

		const state = {
			...initialAppState,
			activeConnection: {
				id: "conn-error",
				name: "Err",
				type: DBType.PostgreSQL,
				connectionString: "postgres://err",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			tableCache: {},
		};

		await fetchColumns(
			dispatch,
			state,
			{ type: DBType.PostgreSQL, connectionString: "postgres://err" },
			{ name: "users", schema: "public", type: "table" },
		);

		expect(dispatch).toHaveBeenCalledWith(
			expect.objectContaining({
				type: ActionType.SetError,
				error: "columns failed",
			}),
		);
	});

	it("fetchTableData dispatches error on failure", async () => {
		const dispatch = vi.fn() as Dispatch;
		const failingConnection = {
			connect: vi.fn(async () => {}),
			query: vi.fn(async () => {
				throw new Error("rows failed");
			}),
			close: vi.fn(async () => {}),
		};
		createDatabaseConnectionMock.mockReturnValueOnce(failingConnection as any);

		const state = {
			...initialAppState,
			activeConnection: {
				id: "conn-error",
				name: "Err",
				type: DBType.PostgreSQL,
				connectionString: "postgres://err",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			tableCache: {},
		};

		await fetchTableData(
			dispatch,
			state,
			{ type: DBType.PostgreSQL, connectionString: "postgres://err" },
			{ name: "users", schema: "public", type: "table" },
			{ offset: 0, limit: 10 },
		);

		expect(dispatch).toHaveBeenCalledWith(
			expect.objectContaining({
				type: ActionType.SetError,
				error: "rows failed",
			}),
		);
	});

	it("searchTableRows requires column metadata", async () => {
		const dispatch = vi.fn() as Dispatch;
		const state = { ...initialAppState };

		await effects.searchTableRows(
			dispatch,
			state,
			{ type: DBType.PostgreSQL, connectionString: "postgres://example" },
			{ name: "users", schema: "public", type: "table" },
			[],
			{ term: "alice" },
		);

		expect(dispatch).toHaveBeenCalledWith(
			expect.objectContaining({
				type: ActionType.SetError,
				error: "Column metadata is required before searching.",
			}),
		);
		expect(createDatabaseConnectionMock).not.toHaveBeenCalled();
	});

	it("clearTableCacheEntry returns early when cache context missing", async () => {
		const dispatch = vi.fn() as Dispatch;
		const state = { ...initialAppState };

		await clearTableCacheEntry(
			dispatch,
			state,
			{ type: DBType.PostgreSQL, connectionString: "postgres://example" },
			{ name: "users", schema: "public", type: "table" },
		);

		expect(saveTableCacheMock).not.toHaveBeenCalled();
	});

	it("clearConnectionCache ignores requests without active connection", async () => {
		const dispatch = vi.fn() as Dispatch;
		const state = { ...initialAppState };

		await clearConnectionCache(dispatch, state);

		expect(saveTableCacheMock).not.toHaveBeenCalled();
	});

	it("clearConnectionCache reports persistence errors", async () => {
		const dispatch = vi.fn() as Dispatch;
		const state = {
			...initialAppState,
			activeConnection: {
				id: "conn",
				name: "Test",
				type: DBType.PostgreSQL,
				connectionString: "postgres://example",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
		};
		saveTableCacheMock.mockRejectedValueOnce(new Error("persist failed"));

		await clearConnectionCache(dispatch, state);

		expect(dispatch).toHaveBeenCalledWith(
			expect.objectContaining({
				type: ActionType.SetError,
				error: "persist failed",
			}),
		);
	});

	it("removeSavedConnection returns when nothing matches", async () => {
		const dispatch = vi.fn() as Dispatch;
		const state = {
			...initialAppState,
			savedConnections: [
				{
					id: "abc",
					name: "Prod",
					type: DBType.PostgreSQL,
					connectionString: "postgres://prod",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
			],
		};

		await removeSavedConnection(dispatch, state, "missing");

		expect(dispatch).not.toHaveBeenCalled();
	});

	it("updateSavedConnection returns when connection is missing", async () => {
		const dispatch = vi.fn() as Dispatch;
		const state = { ...initialAppState };

		await updateSavedConnection(dispatch, state, "missing", { name: "New" });

		expect(dispatch).not.toHaveBeenCalled();
	});

	it("updateSavedConnection rejects empty names", async () => {
		const dispatch = vi.fn() as Dispatch;
		const state = {
			...initialAppState,
			savedConnections: [
				{
					id: "abc",
					name: "Prod",
					type: DBType.PostgreSQL,
					connectionString: "postgres://prod",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
			],
		};

		await updateSavedConnection(dispatch, state, "abc", { name: "   " });

		expect(persistence.saveConnections).not.toHaveBeenCalled();
		expect(dispatch).toHaveBeenCalledWith(
			expect.objectContaining({
				type: ActionType.AddNotification,
				notification: expect.objectContaining({
					message: "Connection name cannot be empty.",
				}),
			}),
		);
	});

	it("updateSavedConnection rejects unsupported database types", async () => {
		const dispatch = vi.fn() as Dispatch;
		const state = {
			...initialAppState,
			savedConnections: [
				{
					id: "abc",
					name: "Prod",
					type: DBType.PostgreSQL,
					connectionString: "postgres://prod",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
			],
		};

		await updateSavedConnection(dispatch, state, "abc", {
			type: "oracle" as DBType,
		});

		expect(persistence.saveConnections).not.toHaveBeenCalled();
		expect(dispatch).toHaveBeenCalledWith(
			expect.objectContaining({
				type: ActionType.AddNotification,
				notification: expect.objectContaining({
					message: "Unsupported database type.",
				}),
			}),
		);
	});

	it("updateSavedConnection reports when nothing changed", async () => {
		const dispatch = vi.fn() as Dispatch;
		const connection = {
			id: "abc",
			name: "Prod",
			type: DBType.PostgreSQL,
			connectionString: "postgres://prod",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};
		const state = {
			...initialAppState,
			savedConnections: [connection],
		};

		await updateSavedConnection(dispatch, state, "abc", { name: "Prod" });

		expect(persistence.saveConnections).not.toHaveBeenCalled();
		expect(dispatch).toHaveBeenCalledWith(
			expect.objectContaining({
				type: ActionType.AddNotification,
				notification: expect.objectContaining({
					message: "No changes detected.",
				}),
			}),
		);
	});

	it("fetchColumns maps mysql metadata", async () => {
		const dispatch = vi.fn() as Dispatch;
		const mysqlConnection = {
			connect: vi.fn(async () => {}),
			query: vi.fn(async () => ({
				rows: [
					{
						column_name: "id",
						data_type: "int",
						is_nullable: "NO",
						column_default: "0",
						column_key: "PRI",
					},
				],
				rowCount: 1,
			})),
			close: vi.fn(async () => {}),
		};
		createDatabaseConnectionMock.mockReturnValueOnce(mysqlConnection as any);

		const state = {
			...initialAppState,
			activeConnection: {
				id: "conn",
				name: "MySQL",
				type: DBType.MySQL,
				connectionString: "mysql://example",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			tableCache: {},
		};

		await fetchColumns(
			dispatch,
			state,
			{ type: DBType.MySQL, connectionString: "mysql://example" },
			{ name: "users", schema: "public", type: "table" },
		);

		expect(dispatch).toHaveBeenCalledWith(
			expect.objectContaining({
				type: ActionType.SetColumns,
				columns: [
					expect.objectContaining({
						name: "id",
						dataType: "int",
						isPrimaryKey: true,
					}),
				],
			}),
		);
		expect(persistence.saveTableCache).toHaveBeenCalled();
	});

	it("fetchTableData uses mysql pagination syntax", async () => {
		const dispatch = vi.fn() as Dispatch;
		let capturedSql = "";
		const mysqlConnection = {
			connect: vi.fn(async () => {}),
			query: vi.fn(async (sql: string) => {
				capturedSql = sql;
				return { rows: [], rowCount: 0 };
			}),
			close: vi.fn(async () => {}),
		};
		createDatabaseConnectionMock.mockReturnValueOnce(mysqlConnection as any);

		const state = {
			...initialAppState,
			activeConnection: {
				id: "conn",
				name: "MySQL",
				type: DBType.MySQL,
				connectionString: "mysql://example",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			tableCache: {},
		};

		await fetchTableData(
			dispatch,
			state,
			{ type: DBType.MySQL, connectionString: "mysql://example" },
			{ name: "users", schema: "public", type: "table" },
			{ offset: 0, limit: 10 },
		);

		expect(capturedSql).toContain("LIMIT 0, 10");
	});

	it("searchTableRows parses string counts", async () => {
		const dispatch = vi.fn() as Dispatch;
		const queryMock = vi
			.fn()
			.mockResolvedValueOnce({ rows: [{ total_count: "5" }], rowCount: 1 })
			.mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 });
		const connection = {
			connect: vi.fn(async () => {}),
			query: queryMock,
			close: vi.fn(async () => {}),
		};
		createDatabaseConnectionMock.mockReturnValueOnce(connection as any);

		const state = { ...initialAppState };
		await effects.searchTableRows(
			dispatch,
			state,
			{ type: DBType.PostgreSQL, connectionString: "postgres://example" },
			{ name: "users", schema: "public", type: "table" },
			[
				{
					name: "id",
					dataType: "integer",
					nullable: false,
					isPrimaryKey: true,
				},
			],
			{ term: "a" },
		);

		expect(dispatch).toHaveBeenCalledWith(
			expect.objectContaining({
				type: ActionType.SetSearchResultsPage,
				totalCount: 5,
			}),
		);
	});

	it("extractCount handles bigint values", () => {
		expect(extractCount({ total_count: BigInt(7) })).toBe(7);
	});

	it("buildSearchWhereClause falls back to tautology without columns", () => {
		expect(buildSearchWhereClause(DBType.PostgreSQL, [])).toBe("1=1");
	});

	it("buildColumnQuery generates sqlite pragma statement", () => {
		const result = buildColumnQuery(DBType.SQLite, {
			name: "users",
			schema: undefined,
			type: "table",
		});
		expect(result).toEqual({ query: 'PRAGMA table_info("users");' });
	});

	it("buildColumnQuery generates postgres metadata query", () => {
		const result = buildColumnQuery(DBType.PostgreSQL, {
			name: "users",
			schema: "public",
			type: "table",
		});
		expect(result).toEqual(
			expect.objectContaining({
				params: ["users", "public"],
				query: expect.stringContaining("information_schema.columns"),
			}),
		);
	});

	it("mapColumnRow maps sqlite metadata", () => {
		const column = mapColumnRow(DBType.SQLite, {
			name: "id",
			type: "integer",
			notnull: 0,
			dflt_value: "0",
			pk: 1,
		});
		expect(column).toEqual(
			expect.objectContaining({
				name: "id",
				dataType: "integer",
				nullable: true,
				defaultValue: "0",
				isPrimaryKey: true,
			}),
		);
	});

	it("buildTableDataQuery formats sqlite pagination", () => {
		const sql = buildTableDataQuery(
			DBType.SQLite,
			{ name: "users", schema: undefined, type: "table" },
			5,
			10,
		);
		expect(sql).toBe('SELECT * FROM "users" LIMIT 5 OFFSET 10');
	});

	it("buildTableReference quotes schema-qualified tables", () => {
		const ref = buildTableReference(DBType.PostgreSQL, {
			name: "users",
			schema: "public",
			type: "table",
		});
		expect(ref).toBe('"public"."users"');
	});

	it("extractCount treats non-numeric strings as zero", () => {
		expect(extractCount({ total_count: "not-a-number" })).toBe(0);
	});

	it("extractCount returns zero for unsupported value types", () => {
		expect(extractCount({ total_count: { unexpected: true } })).toBe(0);
	});

	it("selectSearchOrderColumn returns null when no columns provided", () => {
		expect(selectSearchOrderColumn(DBType.PostgreSQL, [])).toBeNull();
	});

	describe("updateTableFieldValue", () => {
		const table: TableInfo = {
			schema: "public",
			name: "users",
			type: "table",
		};

		const primaryKeyColumn: ColumnInfo = {
			name: "id",
			dataType: "integer",
			nullable: false,
			isPrimaryKey: true,
		};

		const nameColumn: ColumnInfo = {
			name: "name",
			dataType: "text",
			nullable: true,
		};

		const activeConnection = {
			id: "conn-1",
			name: "Local",
			type: DBType.PostgreSQL,
			connectionString: "postgres://user:pass@localhost:5432/db",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

		const buildState = (
			columns: ColumnInfo[] = [primaryKeyColumn, nameColumn],
		) => ({
			...initialAppState,
			dbType: DBType.PostgreSQL,
			activeConnection,
			columns,
			selectedTable: table,
			selectedRowIndex: 0,
			dataRows: [
				{
					id: 1,
					name: "Alice",
				},
			],
		});

		it("updates column value and dispatches state changes", async () => {
			const dispatch = vi.fn() as Dispatch;
			const state = buildState();
			const row = state.dataRows[0];
			const connectionStub = {
				connect: vi.fn(async () => {}),
				execute: vi.fn(async () => {}),
				close: vi.fn(async () => {}),
			};
			createDatabaseConnectionMock.mockReturnValueOnce(connectionStub as any);

			const result = await updateTableFieldValue(
				dispatch,
				state,
				table,
				nameColumn,
				0,
				row,
				"Bob",
			);

			expect(result).toBe(true);
			expect(connectionStub.connect).toHaveBeenCalledTimes(1);
			expect(connectionStub.execute).toHaveBeenCalledWith(
				'UPDATE "public"."users" SET "name" = $1 WHERE "id" = $2',
				["Bob", 1],
			);
			expect(connectionStub.close).toHaveBeenCalledTimes(1);
			expect(dispatch).toHaveBeenCalledWith(
				expect.objectContaining({
					type: ActionType.UpdateDataRowValue,
					columnName: "name",
					value: "Bob",
				}),
			);
			expect(dispatch).toHaveBeenCalledWith({
				type: ActionType.SetInfo,
				message: "Updated name.",
			});
		});

		it("interprets NULL input as SQL null", async () => {
			const dispatch = vi.fn() as Dispatch;
			const state = buildState();
			const row = state.dataRows[0];
			const connectionStub = {
				connect: vi.fn(async () => {}),
				execute: vi.fn(async () => {}),
				close: vi.fn(async () => {}),
			};
			createDatabaseConnectionMock.mockReturnValueOnce(connectionStub as any);

			const result = await updateTableFieldValue(
				dispatch,
				state,
				table,
				nameColumn,
				0,
				row,
				" NULL \n",
			);

			expect(result).toBe(true);
			expect(connectionStub.execute).toHaveBeenCalledWith(
				'UPDATE "public"."users" SET "name" = $1 WHERE "id" = $2',
				[null, 1],
			);
			expect(dispatch).toHaveBeenCalledWith(
				expect.objectContaining({
					type: ActionType.UpdateDataRowValue,
					value: null,
				}),
			);
		});

		it("skips update when no primary key is present", async () => {
			const dispatch = vi.fn() as Dispatch;
			const state = buildState([{ ...nameColumn, isPrimaryKey: false }]);
			const row = state.dataRows[0];

			const result = await updateTableFieldValue(
				dispatch,
				state,
				table,
				nameColumn,
				0,
				row,
				"Bob",
			);

			expect(result).toBe(false);
			expect(createDatabaseConnectionMock).not.toHaveBeenCalled();
			expect(dispatch).toHaveBeenCalledWith({
				type: ActionType.SetError,
				error: "Editing requires a primary key to identify the row.",
			});
		});

		it("skips update when value is unchanged", async () => {
			const dispatch = vi.fn() as Dispatch;
			const state = buildState();
			const row = state.dataRows[0];

			const result = await updateTableFieldValue(
				dispatch,
				state,
				table,
				nameColumn,
				0,
				row,
				"Alice",
			);

			expect(result).toBe(false);
			expect(createDatabaseConnectionMock).not.toHaveBeenCalled();
			expect(dispatch).toHaveBeenCalledWith({
				type: ActionType.SetInfo,
				message: "No changes made to name.",
			});
		});

		it("propagates database errors", async () => {
			const dispatch = vi.fn() as Dispatch;
			const state = buildState();
			const row = state.dataRows[0];
			const connectionStub = {
				connect: vi.fn(async () => {}),
				execute: vi.fn(async () => {
					throw new Error("boom");
				}),
				close: vi.fn(async () => {}),
			};
			createDatabaseConnectionMock.mockReturnValueOnce(connectionStub as any);

			const result = await updateTableFieldValue(
				dispatch,
				state,
				table,
				nameColumn,
				0,
				row,
				"Bob",
			);

			expect(result).toBe(false);
			expect(dispatch).toHaveBeenCalledWith({
				type: ActionType.SetError,
				error: "boom",
			});
			expect(connectionStub.close).toHaveBeenCalledTimes(1);
		});

		it("rejects when active connection is missing", async () => {
			const dispatch = vi.fn() as Dispatch;
			const state = {
				...buildState(),
				activeConnection: null,
			};
			const row = state.dataRows[0];

			const result = await updateTableFieldValue(
				dispatch,
				state,
				table,
				nameColumn,
				0,
				row,
				"Bob",
			);

			expect(result).toBe(false);
			expect(createDatabaseConnectionMock).not.toHaveBeenCalled();
			expect(dispatch).toHaveBeenCalledWith({
				type: ActionType.SetError,
				error: "No active database connection.",
			});
		});

		it("rejects when table is null", async () => {
			const dispatch = vi.fn() as Dispatch;
			const state = buildState();
			const row = state.dataRows[0];

			const result = await updateTableFieldValue(
				dispatch,
				state,
				null,
				nameColumn,
				0,
				row,
				"Bob",
			);

			expect(result).toBe(false);
			expect(createDatabaseConnectionMock).not.toHaveBeenCalled();
			expect(dispatch).toHaveBeenCalledWith({
				type: ActionType.SetError,
				error: "No table selected for editing.",
			});
		});

		it("surfaces error when primary key value is missing", async () => {
			const dispatch = vi.fn() as Dispatch;
			const state = buildState();
			const row = { id: undefined, name: "Alice" } as any;
			const connectionStub = {
				connect: vi.fn(async () => {}),
				execute: vi.fn(async () => {}),
				close: vi.fn(async () => {}),
			};
			createDatabaseConnectionMock.mockReturnValueOnce(connectionStub as any);

			const result = await updateTableFieldValue(
				dispatch,
				state,
				table,
				nameColumn,
				0,
				row,
				"Bob",
			);

			expect(result).toBe(false);
			expect(dispatch).toHaveBeenCalledWith({
				type: ActionType.SetError,
				error: expect.stringContaining("Missing primary key value"),
			});
			expect(connectionStub.close).toHaveBeenCalledTimes(1);
		});
	});

	describe("interpretEditedInput", () => {
		const column: ColumnInfo = {
			name: "content",
			dataType: "text",
			nullable: true,
		};

		it("returns null for NULL literal", () => {
			expect(interpretEditedInput("NULL", column)).toBeNull();
			expect(interpretEditedInput(" null ", column)).toBeNull();
		});

		it("returns raw string for non-null input", () => {
			expect(interpretEditedInput("hello", column)).toBe("hello");
		});
	});

	describe("valuesAreEqual", () => {
		it("treats identical primitives as equal", () => {
			expect(valuesAreEqual("a", "a")).toBe(true);
			expect(valuesAreEqual(1, 1)).toBe(true);
		});

		it("treats nullish pairs as equal", () => {
			expect(valuesAreEqual(null, undefined)).toBe(true);
		});

		it("performs deep equality for objects", () => {
			expect(valuesAreEqual({ a: 1 }, { a: 1 })).toBe(true);
			expect(valuesAreEqual({ a: 1 }, { a: 2 })).toBe(false);
		});

		it("returns false for distinct primitives", () => {
			expect(valuesAreEqual("a", "b")).toBe(false);
		});

		it("handles circular structures by returning false", () => {
			const circularA: any = {};
			circularA.self = circularA;
			const circularB: any = {};
			circularB.self = circularB;
			expect(valuesAreEqual(circularA, circularB)).toBe(false);
		});
	});
});
