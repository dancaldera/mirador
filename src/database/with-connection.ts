import { createDatabaseConnection } from "./connection.js";
import type { DatabaseConfig, DatabaseConnection } from "./types.js";

export async function withConnection<T>(
	config: DatabaseConfig,
	operation: (connection: DatabaseConnection) => Promise<T>,
): Promise<T> {
	const connection = createDatabaseConnection(config);
	await connection.connect();

	try {
		return await operation(connection);
	} finally {
		try {
			await connection.close();
		} catch {
			// ignore close errors during cleanup
		}
	}
}
