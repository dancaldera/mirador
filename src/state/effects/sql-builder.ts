import type { QueryRow } from "../../database/types.js";
import type { ColumnInfo, TableInfo } from "../../types/state.js";
import { DBType } from "../../types/state.js";

/**
 * SQL query building utilities
 */

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

export const sqlBuilder = {
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
