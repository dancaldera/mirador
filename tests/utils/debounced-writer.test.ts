import { beforeEach, describe, expect, it, vi } from "bun:test";
import { DebouncedWriter } from "../../src/utils/debounced-writer.js";

describe("DebouncedWriter", () => {
	let writer: DebouncedWriter<string>;
	let writeFn: vi.MockedFunction<(data: string) => Promise<void>>;

	beforeEach(() => {
		vi.clearAllMocks();
		writeFn = vi.fn().mockResolvedValue(undefined);
		writer = new DebouncedWriter(writeFn, 100);
	});

	describe("constructor", () => {
		it("should initialize with default delay", () => {
			const defaultWriter = new DebouncedWriter(writeFn);
			expect(defaultWriter).toBeInstanceOf(DebouncedWriter);
			expect(defaultWriter).toBeDefined();
		});

		it("should initialize with custom delay", () => {
			expect(writer).toBeInstanceOf(DebouncedWriter);
			expect(writer).toBeDefined();
		});
	});

	describe("write", () => {
		it("should update pending data", () => {
			writer.write("test data");

			expect((writer as any).pendingData).toBe("test data");
			expect((writer as any).isDirty).toBe(true);
		});
	});

	describe("flush", () => {
		it("should do nothing if not dirty", async () => {
			await writer.flush();

			expect(writeFn).not.toHaveBeenCalled();
		});

		it("should write data when dirty", async () => {
			(writer as any).pendingData = "test data";
			(writer as any).isDirty = true;

			await writer.flush();

			expect(writeFn).toHaveBeenCalledWith("test data");
		});

		it("should handle write errors gracefully", async () => {
			const consoleSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => {});
			writeFn.mockRejectedValue(new Error("Write failed"));

			(writer as any).pendingData = "test data";
			(writer as any).isDirty = true;

			await writer.flush();

			expect(consoleSpy).toHaveBeenCalledWith(
				"Debounced write failed:",
				expect.any(Error),
			);
		});
	});

	describe("cancel", () => {
		it("should reset state", () => {
			(writer as any).pendingData = "test data";
			(writer as any).isDirty = true;

			writer.cancel();

			expect((writer as any).pendingData).toBe(null);
			expect((writer as any).isDirty).toBe(false);
		});
	});
});
