import { beforeEach, describe, expect, it, vi } from "bun:test";
import { nanoid } from "nanoid";
import type { ConnectionInfo } from "../../src/types/state.js";
import { DBType } from "../../src/types/state.js";
import {
	connectionExists,
	ensureUniqueId,
	findConnectionById,
	findConnectionByName,
	generateUniqueConnectionId,
	generateUniqueConnectionName,
	isConnectionIdUnique,
	isConnectionNameUnique,
	validateConnectionId,
	validateConnectionName,
	validateConnectionNameComplete,
} from "../../src/utils/id-generator.js";

// Mock nanoid
const mockNanoid = vi.fn((length?: number) =>
	length === 6 ? "short-id" : "long-id",
);
vi.mock("nanoid", () => ({
	nanoid: mockNanoid,
}));

// Mock loadConnections
const mockLoadConnections = vi.fn();
vi.mock("../../src/utils/persistence.js", () => ({
	loadConnections: mockLoadConnections,
}));

describe("id-generator utilities", () => {
	const mockConnections: ConnectionInfo[] = [
		{
			id: "existing-id-1",
			name: "Existing Connection 1",
			type: DBType.PostgreSQL,
			connectionString: "postgresql://user:pass@host/db1",
			createdAt: "2024-01-01T00:00:00Z",
			updatedAt: "2024-01-01T00:00:00Z",
		},
		{
			id: "existing-id-2",
			name: "Existing Connection 2",
			type: DBType.MySQL,
			connectionString: "mysql://user:pass@host/db2",
			createdAt: "2024-01-01T00:00:00Z",
			updatedAt: "2024-01-01T00:00:00Z",
		},
	];

	beforeEach(() => {
		vi.clearAllMocks();
		mockLoadConnections.mockResolvedValue({
			connections: mockConnections,
			version: "1.0",
		});
		mockNanoid.mockReturnValue("mocked-nanoid");
	});

	describe("generateUniqueConnectionId", () => {
		it("should return a unique ID on first attempt", async () => {
			mockNanoid.mockReturnValue("unique-id");

			const result = await generateUniqueConnectionId();

			expect(result).toBe("unique-id");
			expect(mockNanoid).toHaveBeenCalledTimes(1);
		});

		it("should retry until finding a unique ID", async () => {
			mockNanoid
				.mockReturnValueOnce("existing-id-1") // collision
				.mockReturnValueOnce("existing-id-2") // collision
				.mockReturnValue("unique-id"); // success

			const result = await generateUniqueConnectionId();

			expect(result).toBe("unique-id");
			expect(mockNanoid).toHaveBeenCalledTimes(3);
		});

		it("should use fallback ID generation after max attempts", async () => {
			// Mock Date.now
			const mockDate = 1234567890123;
			vi.spyOn(Date, "now").mockReturnValue(mockDate);

			// Mock nanoid to always return colliding IDs for regular calls, but different for length 6
			mockNanoid.mockImplementation((length?: number) => {
				if (length === 6) return "short-id";
				return "existing-id-1"; // always collide
			});

			const result = await generateUniqueConnectionId();

			expect(result).toBe(`conn_${mockDate}_short-id`);
		});

		it("should handle loadConnections errors gracefully", async () => {
			mockLoadConnections.mockRejectedValue(new Error("Load failed"));
			mockNanoid.mockReturnValue("any-id");

			const result = await generateUniqueConnectionId();

			expect(result).toBe("any-id");
		});
	});

	describe("isConnectionIdUnique", () => {
		it("should return true for unique ID", async () => {
			const result = await isConnectionIdUnique("new-id");

			expect(result).toBe(true);
		});

		it("should return false for existing ID", async () => {
			const result = await isConnectionIdUnique("existing-id-1");

			expect(result).toBe(false);
		});

		it("should return true when loadConnections fails", async () => {
			mockLoadConnections.mockRejectedValue(new Error("Load failed"));

			const result = await isConnectionIdUnique("any-id");

			expect(result).toBe(true);
		});
	});

	describe("validateConnectionId", () => {
		it("should validate empty string", () => {
			const result = validateConnectionId("");

			expect(result.isValid).toBe(false);
			expect(result.error).toBe("Connection ID must be a non-empty string");
		});

		it("should validate non-string input", () => {
			const result = validateConnectionId(123 as any);

			expect(result.isValid).toBe(false);
			expect(result.error).toBe("Connection ID must be a non-empty string");
		});

		it("should validate too short ID", () => {
			const result = validateConnectionId("short");

			expect(result.isValid).toBe(false);
			expect(result.error).toBe(
				"Connection ID must be at least 8 characters long",
			);
		});

		it("should validate too long ID", () => {
			const longId = "a".repeat(51);
			const result = validateConnectionId(longId);

			expect(result.isValid).toBe(false);
			expect(result.error).toBe(
				"Connection ID must be less than 50 characters long",
			);
		});

		it("should validate invalid characters", () => {
			const result = validateConnectionId("invalid@id");

			expect(result.isValid).toBe(false);
			expect(result.error).toBe(
				"Connection ID can only contain letters, numbers, hyphens, and underscores",
			);
		});

		it("should validate valid ID", () => {
			const result = validateConnectionId("valid-id_123");

			expect(result.isValid).toBe(true);
			expect(result.error).toBeUndefined();
		});
	});

	describe("ensureUniqueId", () => {
		it("should return valid unique ID as-is", async () => {
			const result = await ensureUniqueId("valid-unique-id");

			expect(result).toBe("valid-unique-id");
		});

		it("should generate new ID for invalid input", async () => {
			mockNanoid.mockReturnValue("generated-id");

			const result = await ensureUniqueId("invalid@id");

			expect(result).toBe("generated-id");
		});

		it("should append suffix for non-unique valid ID", async () => {
			const result = await ensureUniqueId("existing-id-1");

			expect(result).toBe("existing-id-1_1");
		});

		it("should generate new ID after max suffix attempts", async () => {
			// Mock many existing connections with numbered suffixes
			const manyConnections = Array.from({ length: 100 }, (_, i) => ({
				id: `test_${i + 1}`,
				name: `Test ${i + 1}`,
				type: DBType.PostgreSQL,
				connectionString: "postgresql://test",
				createdAt: "2024-01-01T00:00:00Z",
				updatedAt: "2024-01-01T00:00:00Z",
			}));

			mockLoadConnections.mockResolvedValue({
				connections: manyConnections,
				version: "1.0",
			});

			mockNanoid.mockReturnValue("fallback-id");

			const result = await ensureUniqueId("test");

			expect(result).toBe("fallback-id");
		});
	});

	describe("connectionExists", () => {
		it("should return false for empty ID", async () => {
			const result = await connectionExists("");

			expect(result).toBe(false);
		});

		it("should return true for existing connection", async () => {
			const result = await connectionExists("existing-id-1");

			expect(result).toBe(true);
		});

		it("should return false for non-existing connection", async () => {
			const result = await connectionExists("non-existing-id");

			expect(result).toBe(false);
		});

		it("should return false when loadConnections fails", async () => {
			mockLoadConnections.mockRejectedValue(new Error("Load failed"));

			const result = await connectionExists("any-id");

			expect(result).toBe(false);
		});
	});

	describe("findConnectionById", () => {
		it("should return null for empty ID", async () => {
			const result = await findConnectionById("");

			expect(result).toBe(null);
		});

		it("should return connection for existing ID", async () => {
			const result = await findConnectionById("existing-id-1");

			expect(result).toEqual(mockConnections[0]);
		});

		it("should return null for non-existing ID", async () => {
			const result = await findConnectionById("non-existing-id");

			expect(result).toBe(null);
		});

		it("should return null when loadConnections fails", async () => {
			mockLoadConnections.mockRejectedValue(new Error("Load failed"));

			const result = await findConnectionById("any-id");

			expect(result).toBe(null);
		});
	});

	describe("isConnectionNameUnique", () => {
		it("should return false for empty name", async () => {
			const result = await isConnectionNameUnique("");

			expect(result).toBe(false);
		});

		it("should return false for non-string name", async () => {
			const result = await isConnectionNameUnique(123 as any);

			expect(result).toBe(false);
		});

		it("should return true for unique name", async () => {
			const result = await isConnectionNameUnique("New Connection");

			expect(result).toBe(true);
		});

		it("should return false for existing name (case insensitive)", async () => {
			const result = await isConnectionNameUnique("existing connection 1");

			expect(result).toBe(false);
		});

		it("should exclude specified ID when checking uniqueness", async () => {
			const result = await isConnectionNameUnique(
				"Existing Connection 1",
				"existing-id-1",
			);

			expect(result).toBe(true);
		});

		it("should return true when loadConnections fails", async () => {
			mockLoadConnections.mockRejectedValue(new Error("Load failed"));

			const result = await isConnectionNameUnique("any-name");

			expect(result).toBe(true);
		});
	});

	describe("validateConnectionName", () => {
		it("should validate empty string", () => {
			const result = validateConnectionName("");

			expect(result.isValid).toBe(false);
			expect(result.error).toBe("Connection name must be a non-empty string");
		});

		it("should validate whitespace-only string", () => {
			const result = validateConnectionName("   ");

			expect(result.isValid).toBe(false);
			expect(result.error).toBe("Connection name cannot be empty");
		});

		it("should validate non-string input", () => {
			const result = validateConnectionName(123 as any);

			expect(result.isValid).toBe(false);
			expect(result.error).toBe("Connection name must be a non-empty string");
		});

		it("should validate too long name", () => {
			const longName = "a".repeat(101);
			const result = validateConnectionName(longName);

			expect(result.isValid).toBe(false);
			expect(result.error).toBe(
				"Connection name must be less than 100 characters long",
			);
		});

		it("should validate invalid characters", () => {
			const result = validateConnectionName("invalid<name>");

			expect(result.isValid).toBe(false);
			expect(result.error).toBe("Connection name contains invalid characters");
		});

		it("should validate generic system names", () => {
			const result = validateConnectionName("connection");

			expect(result.isValid).toBe(false);
			expect(result.error).toBe(
				"Connection name is too generic, please be more descriptive",
			);
		});

		it("should validate generic database names", () => {
			const result = validateConnectionName("database 123");

			expect(result.isValid).toBe(false);
			expect(result.error).toBe(
				"Connection name is too generic, please be more descriptive",
			);
		});

		it("should validate valid name", () => {
			const result = validateConnectionName("My PostgreSQL Database");

			expect(result.isValid).toBe(true);
			expect(result.error).toBeUndefined();
		});
	});

	describe("generateUniqueConnectionName", () => {
		it("should return valid unique name as-is", async () => {
			const result = await generateUniqueConnectionName(
				"Unique Name",
				DBType.PostgreSQL,
			);

			expect(result).toBe("Unique Name");
		});

		it("should use default name for invalid base name", async () => {
			const result = await generateUniqueConnectionName("", DBType.MySQL);

			expect(result).toBe("mysql Database");
		});

		it("should append suffix for non-unique name", async () => {
			const result = await generateUniqueConnectionName(
				"Existing Connection 1",
				DBType.PostgreSQL,
			);

			expect(result).toBe("Existing Connection 1 (2)");
		});

		it("should increment suffix until unique", async () => {
			mockLoadConnections.mockResolvedValue({
				connections: [
					...mockConnections,
					{
						id: "test-1",
						name: "Test",
						type: DBType.PostgreSQL,
						connectionString: "postgresql://test",
						createdAt: "2024-01-01T00:00:00Z",
						updatedAt: "2024-01-01T00:00:00Z",
					},
					{
						id: "test-2",
						name: "Test (2)",
						type: DBType.PostgreSQL,
						connectionString: "postgresql://test",
						createdAt: "2024-01-01T00:00:00Z",
						updatedAt: "2024-01-01T00:00:00Z",
					},
				],
				version: "1.0",
			});

			const result = await generateUniqueConnectionName(
				"Test",
				DBType.PostgreSQL,
			);

			expect(result).toBe("Test (3)");
		});

		it("should generate timestamp-based name after max suffix attempts", async () => {
			// Mock many existing connections with all possible suffixes
			const manyConnections: ConnectionInfo[] = [];
			// Add "Test" as taken
			manyConnections.push({
				id: "test-0",
				name: "Test",
				type: DBType.PostgreSQL,
				connectionString: "postgresql://test",
				createdAt: "2024-01-01T00:00:00Z",
				updatedAt: "2024-01-01T00:00:00Z",
			});
			// Add "Test (2)" through "Test (101)" as taken
			for (let i = 2; i <= 101; i++) {
				manyConnections.push({
					id: `test-${i}`,
					name: `Test (${i})`,
					type: DBType.PostgreSQL,
					connectionString: "postgresql://test",
					createdAt: "2024-01-01T00:00:00Z",
					updatedAt: "2024-01-01T00:00:00Z",
				});
			}

			mockLoadConnections.mockResolvedValue({
				connections: manyConnections,
				version: "1.0",
			});

			const mockDate = 1234567890123;
			const mockRandom = 0.5;
			vi.spyOn(Date, "now").mockReturnValue(mockDate);
			vi.spyOn(Math, "random").mockReturnValue(mockRandom);

			const result = await generateUniqueConnectionName(
				"Test",
				DBType.PostgreSQL,
			);

			expect(result).toBe(`Test (${mockDate}-500)`);
		});

		it("should exclude specified ID when checking uniqueness", async () => {
			const result = await generateUniqueConnectionName(
				"Existing Connection 1",
				DBType.PostgreSQL,
				"existing-id-1",
			);

			expect(result).toBe("Existing Connection 1");
		});
	});

	describe("findConnectionByName", () => {
		it("should return null for empty name", async () => {
			const result = await findConnectionByName("");

			expect(result).toBe(null);
		});

		it("should return connection for existing name (case insensitive)", async () => {
			const result = await findConnectionByName("EXISTING CONNECTION 1");

			expect(result).toEqual(mockConnections[0]);
		});

		it("should return null for non-existing name", async () => {
			const result = await findConnectionByName("Non-existing Connection");

			expect(result).toBe(null);
		});

		it("should return null when loadConnections fails", async () => {
			mockLoadConnections.mockRejectedValue(new Error("Load failed"));

			const result = await findConnectionByName("any-name");

			expect(result).toBe(null);
		});
	});

	describe("validateConnectionNameComplete", () => {
		it("should return format validation error", async () => {
			const result = await validateConnectionNameComplete("");

			expect(result.isValid).toBe(false);
			expect(result.error).toBe("Connection name must be a non-empty string");
		});

		it("should return uniqueness error with suggestion", async () => {
			const result = await validateConnectionNameComplete(
				"Existing Connection 1",
			);

			expect(result.isValid).toBe(false);
			expect(result.error).toBe(
				'A connection with the name "Existing Connection 1" already exists',
			);
			expect(result.suggestion).toBe("Existing Connection 1 (2)");
		});

		it("should return valid for unique name", async () => {
			const result = await validateConnectionNameComplete("New Unique Name");

			expect(result.isValid).toBe(true);
			expect(result.error).toBeUndefined();
			expect(result.suggestion).toBeUndefined();
		});

		it("should exclude specified ID when checking uniqueness", async () => {
			const result = await validateConnectionNameComplete(
				"Existing Connection 1",
				"existing-id-1",
			);

			expect(result.isValid).toBe(true);
		});
	});
});
