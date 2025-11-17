export enum ViewState {
	DBType = "DB_TYPE",
	Connection = "CONNECTION",
	SavedConnections = "SAVED_CONNECTIONS",
	Tables = "TABLES",
	Columns = "COLUMNS",
	DataPreview = "DATA_PREVIEW",
	Query = "QUERY",
	QueryHistory = "QUERY_HISTORY",
	RowDetail = "ROW_DETAIL",
	Relationships = "RELATIONSHIPS",
	Indexes = "INDEXES",
	Search = "SEARCH",
	Context = "CONTEXT",
}

export enum DBType {
	PostgreSQL = "postgresql",
	MySQL = "mysql",
	SQLite = "sqlite",
}

export interface ConnectionInfo {
	id: string;
	name: string;
	type: DBType;
	connectionString: string;
	createdAt: string;
	updatedAt: string;
}

export interface QueryHistoryItem {
	id: string;
	connectionId: string;
	query: string;
	executedAt: string;
	durationMs: number;
	rowCount: number;
	error?: string;
}

export interface TableInfo {
	schema?: string;
	name: string;
	type: "table" | "view" | "materialized-view";
}

export interface ColumnInfo {
	name: string;
	dataType: string;
	nullable: boolean;
	defaultValue?: string | null;
	isPrimaryKey?: boolean;
	isForeignKey?: boolean;
	foreignTable?: string;
	foreignColumn?: string;
}

export type DataRow = Record<string, unknown>;

export type NotificationLevel = "info" | "warning" | "error";

export type SortDirection = "asc" | "desc" | "off";

export interface SortConfig {
	column: string | null;
	direction: SortDirection;
}

export type ColumnVisibilityMode = "smart" | "all" | "minimal";

export interface Notification {
	id: string;
	message: string;
	level: NotificationLevel;
	createdAt: number;
}

export interface ViewHistoryEntry {
	id: string;
	view: ViewState;
	timestamp: number;
	summary: string;
	data?: {
		dbType?: DBType;
		tableName?: string;
		connectionName?: string;
		query?: string;
		[key: string]: unknown;
	};
}

export interface BreadcrumbSegment {
	label: string;
	view: ViewState;
}

export interface AppState {
	currentView: ViewState;
	dbType: DBType | null;
	activeConnection: ConnectionInfo | null;
	savedConnections: ConnectionInfo[];
	tables: TableInfo[];
	columns: ColumnInfo[];
	selectedTable: TableInfo | null;
	dataRows: DataRow[];
	hasMoreRows: boolean;
	currentOffset: number;
	selectedRowIndex: number | null;
	expandedRow: DataRow | null;
	columnVisibilityMode: ColumnVisibilityMode;
	refreshingTableKey: string | null;
	refreshTimestamps: Record<string, number>;
	notifications: Notification[];
	queryHistory: QueryHistoryItem[];
	loading: boolean;
	errorMessage: string | null;
	infoMessage: string | null;
	showCommandHints: boolean;
	sortConfig: SortConfig;
	sortPickerMode: boolean;
	sortPickerColumnIndex: number;
	filterValue: string;
	searchTerm: string;
	searchResults: DataRow[];
	searchTotalCount: number;
	searchOffset: number;
	searchHasMore: boolean;
	searchSelectedIndex: number | null;
	viewHistory: ViewHistoryEntry[];
	breadcrumbs: BreadcrumbSegment[];
}

export const initialAppState: AppState = {
	currentView: ViewState.DBType,
	dbType: null,
	activeConnection: null,
	savedConnections: [],
	tables: [],
	columns: [],
	selectedTable: null,
	dataRows: [],
	hasMoreRows: false,
	currentOffset: 0,
	selectedRowIndex: null,
	expandedRow: null,
	columnVisibilityMode: "smart",
	refreshingTableKey: null,
	refreshTimestamps: {},
	notifications: [],
	queryHistory: [],
	loading: false,
	errorMessage: null,
	infoMessage: null,
	showCommandHints: false,
	sortConfig: { column: null, direction: "off" },
	sortPickerMode: false,
	sortPickerColumnIndex: 0,
	filterValue: "",
	searchTerm: "",
	searchResults: [],
	searchTotalCount: 0,
	searchOffset: 0,
	searchHasMore: false,
	searchSelectedIndex: null,
	viewHistory: [],
	breadcrumbs: [],
};
