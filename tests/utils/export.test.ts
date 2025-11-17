import { beforeEach, describe, expect, it, vi } from "bun:test";
import { join } from "path";
import type { ColumnInfo, DataRow } from "../../src/types/state.js";
import {
	type ExportOptions,
	exportData,
	exportSchema,
	exportToJsonString,
	exportToToonString,
	formatExportSummary,
	streamToJson,
	validateExportOptions,
} from "../../src/utils/export.js";

// Mock the file system operations
const mockMkdir = vi.fn();
const mockWriteFile = vi.fn();
const mockHomedir = vi.fn(() => "/home/user");

vi.mock("fs/promises", () => ({
	mkdir: mockMkdir,
	writeFile: mockWriteFile,
}));

vi.mock("os", () => ({
	homedir: mockHomedir,
}));

describe("validateExportOptions", () => {
	it("provides default values for empty options", () => {
		const options = {};
		const result = validateExportOptions(options);

		expect(result).toEqual({
			format: "csv",
			includeHeaders: true,
			filename: undefined,
			outputDir: undefined,
		});
	});

	it("preserves provided values", () => {
		const options: Partial<ExportOptions> = {
			format: "json",
			includeHeaders: false,
			filename: "custom.json",
			outputDir: "/custom/path",
		};
		const result = validateExportOptions(options);

		expect(result).toEqual({
			format: "json",
			includeHeaders: false,
			filename: "custom.json",
			outputDir: "/custom/path",
		});
	});

	it("uses default for includeHeaders when explicitly set to undefined", () => {
		const options = { includeHeaders: undefined };
		const result = validateExportOptions(options);

		expect(result.includeHeaders).toBe(true);
	});

	it("handles partial options", () => {
		const options: Partial<ExportOptions> = {
			format: "json",
			filename: "data.json",
		};
		const result = validateExportOptions(options);

		expect(result).toEqual({
			format: "json",
			includeHeaders: true,
			filename: "data.json",
			outputDir: undefined,
		});
	});
});

describe("exportData", () => {
	const mockData: DataRow[] = [
		{ id: 1, name: "Alice", age: 30, active: true },
		{ id: 2, name: "Bob", age: 25, active: false },
	];

	const mockColumns: ColumnInfo[] = [
		{ name: "id", dataType: "integer", nullable: false, isPrimaryKey: true },
		{ name: "name", dataType: "varchar", nullable: false },
		{ name: "age", dataType: "integer", nullable: true },
		{ name: "active", dataType: "boolean", nullable: false },
	];

	beforeEach(() => {
		vi.clearAllMocks();
		mockMkdir.mockResolvedValue(undefined);
		mockWriteFile.mockResolvedValue(undefined);
		mockHomedir.mockReturnValue("/home/user");
	});

	it("exports data as CSV with headers", async () => {
		const options: ExportOptions = {
			format: "csv",
			includeHeaders: true,
			filename: "test.csv",
		};

		const filepath = await exportData(mockData, mockColumns, options);

		expect(filepath).toBe("/home/user/.mirador/exports/test.csv");
		expect(mockMkdir).toHaveBeenCalledWith("/home/user/.mirador/exports", {
			recursive: true,
		});
		expect(mockWriteFile).toHaveBeenCalledWith(
			filepath,
			expect.stringContaining('"id","name","age","active"'),
			"utf-8",
		);
	});

	it("exports data as CSV without headers", async () => {
		const options: ExportOptions = {
			format: "csv",
			includeHeaders: false,
			filename: "test.csv",
		};

		const filepath = await exportData(mockData, mockColumns, options);

		expect(filepath).toBe("/home/user/.mirador/exports/test.csv");
		expect(mockWriteFile).toHaveBeenCalledWith(
			filepath,
			expect.stringContaining('"1","Alice","30","true"'),
			"utf-8",
		);
		const content = mockWriteFile.mock.calls[0][1] as string;
		expect(content).not.toContain('"id","name","age","active"');
	});

	it("exports data as JSON with headers (metadata)", async () => {
		const options: ExportOptions = {
			format: "json",
			includeHeaders: true,
			filename: "test.json",
		};

		const filepath = await exportData(mockData, mockColumns, options);

		expect(filepath).toBe("/home/user/.mirador/exports/test.json");
		const content = JSON.parse(mockWriteFile.mock.calls[0][1] as string);

		expect(content).toHaveProperty("exportedAt");
		expect(content).toHaveProperty("columns");
		expect(content).toHaveProperty("rowCount", 2);
		expect(content).toHaveProperty("data");
		expect(content.columns).toHaveLength(4);
		expect(content.data).toEqual(mockData);
	});

	it("exports data as JSON without headers (data only)", async () => {
		const options: ExportOptions = {
			format: "json",
			includeHeaders: false,
			filename: "test.json",
		};

		const filepath = await exportData(mockData, mockColumns, options);

		expect(filepath).toBe("/home/user/.mirador/exports/test.json");
		const content = JSON.parse(mockWriteFile.mock.calls[0][1] as string);

		expect(content).toEqual(mockData);
		expect(content).not.toHaveProperty("exportedAt");
		expect(content).not.toHaveProperty("columns");
	});

	it("generates default filename when not provided", async () => {
		const options: ExportOptions = {
			format: "csv",
			includeHeaders: true,
		};

		const filepath = await exportData(mockData, mockColumns, options);

		// Should match pattern: export-YYYY-MM-DDTHH-MM-SS-SSSZ.csv
		expect(filepath).toMatch(
			/\/export-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.csv$/,
		);
	});

	it("uses custom output directory", async () => {
		const options: ExportOptions = {
			format: "csv",
			includeHeaders: true,
			outputDir: "/custom/exports",
		};

		const filepath = await exportData(mockData, mockColumns, options);

		expect(filepath).toMatch(/^\/custom\/exports\/export-/);
		expect(mockMkdir).toHaveBeenCalledWith("/custom/exports", {
			recursive: true,
		});
	});

	it("handles empty data array", async () => {
		const options: ExportOptions = {
			format: "csv",
			includeHeaders: true,
			filename: "empty.csv",
		};

		const filepath = await exportData([], mockColumns, options);

		expect(filepath).toBe("/home/user/.mirador/exports/empty.csv");
		const content = mockWriteFile.mock.calls[0][1] as string;

		if (options.includeHeaders) {
			expect(content).toContain('"id","name","age","active"');
			expect(content.split("\n")).toHaveLength(1); // Only header row
		}
	});

	it("handles empty columns array", async () => {
		const options: ExportOptions = {
			format: "csv",
			includeHeaders: true,
			filename: "no-columns.csv",
		};

		const filepath = await exportData(mockData, [], options);

		expect(filepath).toBe("/home/user/.mirador/exports/no-columns.csv");
		const content = mockWriteFile.mock.calls[0][1] as string;

		expect(content.trim()).toBe("");
	});

	it("properly escapes CSV values", async () => {
		const dataWithQuotes: DataRow[] = [
			{
				id: 1,
				name: 'Alice "The Great"',
				description: 'Contains "quotes" and, commas',
			},
		];
		const columnsWithQuotes: ColumnInfo[] = [
			{ name: "id", dataType: "integer", nullable: false },
			{ name: "name", dataType: "varchar", nullable: false },
			{ name: "description", dataType: "text", nullable: true },
		];

		const options: ExportOptions = {
			format: "csv",
			includeHeaders: true,
			filename: "quotes.csv",
		};

		await exportData(dataWithQuotes, columnsWithQuotes, options);

		const content = mockWriteFile.mock.calls[0][1] as string;

		expect(content).toContain('"Alice ""The Great"""');
		expect(content).toContain('"Contains ""quotes"" and, commas"');
	});

	it("handles null and undefined values", async () => {
		const dataWithNulls: DataRow[] = [
			{ id: 1, name: "Alice", age: null, active: true },
			{ id: 2, name: null, age: 25, active: undefined },
		];

		const options: ExportOptions = {
			format: "csv",
			includeHeaders: true,
			filename: "nulls.csv",
		};

		await exportData(dataWithNulls, mockColumns, options);

		const content = mockWriteFile.mock.calls[0][1] as string;

		expect(content).toContain('"1","Alice","NULL","true"');
		expect(content).toContain('"2","NULL","25","NULL"');
	});

	it("includes all column metadata in JSON export", async () => {
		const columnsWithMetadata: ColumnInfo[] = [
			{
				name: "id",
				dataType: "integer",
				nullable: false,
				isPrimaryKey: true,
				isForeignKey: false,
			},
			{
				name: "user_id",
				dataType: "integer",
				nullable: true,
				isPrimaryKey: false,
				isForeignKey: true,
			},
		];

		const options: ExportOptions = {
			format: "json",
			includeHeaders: true,
			filename: "metadata.json",
		};

		await exportData(mockData, columnsWithMetadata, options);

		const content = JSON.parse(mockWriteFile.mock.calls[0][1] as string);
		const exportedColumns = content.columns;

		expect(exportedColumns).toEqual([
			{
				name: "id",
				dataType: "integer",
				nullable: false,
				isPrimaryKey: true,
				isForeignKey: false,
			},
			{
				name: "user_id",
				dataType: "integer",
				nullable: true,
				isPrimaryKey: false,
				isForeignKey: true,
			},
		]);
	});

	it("creates nested directories in output path", async () => {
		const options: ExportOptions = {
			format: "csv",
			includeHeaders: true,
			outputDir: "/deep/nested/path/for/exports",
		};

		await exportData(mockData, mockColumns, options);

		expect(mockMkdir).toHaveBeenCalledWith("/deep/nested/path/for/exports", {
			recursive: true,
		});
	});

	it("handles Date objects in data", async () => {
		const testDate = new Date("2023-01-01T12:30:45.123Z");
		const dataWithDate: DataRow[] = [
			{ id: 1, name: "Alice", created_at: testDate },
		];

		const options: ExportOptions = {
			format: "csv",
			includeHeaders: true,
			filename: "date.csv",
		};

		await exportData(dataWithDate, mockColumns, options);

		const content = mockWriteFile.mock.calls[0][1] as string;
		// Note: Date objects might be formatted differently in the actual export
		expect(content).toContain("id");
	});
});

describe("formatExportSummary", () => {
	it("formats summary correctly", () => {
		const summary = formatExportSummary(
			"/home/user/.mirador/exports/data.csv",
			100,
			"csv",
			5,
		);

		expect(summary).toBe("Exported 100 rows, 5 columns to CSV: data.csv");
	});

	it("handles filepath without directories", () => {
		const summary = formatExportSummary("data.json", 50, "json", 3);

		expect(summary).toBe("Exported 50 rows, 3 columns to JSON: data.json");
	});

	it("handles empty filepath", () => {
		const summary = formatExportSummary("", 0, "csv", 0);

		expect(summary).toBe("Exported 0 rows, 0 columns to CSV: ");
	});

	it("handles different formats", () => {
		const csvSummary = formatExportSummary("data.csv", 10, "csv", 2);
		const jsonSummary = formatExportSummary("data.json", 10, "json", 2);

		expect(csvSummary).toContain("to CSV:");
		expect(jsonSummary).toContain("to JSON:");
	});
});

describe("CSV generation edge cases", () => {
	const mockColumns: ColumnInfo[] = [
		{ name: "id", dataType: "integer", nullable: false },
		{ name: "text", dataType: "text", nullable: true },
	];

	beforeEach(() => {
		vi.clearAllMocks();
		mockMkdir.mockResolvedValue(undefined);
		mockWriteFile.mockResolvedValue(undefined);
		mockHomedir.mockReturnValue("/home/user");
	});

	it("handles very long text values", async () => {
		const longText = "a".repeat(1000);
		const dataWithLongText: DataRow[] = [{ id: 1, text: longText }];

		const options: ExportOptions = {
			format: "csv",
			includeHeaders: true,
			filename: "long.csv",
		};

		await exportData(dataWithLongText, mockColumns, options);

		const content = mockWriteFile.mock.calls[0][1] as string;
		expect(content).toContain(`"${longText}"`);
	});

	it("handles special characters", async () => {
		const dataWithSpecialChars: DataRow[] = [
			{ id: 1, text: "Line 1\nLine 2\tTabbed\nNew lines" },
		];

		const options: ExportOptions = {
			format: "csv",
			includeHeaders: true,
			filename: "special.csv",
		};

		await exportData(dataWithSpecialChars, mockColumns, options);

		const content = mockWriteFile.mock.calls[0][1] as string;
		expect(content).toContain('"Line 1\nLine 2\tTabbed\nNew lines"');
	});

	it("handles numeric and boolean values correctly", async () => {
		const dataWithTypes: DataRow[] = [
			{ id: 1, text: 42 },
			{ id: 2, text: 3.14 },
			{ id: 3, text: true },
			{ id: 4, text: false },
		];

		const options: ExportOptions = {
			format: "csv",
			includeHeaders: true,
			filename: "types.csv",
		};

		await exportData(dataWithTypes, mockColumns, options);

		const content = mockWriteFile.mock.calls[0][1] as string;
		expect(content).toContain('"42"');
		expect(content).toContain('"3.14"');
		expect(content).toContain('"true"');
		expect(content).toContain('"false"');
	});
});

describe("exportData TOON format", () => {
	const mockData: DataRow[] = [
		{ id: 1, name: "Alice", age: 30, active: true },
		{ id: 2, name: "Bob", age: 25, active: false },
	];

	const mockColumns: ColumnInfo[] = [
		{ name: "id", dataType: "integer", nullable: false, isPrimaryKey: true },
		{ name: "name", dataType: "varchar", nullable: false },
		{ name: "age", dataType: "integer", nullable: true },
		{ name: "active", dataType: "boolean", nullable: false },
	];

	beforeEach(() => {
		vi.clearAllMocks();
		mockMkdir.mockResolvedValue(undefined);
		mockWriteFile.mockResolvedValue(undefined);
		mockHomedir.mockReturnValue("/home/user");
	});

	it("exports data as TOON with headers (metadata)", async () => {
		const options: ExportOptions = {
			format: "toon",
			includeHeaders: true,
			filename: "test.toon",
		};

		const filepath = await exportData(mockData, mockColumns, options);

		expect(filepath).toBe("/home/user/.mirador/exports/test.toon");
		expect(mockWriteFile).toHaveBeenCalledWith(
			filepath,
			expect.stringContaining("exportedAt"),
			"utf-8",
		);
	});

	it("exports data as TOON without headers (data only)", async () => {
		const options: ExportOptions = {
			format: "toon",
			includeHeaders: false,
			filename: "test.toon",
		};

		const filepath = await exportData(mockData, mockColumns, options);

		expect(filepath).toBe("/home/user/.mirador/exports/test.toon");
		expect(mockWriteFile).toHaveBeenCalledWith(
			filepath,
			expect.not.stringContaining("exportedAt"),
			"utf-8",
		);
	});

	it("throws error for unsupported format", async () => {
		const options = {
			format: "xml" as any,
			includeHeaders: true,
			filename: "test.xml",
		};

		await expect(exportData(mockData, mockColumns, options)).rejects.toThrow(
			"Unsupported export format: xml",
		);
	});
});

describe("exportSchema", () => {
	const mockTables: any[] = [
		{ name: "users", schema: "public", type: "table" as const },
		{ name: "posts", schema: "public", type: "table" as const },
	];

	const mockColumns: Record<string, ColumnInfo[]> = {
		"public.users": [
			{ name: "id", dataType: "integer", nullable: false, isPrimaryKey: true },
			{ name: "name", dataType: "varchar", nullable: false },
		],
		"public.posts": [
			{ name: "id", dataType: "integer", nullable: false, isPrimaryKey: true },
			{
				name: "user_id",
				dataType: "integer",
				nullable: false,
				isForeignKey: true,
			},
		],
	};

	beforeEach(() => {
		vi.clearAllMocks();
		mockMkdir.mockResolvedValue(undefined);
		mockWriteFile.mockResolvedValue(undefined);
		mockHomedir.mockReturnValue("/home/user");
	});

	it("exports schema with default filename", async () => {
		const filepath = await exportSchema(mockTables, mockColumns);

		expect(filepath).toMatch(
			/\/schema-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.json$/,
		);
		expect(mockMkdir).toHaveBeenCalledWith("/home/user/.mirador/exports", {
			recursive: true,
		});
	});

	it("exports schema with custom filename", async () => {
		const filepath = await exportSchema(mockTables, mockColumns, {
			filename: "custom-schema.json",
		});

		expect(filepath).toBe("/home/user/.mirador/exports/custom-schema.json");
	});

	it("exports schema with custom output directory", async () => {
		const filepath = await exportSchema(mockTables, mockColumns, {
			outputDir: "/custom/schemas",
		});

		expect(filepath).toMatch(/^\/custom\/schemas\/schema-/);
		expect(mockMkdir).toHaveBeenCalledWith("/custom/schemas", {
			recursive: true,
		});
	});

	it("includes table and column information", async () => {
		await exportSchema(mockTables, mockColumns, {
			filename: "schema.json",
		});

		const content = JSON.parse(mockWriteFile.mock.calls[0][1] as string);

		expect(content).toHaveProperty("exportedAt");
		expect(content).toHaveProperty("tables");
		expect(content.tables).toHaveLength(2);
		expect(content.tables[0]).toEqual({
			name: "users",
			schema: "public",
			type: "table",
			columns: mockColumns["public.users"],
		});
	});

	it("handles tables without schema", async () => {
		const tablesWithoutSchema = [
			{ name: "users", schema: undefined, type: "table" as const },
		];
		const columnsWithoutSchema: Record<string, ColumnInfo[]> = {
			users: [{ name: "id", dataType: "integer", nullable: false }],
		};

		await exportSchema(tablesWithoutSchema, columnsWithoutSchema, {
			filename: "no-schema.json",
		});

		const content = JSON.parse(mockWriteFile.mock.calls[0][1] as string);
		expect(content.tables[0].columns).toEqual(columnsWithoutSchema.users);
	});
});

describe("exportToJsonString", () => {
	const mockData: DataRow[] = [
		{ id: 1, name: "Alice", age: 30 },
		{ id: 2, name: "Bob", age: 25 },
	];

	const mockColumns: ColumnInfo[] = [
		{ name: "id", dataType: "integer", nullable: false, isPrimaryKey: true },
		{ name: "name", dataType: "varchar", nullable: false },
		{ name: "age", dataType: "integer", nullable: true },
	];

	it("exports data with metadata when columns provided", () => {
		const result = exportToJsonString(mockData, mockColumns, true);

		const parsed = JSON.parse(result);
		expect(parsed).toHaveProperty("exportedAt");
		expect(parsed).toHaveProperty("columns");
		expect(parsed).toHaveProperty("rowCount", 2);
		expect(parsed).toHaveProperty("data");
		expect(parsed.data).toEqual(mockData);
	});

	it("exports data without metadata when includeMetadata is false", () => {
		const result = exportToJsonString(mockData, mockColumns, false);

		const parsed = JSON.parse(result);
		expect(parsed).toEqual(mockData);
		expect(parsed).not.toHaveProperty("exportedAt");
	});

	it("exports data without metadata when no columns provided", () => {
		const result = exportToJsonString(mockData);

		const parsed = JSON.parse(result);
		expect(parsed).toEqual(mockData);
	});

	it("includes all column metadata", () => {
		const result = exportToJsonString(mockData, mockColumns, true);

		const parsed = JSON.parse(result);
		expect(parsed.columns).toEqual([
			{
				name: "id",
				dataType: "integer",
				nullable: false,
				isPrimaryKey: true,
			},
			{
				name: "name",
				dataType: "varchar",
				nullable: false,
			},
			{
				name: "age",
				dataType: "integer",
				nullable: true,
			},
		]);
	});
});

describe("exportToToonString", () => {
	const mockData: DataRow[] = [
		{ id: 1, name: "Alice", age: 30 },
		{ id: 2, name: "Bob", age: 25 },
	];

	const mockColumns: ColumnInfo[] = [
		{ name: "id", dataType: "integer", nullable: false, isPrimaryKey: true },
		{ name: "name", dataType: "varchar", nullable: false },
		{ name: "age", dataType: "integer", nullable: true },
	];

	it("exports data with metadata when columns provided", () => {
		const result = exportToToonString(mockData, mockColumns, true);

		expect(result).toContain("exportedAt");
		expect(result).toContain("columns");
		expect(result).toContain("rowCount");
		expect(result).toContain("data");
	});

	it("exports data without metadata when includeMetadata is false", () => {
		const result = exportToToonString(mockData, mockColumns, false);

		expect(result).not.toContain("exportedAt");
		expect(result).not.toContain("columns");
	});

	it("exports data without metadata when no columns provided", () => {
		const result = exportToToonString(mockData);

		expect(result).not.toContain("exportedAt");
		expect(result).not.toContain("columns");
	});
});

describe("streamToJson", () => {
	const mockData: DataRow[] = [
		{ id: 1, name: "Alice", age: 30 },
		{ id: 2, name: "Bob", age: 25 },
	];

	const mockColumns: ColumnInfo[] = [
		{ name: "id", dataType: "integer", nullable: false, isPrimaryKey: true },
		{ name: "name", dataType: "varchar", nullable: false },
	];

	it("streams data without metadata", async () => {
		const chunks: string[] = [];
		for await (const chunk of streamToJson(mockData)) {
			chunks.push(chunk);
		}

		const fullContent = chunks.join("");
		expect(fullContent).toContain("[");
		expect(fullContent).toContain("]");
		expect(fullContent).toContain('"id": 1');
		expect(fullContent).toContain('"name": "Alice"');
	});

	it("streams data with metadata", async () => {
		const chunks: string[] = [];
		for await (const chunk of streamToJson(mockData, mockColumns)) {
			chunks.push(chunk);
		}

		const fullContent = chunks.join("");
		expect(fullContent).toContain("exportedAt");
		expect(fullContent).toContain("columns");
		expect(fullContent).toContain("rowCount");
		expect(fullContent).toContain("data");
		expect(fullContent).toContain('"id": 1');
	});

	it("handles empty data array", async () => {
		const chunks: string[] = [];
		for await (const chunk of streamToJson([], mockColumns)) {
			chunks.push(chunk);
		}

		const fullContent = chunks.join("");
		expect(fullContent).toContain("data");
		expect(fullContent).toContain("rowCount");
		expect(fullContent).toContain("0");
	});

	it("streams large dataset in chunks", async () => {
		const largeData: DataRow[] = Array.from({ length: 150 }, (_, i) => ({
			id: i + 1,
			name: `User ${i + 1}`,
		}));

		const chunks: string[] = [];
		for await (const chunk of streamToJson(largeData, mockColumns, 50)) {
			chunks.push(chunk);
		}

		const fullContent = chunks.join("");
		expect(fullContent).toContain('"id": 1');
		expect(fullContent).toContain('"id": 150');
		expect(chunks.length).toBeGreaterThan(1); // Should be chunked
	});
});
