import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import type {
	ColumnInfo,
	ConnectionInfo,
	QueryHistoryItem,
} from "../types/state.js";
import { DBType } from "../types/state.js";
import { DebouncedWriter } from "./debounced-writer.js";
import {
	decryptPassword,
	encryptPassword,
	getEncryptionKey,
} from "./encryption.js";
import {
	ensureDataDirectory,
	fileExists,
	resolveDataPath,
	setPersistenceDataDirectory,
} from "./file-utils.js";
import {
	extractPasswordFromConnectionString,
	maskPassword,
	restorePasswordToConnectionString,
} from "./mask.js";

const connectionsWriter = new DebouncedWriter<ConnectionInfo[]>(
	async (data) => {
		await writeFile(
			resolveDataPath("connections.json"),
			JSON.stringify(data, null, 2),
			"utf-8",
		);
	},
	500,
);

const queryHistoryWriter = new DebouncedWriter<QueryHistoryItem[]>(
	async (data) => {
		await writeFile(
			resolveDataPath("query-history.json"),
			JSON.stringify(data, null, 2),
			"utf-8",
		);
	},
	500,
);

// Flush all pending writes on process exit
process.on("beforeExit", () => {
	void Promise.all([connectionsWriter.flush(), queryHistoryWriter.flush()]);
});

// Connection with encrypted password
const encryptedConnectionSchema = z.object({
	id: z.string(),
	name: z.string(),
	type: z.nativeEnum(DBType),
	connectionString: z.string(),
	createdAt: z.string(),
	updatedAt: z.string(),
	encryptedPassword: z
		.object({
			encrypted: z.string(),
			iv: z.string(),
			tag: z.string(),
		})
		.optional(),
});

const connectionSchema: z.ZodType<ConnectionInfo> = z.object({
	id: z.string(),
	name: z.string(),
	type: z.nativeEnum(DBType),
	connectionString: z.string(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

const queryHistoryItemSchema: z.ZodType<QueryHistoryItem> = z.object({
	id: z.string(),
	connectionId: z.string(),
	query: z.string(),
	executedAt: z.string(),
	durationMs: z.number(),
	rowCount: z.number(),
	error: z.string().optional(),
});

const columnSchema: z.ZodType<ColumnInfo> = z.object({
	name: z.string(),
	dataType: z.string(),
	nullable: z.boolean(),
	defaultValue: z.string().nullable().optional(),
	isPrimaryKey: z.boolean().optional(),
	isForeignKey: z.boolean().optional(),
	foreignTable: z.string().optional(),
	foreignColumn: z.string().optional(),
});

export interface ConnectionsLoadResult {
	connections: ConnectionInfo[];
	normalized: number;
	skipped: number;
}

export async function loadConnections(): Promise<ConnectionsLoadResult> {
	await ensureDataDirectory();
	const targetPath = resolveDataPath("connections.json");
	if (!(await fileExists(targetPath))) {
		return { connections: [], normalized: 0, skipped: 0 };
	}

	const content = await readFile(targetPath, "utf-8");
	if (!content.trim()) {
		return { connections: [], normalized: 0, skipped: 0 };
	}

	const data = JSON.parse(content);
	if (!Array.isArray(data)) {
		console.warn("Expected array while parsing connections, using empty list.");
		return {
			connections: [],
			normalized: 0,
			skipped: Array.isArray(data) ? 0 : 1,
		};
	}

	const connections: ConnectionInfo[] = [];
	let normalizedCount = 0;
	let skippedCount = 0;

	for (const [index, entry] of data.entries()) {
		try {
			// First try to parse as encrypted connection
			const encryptedParsed = encryptedConnectionSchema.safeParse(entry);
			if (encryptedParsed.success) {
				let connectionString = encryptedParsed.data.connectionString;

				// If there's encrypted password, decrypt it and restore to connection string
				if (encryptedParsed.data.encryptedPassword) {
					try {
						const decryptedPassword = await decryptPassword(
							encryptedParsed.data.encryptedPassword,
						);
						connectionString = restorePasswordToConnectionString(
							connectionString,
							decryptedPassword,
						);
					} catch (error) {
						console.warn(
							`Failed to decrypt password for connection ${encryptedParsed.data.name}:`,
							error,
						);
						skippedCount += 1;
						continue;
					}
				}

				const connection: ConnectionInfo = {
					id: encryptedParsed.data.id,
					name: encryptedParsed.data.name,
					type: encryptedParsed.data.type,
					connectionString,
					createdAt: encryptedParsed.data.createdAt,
					updatedAt: encryptedParsed.data.updatedAt,
				};

				connections.push(connection);
			} else {
				// Fallback to legacy connection parsing
				const normalized = normalizeConnectionEntry(entry);
				if (normalized) {
					if (normalized._normalized) {
						normalizedCount += 1;
						delete normalized._normalized;
					}
					connections.push(normalized);
				} else {
					console.warn(`Skipping invalid connection entry at index ${index}.`);
					skippedCount += 1;
				}
			}
		} catch (error) {
			console.warn(
				`Error processing connection entry at index ${index}:`,
				error,
			);
			skippedCount += 1;
		}
	}

	// Deduplicate connections
	const deduped: ConnectionInfo[] = [];
	const byKey = new Map<string, ConnectionInfo>();
	connections.forEach((connection) => {
		const key = `${connection.type}|${maskPassword(connection.connectionString)}`;
		const existing = byKey.get(key);
		if (!existing) {
			byKey.set(key, connection);
			deduped.push(connection);
			return;
		}

		const existingTime = Date.parse(existing.updatedAt ?? "");
		const currentTime = Date.parse(connection.updatedAt ?? "");
		const shouldReplace =
			!Number.isNaN(currentTime) && currentTime > existingTime;
		if (shouldReplace) {
			const idx = deduped.indexOf(existing);
			if (idx !== -1) {
				deduped[idx] = connection;
			}
			byKey.set(key, connection);
		}
		skippedCount += 1;
	});

	return {
		connections: deduped,
		normalized: normalizedCount,
		skipped: skippedCount,
	};
}

export async function saveConnections(
	connections: ConnectionInfo[],
	flush = false,
): Promise<void> {
	await ensureDataDirectory();

	// Encrypt passwords in connection strings before saving
	const encryptedConnections = await Promise.all(
		connections.map(async (connection) => {
			const password = extractPasswordFromConnectionString(
				connection.connectionString,
			);

			if (password) {
				// Encrypt the password
				const encryptedPassword = await encryptPassword(password);

				// Create masked connection string for storage
				const maskedConnectionString = maskPassword(
					connection.connectionString,
				);

				return {
					...connection,
					connectionString: maskedConnectionString,
					encryptedPassword,
				};
			}

			// No password found, store as-is
			return connection;
		}),
	);

	if (flush) {
		// For testing: write immediately to catch errors
		await writeFile(
			resolveDataPath("connections.json"),
			JSON.stringify(encryptedConnections, null, 2),
			"utf-8",
		);
	} else {
		// Use debounced writer to batch connection saves
		connectionsWriter.write(encryptedConnections);
	}
}

export async function loadQueryHistory(): Promise<QueryHistoryItem[]> {
	await ensureDataDirectory();
	const targetPath = resolveDataPath("query-history.json");
	if (!(await fileExists(targetPath))) {
		return [];
	}

	const content = await readFile(targetPath, "utf-8");
	if (!content.trim()) {
		return [];
	}

	return parseArray(JSON.parse(content), queryHistoryItemSchema);
}

export async function saveQueryHistory(
	history: QueryHistoryItem[],
	flush = false,
): Promise<void> {
	await ensureDataDirectory();
	if (flush) {
		// For testing: write immediately to catch errors
		await writeFile(
			resolveDataPath("query-history.json"),
			JSON.stringify(history, null, 2),
			"utf-8",
		);
	} else {
		// Use debounced writer to batch query history saves
		queryHistoryWriter.write(history);
	}
}

function safeParse<T>(schema: z.ZodType<T>, data: unknown): T | null {
	const result = schema.safeParse(data);
	if (result.success) {
		return result.data;
	}

	console.warn(
		"Failed to parse persisted data, using defaults:",
		result.error.flatten(),
	);
	return null;
}

function parseArray<T>(data: unknown, schema: z.ZodType<T>): T[] {
	if (!Array.isArray(data)) {
		console.warn(
			"Expected array while parsing persisted data, using empty list.",
		);
		return [];
	}

	const items: T[] = [];
	data.forEach((item, index) => {
		const parsed = safeParse(schema, item);
		if (parsed) {
			items.push(parsed);
		} else {
			console.warn(`Skipping invalid entry at index ${index}.`);
		}
	});
	return items;
}

type ConnectionWithMarker = ConnectionInfo & { _normalized?: boolean };

function normalizeConnectionEntry(entry: unknown): ConnectionWithMarker | null {
	const parsed = connectionSchema.safeParse(entry);
	if (parsed.success) {
		return parsed.data;
	}

	if (!entry || typeof entry !== "object") {
		console.warn("Connection entry is not an object.");
		return null;
	}

	const record = entry as Record<string, unknown>;
	const name =
		typeof record.name === "string" ? record.name : "Legacy connection";
	const driver = getLegacyString(record, ["driver", "type"]);
	const connectionString = getLegacyString(record, [
		"connection_str",
		"connectionString",
	]);

	if (!driver || !connectionString) {
		console.warn("Legacy connection missing driver or connection string.");
		return null;
	}

	const dbType = mapDriverToDBType(driver);
	if (!dbType) {
		console.warn(`Unsupported legacy driver value: ${driver}`);
		return null;
	}

	const timestamp = new Date().toISOString();
	const fallbackConnection = {
		id: createDeterministicId(`${name}:${connectionString}`),
		name,
		type: dbType,
		connectionString,
		createdAt: timestamp,
		updatedAt: timestamp,
	};

	const normalized = connectionSchema.safeParse(fallbackConnection);
	if (normalized.success) {
		return { ...normalized.data, _normalized: true };
	}

	console.warn("Unable to normalize legacy connection entry.");
	return null;
}

function getLegacyString(
	record: Record<string, unknown>,
	keys: string[],
): string | undefined {
	for (const key of keys) {
		const value = record[key];
		if (typeof value === "string" && value.trim().length > 0) {
			return value.trim();
		}
	}
	return undefined;
}

function mapDriverToDBType(driver: string): DBType | null {
	const normalized = driver.toLowerCase();
	switch (normalized) {
		case "postgres":
		case "postgresql":
		case "pg":
			return DBType.PostgreSQL;
		case "mysql":
			return DBType.MySQL;
		case "sqlite":
		case "sqlite3":
			return DBType.SQLite;
		default:
			return null;
	}
}

function createDeterministicId(value: string): string {
	return createHash("sha1").update(value).digest("hex").slice(0, 12);
}

export { setPersistenceDataDirectory } from "./file-utils.js";

export const __persistenceInternals = {
	normalizeConnectionEntry,
	connectionSchema,
	connectionsWriter,
	queryHistoryWriter,
	// Re-exported for testing
	getEncryptionKey,
	encryptPassword,
	decryptPassword,
	maskPassword,
	restorePasswordToConnectionString,
} as const;
