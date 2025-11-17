import { Pool } from "pg";
import { DBType } from "../types/state.js";
import { ConnectionError, DatabaseError } from "./errors.js";
import type {
	DatabaseConfig,
	DatabaseConnection,
	QueryResult,
} from "./types.js";

export class PostgresConnection implements DatabaseConnection {
	public readonly type = DBType.PostgreSQL;
	private pool: Pool;
	private connected = false;
	private readonly closeTimeoutMillis: number;

	constructor(private readonly config: DatabaseConfig) {
		// Parse SSL mode from connection string
		let sslConfig = { rejectUnauthorized: false }; // Default for AWS RDS

		try {
			const url = new URL(config.connectionString);
			const sslMode = url.searchParams.get("sslmode");

			if (sslMode === "disable" || sslMode === "0") {
				sslConfig = false;
			} else if (sslMode === "require" || sslMode === "prefer") {
				sslConfig = { rejectUnauthorized: false };
			} else if (sslMode === "verify-ca" || sslMode === "verify-full") {
				sslConfig = { rejectUnauthorized: true };
			}
		} catch {
			// If URL parsing fails, use default SSL config
		}

		this.pool = new Pool({
			connectionString: config.connectionString,
			max: config.pool?.max ?? 10,
			idleTimeoutMillis: config.pool?.idleTimeoutMillis ?? 30_000,
			connectionTimeoutMillis: config.pool?.connectionTimeoutMillis ?? 10_000,
			ssl: sslConfig,
		});
		this.closeTimeoutMillis = config.pool?.closeTimeoutMillis ?? 5_000;
	}

	async connect(): Promise<void> {
		try {
			await this.pool.query("SELECT 1");
			this.connected = true;
		} catch (error) {
			throw new ConnectionError(
				"Failed to connect to PostgreSQL database.",
				error instanceof Error ? (error as { code?: string }).code : undefined,
				error instanceof Error ? error.message : undefined,
			);
		}
	}

	async query<T extends Record<string, unknown> = Record<string, unknown>>(
		sql: string,
		params: unknown[] = [],
	): Promise<QueryResult<T>> {
		if (!this.connected) {
			await this.connect();
		}

		try {
			const result = await this.pool.query(sql, params);
			return {
				rows: result.rows as T[],
				rowCount: result.rowCount ?? result.rows.length,
				fields: result.fields?.map((field) => field.name),
			};
		} catch (error) {
			throw new DatabaseError(
				"PostgreSQL query failed.",
				error instanceof Error ? (error as { code?: string }).code : undefined,
				error instanceof Error ? error.message : undefined,
			);
		}
	}

	async execute(sql: string, params: unknown[] = []): Promise<void> {
		await this.query(sql, params);
	}

	async close(): Promise<void> {
		const closePromise = this.pool.end();
		let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
		let timedOut = false;

		const timeoutPromise = new Promise<never>((_, reject) => {
			timeoutHandle = setTimeout(() => {
				timedOut = true;
				reject(new Error("PostgreSQL pool close timed out."));
			}, this.closeTimeoutMillis);
		});

		try {
			await Promise.race([closePromise, timeoutPromise]);
		} catch (error) {
			if (timedOut) {
				console.warn(
					"PostgreSQL pool close timed out; continuing shutdown asynchronously.",
				);
				closePromise
					.catch((closeError) => {
						console.warn(
							"PostgreSQL pool close eventually failed:",
							closeError,
						);
					})
					.finally(() => {
						if (timeoutHandle) {
							clearTimeout(timeoutHandle);
						}
					});
			} else {
				console.warn("Failed to close PostgreSQL pool cleanly:", error);
			}
		} finally {
			if (timeoutHandle) {
				clearTimeout(timeoutHandle);
			}
			this.connected = false;
		}
	}
}
