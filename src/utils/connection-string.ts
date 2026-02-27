/**
 * Utilities for building database connection strings
 */

/**
 * Build a connection string from individual parameters
 * Handles special character encoding and validation
 */
export function buildConnectionString(params: {
	dbType: string;
	host?: string;
	port?: number | string;
	database?: string;
	user?: string;
	password?: string;
	connectionString?: string;
}): string {
	const { dbType, host, port, database, user, password, connectionString } =
		params;

	// If connectionString is provided directly, use it
	if (connectionString) {
		return connectionString;
	}

	// Validate required parameters
	if (!host && !database) {
		throw new Error(
			"Either host/database or connectionString must be provided",
		);
	}

	switch (dbType) {
		case "postgresql": {
			if (!user || !database) {
				throw new Error("PostgreSQL requires user and database parameters");
			}
			const encodedUser = encodeURIComponent(user);
			const encodedPassword =
				password && password.trim() !== ""
					? encodeURIComponent(password)
					: null;
			const portNum = port || 5432;

			if (encodedPassword) {
				return `postgresql://${encodedUser}:${encodedPassword}@${host}:${portNum}/${database}`;
			} else {
				return `postgresql://${encodedUser}@${host}:${portNum}/${database}`;
			}
		}

		case "mysql": {
			if (!user || !database) {
				throw new Error("MySQL requires user and database parameters");
			}
			const encodedUser = encodeURIComponent(user);
			const encodedPassword =
				password && password.trim() !== ""
					? encodeURIComponent(password)
					: null;
			const portNum = port || 3306;

			if (encodedPassword) {
				return `mysql://${encodedUser}:${encodedPassword}@${host}:${portNum}/${database}`;
			} else {
				return `mysql://${encodedUser}@${host}:${portNum}/${database}`;
			}
		}

		case "sqlite": {
			// SQLite uses a file path, not a traditional connection string
			return host || database || "";
		}

		default:
			throw new Error(`Unsupported database type: ${dbType}`);
	}
}
