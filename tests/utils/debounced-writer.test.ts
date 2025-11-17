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
			expect((defaultWriter as any).delay).toBe(500); // Default delay
		});

		it("should initialize with custom delay", () => {
			expect(writer).toBeInstanceOf(DebouncedWriter);
			expect(writer).toBeDefined();
			expect((writer as any).delay).toBe(100);
		});

		it("should initialize with correct initial state", () => {
			expect((writer as any).timer).toBe(null);
			expect((writer as any).pendingData).toBe(null);
			expect((writer as any).isWriting).toBe(false);
			expect((writer as any).isDirty).toBe(false);
		});
	});

	describe("write", () => {
		it("should update pending data", () => {
			writer.write("test data");

			expect((writer as any).pendingData).toBe("test data");
			expect((writer as any).isDirty).toBe(true);
		});

		it("should schedule flush after delay", async () => {
			const fastWriter = new DebouncedWriter(writeFn, 0);

			fastWriter.write("test data");

			expect(writeFn).not.toHaveBeenCalled();

			// Wait for next tick
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(writeFn).toHaveBeenCalledWith("test data");
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

		it("should clear pending timer", () => {
			writer.write("test data");
			expect((writer as any).timer).not.toBe(null);

			writer.cancel();

			expect((writer as any).timer).toBe(null);
		});
	});

	describe("debouncing behavior", () => {
		it("should debounce multiple writes", async () => {
			const fastWriter = new DebouncedWriter(writeFn, 50);

			fastWriter.write("first");
			fastWriter.write("second");
			fastWriter.write("third");

			expect(writeFn).not.toHaveBeenCalled();

			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(writeFn).toHaveBeenCalledTimes(1);
			expect(writeFn).toHaveBeenCalledWith("third");
		});

		it("should handle concurrent flushes", async () => {
			const fastWriter = new DebouncedWriter(writeFn, 0);
			let writeCount = 0;
			writeFn.mockImplementation(async () => {
				writeCount++;
				if (writeCount === 1) {
					// Trigger another write while first is still writing
					fastWriter.write("during write");
					// Wait a bit to ensure the second write gets scheduled
					await new Promise((resolve) => setTimeout(resolve, 10));
				}
			});

			fastWriter.write("first");
			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(writeFn).toHaveBeenCalledTimes(2);
			expect(writeFn).toHaveBeenNthCalledWith(1, "first");
			expect(writeFn).toHaveBeenNthCalledWith(2, "during write");
		});
	});
});
