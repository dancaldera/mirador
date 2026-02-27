import { constants } from "node:fs";
import { access, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let dataDir = process.env.SEERDB_DATA_DIR ?? path.join(os.homedir(), ".seerdb");

export function resolveDataPath(filename: string): string {
	return path.join(dataDir, filename);
}

export function setPersistenceDataDirectory(dir: string): void {
	dataDir = dir;
}

export async function ensureDataDirectory(): Promise<void> {
	try {
		await mkdir(dataDir, { recursive: true });
	} catch (error) {
		throw new Error(
			`Failed to ensure data directory: ${(error as Error).message}`,
		);
	}
}

export async function fileExists(filePath: string): Promise<boolean> {
	try {
		await access(filePath, constants.F_OK);
		return true;
	} catch {
		return false;
	}
}
