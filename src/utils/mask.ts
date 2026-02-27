export function maskPassword(connectionString: string): string {
	// Common connection string patterns
	const patterns = [
		/postgresql:\/\/([^:]+):([^@]+)@/, // postgresql://user:pass@host
		/mysql:\/\/([^:]+):([^@]+)@/, // mysql://user:pass@host
		/password=([^&;]+)/, // password=pass
		/\/\/([^:]+):([^@]+)@/, // //user:pass@host
	];

	let masked = connectionString;
	patterns.forEach((pattern) => {
		masked = masked.replace(pattern, (_, user, pass) => {
			const maskedPass = "*".repeat(Math.min(pass.length, 8));
			return `${user}:${maskedPass}@`;
		});
	});

	return masked;
}

export function extractPasswordFromConnectionString(
	connectionString: string,
): string | null {
	// Extract password from various connection string formats
	const patterns = [
		/postgresql:\/\/[^:]+:([^@]+)@/, // postgresql://user:pass@host
		/mysql:\/\/[^:]+:([^@]+)@/, // mysql://user:pass@host
		/password=([^&;]+)/, // password=pass
		/\/\/[^:]+:([^@]+)@/, // //user:pass@host
	];

	for (const pattern of patterns) {
		const match = connectionString.match(pattern);
		if (match && match[1]) {
			return match[1];
		}
	}

	return null;
}

export function restorePasswordToConnectionString(
	maskedConnectionString: string,
	password: string,
): string {
	// Replace masked password with actual password
	const patterns = [
		{
			masked: /postgresql:\/\/([^:]+):\*+@/,
			restore: (_: string, user: string) => `postgresql://${user}:${password}@`,
		},
		{
			masked: /postgres:\/\/([^:]+):\*+@/,
			restore: (_: string, user: string) => `postgres://${user}:${password}@`,
		},
		{
			masked: /postgres:([^:]+):\*+@([^/]+)/,
			restore: (_: string, user: string, host: string) =>
				`postgres:${user}:${password}@${host}`,
		},
		{
			masked: /postgres:\*+@([^/]+)/,
			restore: (_: string, host: string) =>
				`postgresql://postgres:${password}@${host}`,
		},
		{
			masked: /mysql:\/\/([^:]+):\*+@/,
			restore: (_: string, user: string) => `mysql://${user}:${password}@`,
		},
		{
			masked: /password=\*+/,
			restore: () => `password=${password}`,
		},
		{
			masked: /\/\/([^:]+):\*+@/,
			restore: (_: string, user: string) => `//${user}:${password}@`,
		},
	];

	for (const { masked, restore } of patterns) {
		if (masked.test(maskedConnectionString)) {
			return maskedConnectionString.replace(masked, restore);
		}
	}

	return maskedConnectionString;
}
