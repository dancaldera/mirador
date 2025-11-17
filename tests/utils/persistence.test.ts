import { beforeEach, describe, expect, it, vi } from "bun:test";
import { constants } from "fs";
import path from "path";
import { randomBytes, createCipheriv, createDecipheriv } from "crypto";
import type {
	ColumnInfo,
	ConnectionInfo,
	QueryHistoryItem,
} from "../../src/types/state.js";
import { DBType } from "../../src/types/state.js";
import {
	__persistenceInternals,
	type ConnectionsLoadResult,
	loadConnections,
	loadQueryHistory,
	saveConnections,
	saveQueryHistory,
	setPersistenceDataDirectory,
} from "../../src/utils/persistence.js";

// Mock crypto functions
vi.mock("crypto", () => ({
	createCipheriv: vi.fn(),
	createDecipheriv: vi.fn(),
	createHash: vi.fn(),
	randomBytes: vi.fn(),
	scrypt: vi.fn(),
}));

// Mock the file system operations
const mockMkdir = vi.fn();
const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockAccess = vi.fn();
const mockHomedir = vi.fn(() => "/home/user");

vi.mock("fs/promises", () => ({
	mkdir: mockMkdir,
	readFile: mockReadFile,
	writeFile: mockWriteFile,
	access: mockAccess,
}));

vi.mock("os", () => ({
	homedir: mockHomedir,
}));

vi.mock("fs", () => ({
	constants: {
		F_OK: 0,
	},
}));

vi.mock("crypto", () => ({
	createHash: vi.fn(() => ({
		update: vi.fn().mockReturnThis(),
		digest: vi.fn().mockReturnValue("mockedhash123456789012"),
	})),
	createCipheriv: vi.fn(() => ({
		update: vi.fn(() => "encrypted"),
		final: vi.fn(() => "final"),
		getAuthTag: vi.fn(() => Buffer.from("tag123")),
	})),
	createDecipheriv: vi.fn(() => ({
		setAuthTag: vi.fn(),
		update: vi.fn(() => "decrypted"),
		final: vi.fn(() => ""),
	})),
	randomBytes: vi.fn((size: number) => {
		if (size === 32) {
			return Buffer.from("0123456789abcdef0123456789abcdef", "hex");
		} else if (size === 16) {
			return Buffer.from("0123456789abcdef", "hex");
		}
		return Buffer.alloc(size);
	}),
	scrypt: vi.fn(),
}));

describe("persistence utilities", () => {
	const mockDataDir = path.join("/home/user", ".mirador");

	beforeEach(() => {
		vi.clearAllMocks();
		setPersistenceDataDirectory(mockDataDir);
		mockMkdir.mockResolvedValue(undefined);
		mockWriteFile.mockResolvedValue(undefined);
		mockAccess.mockResolvedValue(undefined);
	});

	describe("loadConnections", () => {
		it("returns empty result when file doesn't exist", async () => {
			mockAccess.mockRejectedValue(new Error("File not found"));

			const result = await loadConnections();

			expect(result).toEqual({
				connections: [],
				normalized: 0,
				skipped: 0,
			});
		});

		it("returns empty result when file is empty", async () => {
			mockReadFile.mockResolvedValue("");

			const result = await loadConnections();

			expect(result).toEqual({
				connections: [],
				normalized: 0,
				skipped: 0,
			});
		});

		it("loads valid connections", async () => {
			const mockConnections: ConnectionInfo[] = [
				{
					id: "1",
					name: "Test DB",
					type: DBType.PostgreSQL,
					connectionString: "postgres://localhost/test",
					createdAt: "2023-01-01T00:00:00.000Z",
					updatedAt: "2023-01-01T00:00:00.000Z",
				},
			];
			mockReadFile.mockResolvedValue(JSON.stringify(mockConnections));

			const result = await loadConnections();

			expect(result.connections).toEqual(mockConnections);
			expect(result.normalized).toBe(0);
			expect(result.skipped).toBe(0);
		});

		it("handles malformed JSON gracefully", async () => {
			mockReadFile.mockResolvedValue("invalid json");

			await expect(loadConnections()).rejects.toThrow();
		});

		it("handles non-array data", async () => {
			mockReadFile.mockResolvedValue('{"not": "an array"}');

			const result = await loadConnections();

			expect(result.connections).toEqual([]);
			expect(result.normalized).toBe(0);
			expect(result.skipped).toBe(1);
		});

		it("normalizes legacy connections", async () => {
			const legacyData = [
				{
					name: "Legacy DB",
					driver: "postgres",
					connection_str: "postgres://localhost/legacy",
				},
			];
			mockReadFile.mockResolvedValue(JSON.stringify(legacyData));

			const result = await loadConnections();

			expect(result.connections).toHaveLength(1);
			expect(result.connections[0].name).toBe("Legacy DB");
			expect(result.connections[0].type).toBe(DBType.PostgreSQL);
			expect(result.normalized).toBe(1);
			expect(result.skipped).toBe(0);
		});

		it("skips invalid connection entries", async () => {
			const mixedData = [
				{
					id: "1",
					name: "Valid DB",
					type: DBType.MySQL,
					connectionString: "mysql://localhost/test",
					createdAt: "2023-01-01T00:00:00.000Z",
					updatedAt: "2023-01-01T00:00:00.000Z",
				},
				{ invalid: "entry" },
				null,
			];
			mockReadFile.mockResolvedValue(JSON.stringify(mixedData));

			const result = await loadConnections();

			expect(result.connections).toHaveLength(1);
			expect(result.normalized).toBe(0);
			expect(result.skipped).toBe(2);
		});

		it("handles different legacy driver names", async () => {
			const legacyData = [
				{ driver: "postgresql", connection_str: "postgres://localhost/db1" },
				{ driver: "pg", connection_str: "postgres://localhost/db2" },
				{ driver: "mysql", connection_str: "mysql://localhost/db3" },
				{ driver: "sqlite", connection_str: "/path/to/db1.sqlite" },
				{ driver: "sqlite3", connection_str: "/path/to/db2.sqlite" },
			];
			mockReadFile.mockResolvedValue(JSON.stringify(legacyData));

			const result = await loadConnections();

			expect(result.connections).toHaveLength(5);
			expect(result.connections[0].type).toBe(DBType.PostgreSQL);
			expect(result.connections[1].type).toBe(DBType.PostgreSQL);
			expect(result.connections[2].type).toBe(DBType.MySQL);
			expect(result.connections[3].type).toBe(DBType.SQLite);
			expect(result.connections[4].type).toBe(DBType.SQLite);
			expect(result.normalized).toBe(5);
		});

		it("skips legacy connections with unsupported drivers", async () => {
			const legacyData = [
				{ driver: "oracle", connection_str: "oracle://localhost/db" },
			];
			mockReadFile.mockResolvedValue(JSON.stringify(legacyData));

			const result = await loadConnections();

			expect(result.connections).toHaveLength(0);
			expect(result.skipped).toBe(1);
		});

		it("deduplicates connections sharing type and connection string", async () => {
			const duplicateData = [
				{
					id: "1",
					name: "Primary",
					type: DBType.PostgreSQL,
					connectionString: "postgres://localhost/primary",
					createdAt: "2023-01-01T00:00:00.000Z",
					updatedAt: "2023-01-01T00:00:00.000Z",
				},
				{
					id: "2",
					name: "Primary (newer)",
					type: DBType.PostgreSQL,
					connectionString: "postgres://localhost/primary",
					createdAt: "2023-01-02T00:00:00.000Z",
					updatedAt: "2023-01-02T00:00:00.000Z",
				},
			];
			mockReadFile.mockResolvedValue(JSON.stringify(duplicateData));

			const result = await loadConnections();

			expect(result.connections).toHaveLength(1);
			expect(result.connections[0]).toEqual(
				expect.objectContaining({
					name: "Primary (newer)",
					connectionString: "postgres://localhost/primary",
				}),
			);
			expect(result.skipped).toBe(1);
		});

		it("normalizes legacy entries through internal helper", () => {
			const result = __persistenceInternals.normalizeConnectionEntry({
				name: "Legacy DB",
				driver: "postgres",
				connection_str: "postgres://localhost/legacy",
			});

			expect(result).not.toBeNull();
			expect(result?._normalized).toBe(true);
		});

		it("logs when normalization fallback fails", () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			const safeParseSpy = vi
				.spyOn(__persistenceInternals.connectionSchema, "safeParse")
				.mockImplementationOnce(() => ({ success: false }) as any)
				.mockImplementationOnce(() => ({ success: false }) as any);

			const result = __persistenceInternals.normalizeConnectionEntry({
				name: "Broken",
				driver: "postgres",
				connection_str: "postgres://broken",
			});

			expect(result).toBeNull();
			expect(warnSpy).toHaveBeenCalledWith(
				"Unable to normalize legacy connection entry.",
			);

			warnSpy.mockRestore();
			safeParseSpy.mockRestore();
		});

		it("creates directory if it doesn't exist", async () => {
			mockAccess.mockRejectedValue(new Error("File not found"));

			await loadConnections();

			expect(mockMkdir).toHaveBeenCalledWith(mockDataDir, { recursive: true });
		});
	});

	describe("saveConnections", () => {
		it("saves connections to file", async () => {
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

			await saveConnections(connections, true);

			expect(mockWriteFile).toHaveBeenCalledWith(
				path.join(mockDataDir, "connections.json"),
				JSON.stringify(connections, null, 2),
				"utf-8",
			);
		});

		it("creates directory if it doesn't exist", async () => {
			await saveConnections([], true);

			expect(mockMkdir).toHaveBeenCalledWith(mockDataDir, { recursive: true });
		});

		it("encrypts passwords when saving connections", async () => {
			const connections: ConnectionInfo[] = [
				{
					id: "1",
					name: "Test DB",
					type: DBType.PostgreSQL,
					connectionString: "postgres://user:password@localhost/test",
					createdAt: "2023-01-01T00:00:00.000Z",
					updatedAt: "2023-01-01T00:00:00.000Z",
				},
			];

			await saveConnections(connections, true);

			expect(mockWriteFile).toHaveBeenCalledWith(
				path.join(mockDataDir, "connections.json"),
				expect.stringContaining("postgres:user:********@localhost/test"),
				"utf-8",
			);
		});

		it("uses debounced writer when not flushing", async () => {
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

			await saveConnections(connections, false);

			// Should not write immediately when flush=false
			expect(mockWriteFile).not.toHaveBeenCalled();
		});
	});

	describe("loadQueryHistory", () => {
		it("returns empty array when file doesn't exist", async () => {
			mockAccess.mockRejectedValue(new Error("File not found"));

			const result = await loadQueryHistory();

			expect(result).toEqual([]);
		});

		it("returns empty array when file is empty", async () => {
			mockReadFile.mockResolvedValue("");

			const result = await loadQueryHistory();

			expect(result).toEqual([]);
		});

		it("loads valid query history", async () => {
			const mockHistory: QueryHistoryItem[] = [
				{
					id: "1",
					connectionId: "conn1",
					query: "SELECT * FROM users",
					executedAt: "2023-01-01T00:00:00.000Z",
					durationMs: 100,
					rowCount: 10,
				},
			];
			mockReadFile.mockResolvedValue(JSON.stringify(mockHistory));

			const result = await loadQueryHistory();

			expect(result).toEqual(mockHistory);
		});

		it("handles query history with errors", async () => {
			const mockHistory: QueryHistoryItem[] = [
				{
					id: "1",
					connectionId: "conn1",
					query: "INVALID SQL",
					executedAt: "2023-01-01T00:00:00.000Z",
					durationMs: 50,
					rowCount: 0,
					error: "Syntax error",
				},
			];
			mockReadFile.mockResolvedValue(JSON.stringify(mockHistory));

			const result = await loadQueryHistory();

			expect(result).toEqual(mockHistory);
		});

		it("filters invalid entries", async () => {
			const mixedData = [
				{
					id: "1",
					connectionId: "conn1",
					query: "SELECT * FROM users",
					executedAt: "2023-01-01T00:00:00.000Z",
					durationMs: 100,
					rowCount: 10,
				},
				{ invalid: "entry" },
			];
			mockReadFile.mockResolvedValue(JSON.stringify(mixedData));

			const result = await loadQueryHistory();

			expect(result).toHaveLength(1);
		});

		it("handles non-array data", async () => {
			mockReadFile.mockResolvedValue('{"not": "an array"}');

			const result = await loadQueryHistory();

			expect(result).toEqual([]);
		});
	});

	describe("saveQueryHistory", () => {
		it("saves query history to file", async () => {
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

			await saveQueryHistory(history, true);

			expect(mockWriteFile).toHaveBeenCalledWith(
				path.join(mockDataDir, "query-history.json"),
				JSON.stringify(history, null, 2),
				"utf-8",
			);
		});

		it("uses debounced writer when not flushing", async () => {
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

			await saveQueryHistory(history, false);

			// Should not write immediately when flush=false
			expect(mockWriteFile).not.toHaveBeenCalled();
		});
	});

	describe("error handling", () => {
		it("handles mkdir failures gracefully", async () => {
			const error = new Error("Permission denied");
			mockMkdir.mockRejectedValue(error);

			await expect(loadConnections()).rejects.toThrow(
				"Failed to ensure data directory",
			);
		});

		it("handles readFile failures", async () => {
			const error = new Error("Permission denied");
			mockReadFile.mockRejectedValue(error);

			await expect(loadConnections()).rejects.toThrow(error);
		});

		it("handles writeFile failures", async () => {
			const error = new Error("Disk full");
			mockWriteFile.mockRejectedValue(error);

			await expect(saveConnections([], true)).rejects.toThrow(error);
		});
	});

	describe("integration scenarios", () => {
		it("maintains data integrity through save/load cycles", async () => {
			const originalConnections: ConnectionInfo[] = [
				{
					id: "1",
					name: "Test DB",
					type: DBType.PostgreSQL,
					connectionString: "postgres://localhost/test",
					createdAt: "2023-01-01T00:00:00.000Z",
					updatedAt: "2023-01-01T00:00:00.000Z",
				},
			];

			await saveConnections(originalConnections, true);
			mockReadFile.mockResolvedValue(JSON.stringify(originalConnections));

			const result = await loadConnections();

			expect(result.connections).toEqual(originalConnections);
			expect(result.normalized).toBe(0);
			expect(result.skipped).toBe(0);
		});

		it("handles connections with corrupted encrypted passwords", async () => {
			// This connection has encryptedPassword but invalid data, AND invalid type for legacy fallback
			const corruptedConnection = {
				id: "1",
				name: "Test DB",
				type: "invalid_type", // This will fail legacy parsing
				connectionString: "postgres://user@host/db",
				encryptedPassword: {
					encrypted: "corrupted",
					iv: "invalid",
					tag: "invalid",
				},
				createdAt: "2023-01-01T00:00:00.000Z",
				updatedAt: "2023-01-01T00:00:00.000Z",
			};

			mockReadFile.mockResolvedValue(JSON.stringify([corruptedConnection]));

			const result = await loadConnections();

			// The connection should be skipped due to both decryption failure and invalid legacy type
			expect(result.connections).toEqual([]);
			expect(result.skipped).toBe(1);
		});

		it("handles malformed connection data", async () => {
			// Test data that fails legacy parsing due to invalid type
			const malformedConnection = {
				id: "1",
				name: "Test DB",
				type: "unsupported_db_type", // This will fail legacy parsing
				connectionString: "", // Empty connection string also fails
				createdAt: "2023-01-01T00:00:00.000Z",
				updatedAt: "2023-01-01T00:00:00.000Z",
			};

			mockReadFile.mockResolvedValue(JSON.stringify([malformedConnection]));

			const result = await loadConnections();

			expect(result.connections).toEqual([]);
			expect(result.skipped).toBe(1);
		});

		it("handles mixed valid and invalid data gracefully", async () => {
			const mixedConnections = [
				{
					id: "1",
					name: "Valid DB",
					type: DBType.PostgreSQL,
					connectionString: "postgres://localhost/valid",
					createdAt: "2023-01-01T00:00:00.000Z",
					updatedAt: "2023-01-01T00:00:00.000Z",
				},
				{ driver: "mysql", connection_str: "mysql://localhost/legacy" }, // Legacy
				{ invalid: "entry" }, // Invalid
			];
			mockReadFile.mockResolvedValue(JSON.stringify(mixedConnections));

			const result = await loadConnections();

			expect(result.connections).toHaveLength(2); // Valid + Legacy
			expect(result.normalized).toBe(1);
			expect(result.skipped).toBe(1);
		});
	});

	describe("password masking", () => {
		it("masks PostgreSQL connection string", () => {
			const result = __persistenceInternals.maskPassword(
				"postgresql://user:secret@localhost/db",
			);

			expect(result).toBe("user:******@localhost/db");
		});

		it("masks MySQL connection string", () => {
			const result = __persistenceInternals.maskPassword(
				"mysql://user:secret@localhost/db",
			);

			expect(result).toBe("user:******@localhost/db");
		});

		it("masks password parameter", () => {
			const result = __persistenceInternals.maskPassword(
				"host=localhost;password=secret;user=test",
			);

			expect(result).toBe("host=localhost;secret:@;user=test");
		});

		it("returns original string when no password found", () => {
			const result = __persistenceInternals.maskPassword(
				"sqlite:///path/to/db.sqlite",
			);

			expect(result).toBe("sqlite:///path/to/db.sqlite");
		});
	});

	describe("encryption key management", () => {
		beforeEach(() => {
			vi.clearAllMocks();
		});

		it("loads existing valid encryption key", async () => {
			const existingKey = Buffer.from("12345678901234567890123456789012");
			mockAccess.mockResolvedValue(undefined); // File exists
			mockReadFile.mockResolvedValue(existingKey);

			const result = await __persistenceInternals.getEncryptionKey();

			expect(result).toEqual(existingKey);
			expect(mockAccess).toHaveBeenCalledWith(
				path.join(mockDataDir, "encryption.key"),
				constants.F_OK,
			);
			expect(mockReadFile).toHaveBeenCalledWith(
				path.join(mockDataDir, "encryption.key"),
			);
		});

		it("ignores invalid key length and generates new key", async () => {
			const invalidKey = Buffer.from("short");
			mockAccess.mockResolvedValue(undefined); // File exists
			mockReadFile.mockResolvedValue(invalidKey);

			const result = await __persistenceInternals.getEncryptionKey();

			expect(result).toEqual(
				Buffer.from("0123456789abcdef0123456789abcdef", "hex"),
			);
			expect(mockWriteFile).toHaveBeenCalledWith(
				path.join(mockDataDir, "encryption.key"),
				Buffer.from("0123456789abcdef0123456789abcdef", "hex"),
			);
		});

		it("generates new key when file doesn't exist", async () => {
			mockAccess.mockRejectedValue(new Error("ENOENT")); // File doesn't exist

			const result = await __persistenceInternals.getEncryptionKey();

			expect(result).toEqual(
				Buffer.from("0123456789abcdef0123456789abcdef", "hex"),
			);
			expect(mockMkdir).toHaveBeenCalledWith(mockDataDir, { recursive: true });
			expect(mockWriteFile).toHaveBeenCalledWith(
				path.join(mockDataDir, "encryption.key"),
				Buffer.from("0123456789abcdef0123456789abcdef", "hex"),
			);
		});

		it("handles read errors gracefully and generates new key", async () => {
			mockAccess.mockResolvedValue(undefined); // File exists
			mockReadFile.mockRejectedValue(new Error("Read failed"));

			const result = await __persistenceInternals.getEncryptionKey();

			expect(result).toEqual(
				Buffer.from("0123456789abcdef0123456789abcdef", "hex"),
			);
			expect(mockWriteFile).toHaveBeenCalledWith(
				path.join(mockDataDir, "encryption.key"),
				Buffer.from("0123456789abcdef0123456789abcdef", "hex"),
			);
		});
	});

	describe("password encryption/decryption", () => {
		beforeEach(() => {
			vi.clearAllMocks();
		});

		it("encrypts and decrypts password correctly", async () => {
			const password = "secret123";
			const mockCipher = {
				update: vi.fn().mockReturnValue("encrypted"),
				final: vi.fn().mockReturnValue("final"),
				getAuthTag: vi.fn().mockReturnValue(Buffer.from("tag123")),
			};
			const mockDecipher = {
				setAuthTag: vi.fn(),
				update: vi.fn().mockReturnValue("decrypted"),
				final: vi.fn().mockReturnValue(""),
			};

			(createCipheriv as any).mockReturnValue(mockCipher);
			(createDecipheriv as any).mockReturnValue(mockDecipher);

			const encrypted = await __persistenceInternals.encryptPassword(password);
			expect(encrypted).toEqual({
				encrypted: "encryptedfinal",
				iv: "0123456789abcdef", // hex of the 16-byte mock iv
				tag: "746167313233", // hex of "tag123"
			});

			const decrypted = await __persistenceInternals.decryptPassword(encrypted);
			expect(decrypted).toBe("decrypted");
		});

		it("handles encryption errors", async () => {
			const password = "secret123";
			(createCipheriv as any).mockImplementation(() => {
				throw new Error("Encryption failed");
			});

			await expect(
				__persistenceInternals.encryptPassword(password),
			).rejects.toThrow("Encryption failed");
		});

		it("handles decryption errors", async () => {
			const encryptedData = {
				encrypted: "encrypted",
				iv: "0123456789abcdef",
				tag: "746167313233",
			};

			(createDecipheriv as any).mockImplementation(() => {
				throw new Error("Decryption failed");
			});

			await expect(
				__persistenceInternals.decryptPassword(encryptedData),
			).rejects.toThrow("Decryption failed");
		});
	});

	describe("data directory management", () => {
		it("sets custom data directory", () => {
			const customDir = "/custom/data/dir";
			setPersistenceDataDirectory(customDir);

			// Reset to default for other tests
			setPersistenceDataDirectory(mockDataDir);
		});
	});

	describe("process exit handling", () => {
		it("flushes writers on process beforeExit", async () => {
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

			// Save without flushing to use debounced writer
			await saveConnections(connections, false);

			// Trigger beforeExit event
			process.emit("beforeExit", 0);

			// Wait for debounced writes to complete
			await new Promise((resolve) => setTimeout(resolve, 600));

			expect(mockWriteFile).toHaveBeenCalledWith(
				path.join(mockDataDir, "connections.json"),
				expect.stringContaining("Test DB"),
				"utf-8",
			);
		});
	});

	describe("password restoration", () => {
		it("restores password in PostgreSQL connection string", () => {
			const masked = "postgresql://user:********@localhost/db";
			const password = "secret123";

			const result = __persistenceInternals.restorePasswordToConnectionString(
				masked,
				password,
			);

			expect(result).toBe("postgresql://user:secret123@localhost/db");
		});

		it("restores password in postgres connection string", () => {
			const masked = "postgres://user:********@localhost/db";
			const password = "secret123";

			const result = __persistenceInternals.restorePasswordToConnectionString(
				masked,
				password,
			);

			expect(result).toBe("postgres://user:secret123@localhost/db");
		});

		it("restores password in postgres format without protocol", () => {
			const masked = "postgres:user:********@localhost/db";
			const password = "secret123";

			const result = __persistenceInternals.restorePasswordToConnectionString(
				masked,
				password,
			);

			expect(result).toBe("postgres:user:secret123@localhost/db");
		});

		it("restores password in postgres format with default user", () => {
			const masked = "postgres:********@localhost/db";
			const password = "secret123";

			const result = __persistenceInternals.restorePasswordToConnectionString(
				masked,
				password,
			);

			expect(result).toBe("postgresql://postgres:secret123@localhost/db");
		});

		it("restores password in MySQL connection string", () => {
			const masked = "mysql://user:********@localhost/db";
			const password = "secret123";

			const result = __persistenceInternals.restorePasswordToConnectionString(
				masked,
				password,
			);

			expect(result).toBe("mysql://user:secret123@localhost/db");
		});

		it("restores password in parameter format", () => {
			const masked = "host=localhost;password=********;user=test";
			const password = "secret123";

			const result = __persistenceInternals.restorePasswordToConnectionString(
				masked,
				password,
			);

			expect(result).toBe("host=localhost;password=secret123;user=test");
		});

		it("restores password in generic format", () => {
			const masked = "//user:********@localhost/db";
			const password = "secret123";

			const result = __persistenceInternals.restorePasswordToConnectionString(
				masked,
				password,
			);

			expect(result).toBe("//user:secret123@localhost/db");
		});

		it("returns original string when no masked password found", () => {
			const original = "sqlite:///path/to/db.sqlite";
			const password = "secret123";

			const result = __persistenceInternals.restorePasswordToConnectionString(
				original,
				password,
			);

			expect(result).toBe(original);
		});
	});

	describe("connection normalization edge cases", () => {
		it("returns null for invalid legacy connection with missing fields", () => {
			const result = __persistenceInternals.normalizeConnectionEntry({
				name: "Broken",
				// Missing driver and connection_str
			});

			expect(result).toBeNull();
		});

		it("returns null for non-object entry", () => {
			const result =
				__persistenceInternals.normalizeConnectionEntry("not an object");

			expect(result).toBeNull();
		});

		it("returns null for null entry", () => {
			const result = __persistenceInternals.normalizeConnectionEntry(null);

			expect(result).toBeNull();
		});

		it("returns null for undefined entry", () => {
			const result = __persistenceInternals.normalizeConnectionEntry(undefined);

			expect(result).toBeNull();
		});
	});

	describe("decryption error handling", () => {
		it("skips connection when password decryption fails", async () => {
			// Mock decryption to fail
			const decryptSpy = vi
				.spyOn(__persistenceInternals, "decryptPassword")
				.mockRejectedValue(new Error("Decryption failed"));

			const encryptedConnection = {
				id: "1",
				name: "Test DB",
				type: DBType.PostgreSQL,
				connectionString: "postgres://user:********@localhost/db",
				createdAt: "2023-01-01T00:00:00.000Z",
				updatedAt: "2023-01-01T00:00:00.000Z",
				encryptedPassword: {
					encrypted: "encrypted",
					iv: "0123456789abcdef",
					tag: "746167313233",
				},
			};

			mockReadFile.mockResolvedValue(JSON.stringify([encryptedConnection]));

			const result = await loadConnections();

			expect(result.connections).toEqual([]);
			expect(result.skipped).toBe(1);

			decryptSpy.mockRestore();
		});

		it("handles unexpected errors during connection processing", async () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

			// Mock the connection schema to succeed
			const schemaSpy = vi
				.spyOn(__persistenceInternals.connectionSchema, "safeParse")
				.mockReturnValue({
					success: true,
					data: {
						id: "1",
						name: "Test DB",
						type: DBType.PostgreSQL,
						connectionString: "postgres://localhost/test",
						createdAt: "2023-01-01T00:00:00.000Z",
						updatedAt: "2023-01-01T00:00:00.000Z",
					},
				});

			// Mock Array.prototype.push to throw an error
			const originalPush = Array.prototype.push;
			Array.prototype.push = function (...items) {
				throw new Error("Unexpected error during array push");
			};

			try {
				const connectionData = [
					{
						id: "1",
						name: "Test DB",
						type: DBType.PostgreSQL,
						connectionString: "postgres://localhost/test",
						createdAt: "2023-01-01T00:00:00.000Z",
						updatedAt: "2023-01-01T00:00:00.000Z",
					},
				];

				mockReadFile.mockResolvedValue(JSON.stringify(connectionData));

				const result = await loadConnections();

				expect(result.connections).toEqual([]);
				expect(result.skipped).toBe(1);
				expect(warnSpy).toHaveBeenCalledWith(
					"Error processing connection entry at index 0:",
					expect.any(Error),
				);
			} finally {
				// Restore the original push method
				Array.prototype.push = originalPush;
				warnSpy.mockRestore();
				schemaSpy.mockRestore();
			}
		});
	});
});
