import { createDatabaseConnection } from "./database/connection.js";
import type { DBType } from "./types/state.js";

export interface DatabaseConfig {
	type: DBType;
	connectionString?: string;
	host?: string;
	port?: number;
	database?: string;
	user?: string;
	password?: string;
}

export interface QueryResult {
	rows: any[];
	rowCount: number;
	columns?: string[];
	duration: number;
}

export interface SchemaInfo {
	tables: Array<{
		name: string;
		schema?: string;
		type: "table" | "view" | "materialized-view";
	}>;
	columns: Record<
		string,
		Array<{
			name: string;
			dataType: string;
			nullable: boolean;
			isPrimaryKey?: boolean;
			isForeignKey?: boolean;
			defaultValue?: string;
		}>
	>;
}

/**
 * Programmatic interface for database operations
 * Designed for AI agents and automation scripts
 */
export class SeerDBAgent {
	private connection: any = null;
	private config: DatabaseConfig | null = null;

	/**
	 * Connect to a database
	 */
	async connect(config: DatabaseConfig): Promise<void> {
		try {
			let connectionString = config.connectionString;

			// Build connection string from individual parameters
			if (!connectionString) {
				switch (config.type) {
					case "postgresql":
						connectionString = `postgresql://${config.user}:${config.password}@${config.host}:${config.port || 5432}/${config.database}`;
						break;
					case "mysql":
						connectionString = `mysql://${config.user}:${config.password}@${config.host}:${config.port || 3306}/${config.database}`;
						break;
					case "sqlite":
						connectionString = config.host || config.database || "";
						break;
					default:
						throw new Error(`Unsupported database type: ${config.type}`);
				}
			}

			this.connection = createDatabaseConnection({
				type: config.type,
				connectionString: connectionString,
			});
			await this.connection.connect();
			this.config = config;
		} catch (error) {
			throw new Error(
				`Failed to connect to database: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	/**
	 * Disconnect from the database
	 */
	async disconnect(): Promise<void> {
		if (this.connection) {
			await this.connection.close();
			this.connection = null;
			this.config = null;
		}
	}

	/**
	 * Execute a SQL query with safety guardrails
	 */
	async query(
		sql: string,
		paramsOrOptions?: unknown[] | { skipLimitWarning?: boolean },
		options?: { skipLimitWarning?: boolean },
	): Promise<QueryResult> {
		if (!this.connection) {
			throw new Error("Not connected to database");
		}

		// Handle parameter overloading
		let params: unknown[] = [];
		let queryOptions: { skipLimitWarning?: boolean } = {};

		if (Array.isArray(paramsOrOptions)) {
			params = paramsOrOptions;
			queryOptions = options || {};
		} else if (paramsOrOptions && typeof paramsOrOptions === "object") {
			queryOptions = paramsOrOptions;
		}

		// Safety guardrail: Warn about potentially dangerous queries
		const upperSql = sql.toUpperCase().trim();

		// Warn about SELECT queries without LIMIT on potentially large tables
		if (
			!queryOptions.skipLimitWarning &&
			upperSql.startsWith("SELECT") &&
			!upperSql.includes("LIMIT") &&
			!upperSql.includes("COUNT(") &&
			!upperSql.includes("EXISTS(")
		) {
			console.warn(
				"⚠️  WARNING: Query may return unlimited results. Consider adding LIMIT clause.",
			);
			console.warn(
				"   To skip this warning, pass { skipLimitWarning: true } as options.",
			);
		}

		// Warn about dangerous operations
		if (
			upperSql.includes("DROP ") ||
			upperSql.includes("DELETE ") ||
			upperSql.includes("TRUNCATE ") ||
			(upperSql.includes("UPDATE ") && !upperSql.includes("WHERE"))
		) {
			console.warn(
				"⚠️  WARNING: This appears to be a potentially destructive operation.",
			);
			console.warn("   Please verify the query before proceeding.");
		}

		const startTime = Date.now();
		try {
			const result = await this.connection.query(sql, params);
			const duration = Date.now() - startTime;

			// Warn about large result sets
			if (result.rowCount > 1000) {
				console.warn(
					`⚠️  WARNING: Query returned ${result.rowCount} rows. This may impact performance.`,
				);
			}

			return {
				rows: result.rows,
				rowCount: result.rowCount,
				duration,
			};
		} catch (error) {
			throw new Error(
				`Query failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	/**
	 * Get database schema information
	 */
	async getSchema(): Promise<SchemaInfo> {
		if (!this.connection) {
			throw new Error("Not connected to database");
		}

		try {
			let query: string;
			switch (this.config?.type) {
				case "postgresql":
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
				case "mysql":
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
				case "sqlite":
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
				default:
					throw new Error(
						`Schema introspection not supported for database type: ${this.config?.type}`,
					);
			}

			const result = await this.connection.query(query);

			const tables: SchemaInfo["tables"] = result.rows.map((row: any) => ({
				name: row.table_name,
				schema: row.table_schema || undefined,
				type: row.table_type as "table" | "view" | "materialized-view",
			}));

			// For now, return empty columns - we can implement column fetching later if needed
			const columns: SchemaInfo["columns"] = {};

			return {
				tables,
				columns,
			};
		} catch (error) {
			throw new Error(
				`Failed to get schema: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	/**
	 * Get table data with optional filtering and pagination (with safety limits)
	 */
	async getTableData(
		tableName: string,
		options: {
			limit?: number;
			offset?: number;
			where?: string;
			orderBy?: string;
		} = {},
	): Promise<QueryResult> {
		const { limit = 100, offset = 0, where, orderBy } = options;

		// Safety guardrail: Limit maximum results to prevent exhaustion
		const safeLimit = Math.min(limit, 1000);

		if (limit > 1000) {
			console.warn(
				`⚠️  WARNING: Requested limit of ${limit} reduced to ${safeLimit} for safety.`,
			);
		}

		let sql = `SELECT * FROM ${tableName}`;
		if (where) {
			sql += ` WHERE ${where}`;
		}
		if (orderBy) {
			sql += ` ORDER BY ${orderBy}`;
		}
		sql += ` LIMIT ${safeLimit} OFFSET ${offset}`;

		return this.query(sql, { skipLimitWarning: true });
	}

	/**
	 * Safely get a sample of users (limited to prevent exhaustion)
	 */
	async getUsersSample(limit: number = 10): Promise<QueryResult> {
		const safeLimit = Math.min(limit, 50); // Max 50 users for safety

		if (limit > 50) {
			console.warn(
				`⚠️  WARNING: User sample limit reduced from ${limit} to ${safeLimit} for safety.`,
			);
		}

		return this.query(`SELECT * FROM users LIMIT ${safeLimit}`, {
			skipLimitWarning: true,
		});
	}

	/**
	 * Execute multiple queries in a transaction
	 */
	async transaction(queries: string[]): Promise<QueryResult[]> {
		if (!this.connection) {
			throw new Error("Not connected to database");
		}

		try {
			const results: QueryResult[] = [];
			await this.connection.beginTransaction();

			for (const sql of queries) {
				const result = await this.query(sql);
				results.push(result);
			}

			await this.connection.commitTransaction();
			return results;
		} catch (error) {
			await this.connection.rollbackTransaction();
			throw new Error(
				`Transaction failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	/**
	 * Get connection status
	 */
	isConnected(): boolean {
		return this.connection !== null;
	}

	/**
	 * Get current configuration
	 */
	getConfig(): DatabaseConfig | null {
		return this.config;
	}
}

/**
 * Factory function to create a SeerDBAgent instance
 */
export const createAgent = (): SeerDBAgent => {
	return new SeerDBAgent();
};

/**
 * Convenience function for one-off queries
 */
export const executeQuery = async (
	config: DatabaseConfig,
	sql: string,
): Promise<QueryResult> => {
	const agent = createAgent();
	try {
		await agent.connect(config);
		return await agent.query(sql);
	} finally {
		await agent.disconnect();
	}
};
