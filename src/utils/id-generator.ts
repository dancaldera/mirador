import { nanoid } from "nanoid";
import { DBType } from "../types/state.js";
import { loadConnections } from "./persistence.js";

/**
 * Connection ID and Name utility functions
 */

export interface NameValidationResult {
	isValid: boolean;
	error?: string;
	suggestion?: string;
}

export interface IdValidationResult {
	isValid: boolean;
	error?: string;
}

/**
 * Generate a unique connection ID
 * Ensures the ID doesn't collide with existing connection IDs
 */
export async function generateUniqueConnectionId(): Promise<string> {
	const maxAttempts = 10;
	let attempts = 0;

	while (attempts < maxAttempts) {
		const id = nanoid();

		// Check if ID is unique
		if (await isConnectionIdUnique(id)) {
			return id;
		}

		attempts++;
	}

	// Fallback: generate with timestamp if nanoid keeps colliding
	const timestamp = Date.now();
	const randomId = nanoid(6);
	return `conn_${timestamp}_${randomId}`;
}

/**
 * Check if a connection ID is unique among existing connections
 */
export async function isConnectionIdUnique(id: string): Promise<boolean> {
	try {
		const connectionsResult = await loadConnections();
		return !connectionsResult.connections.some((conn) => conn.id === id);
	} catch {
		// If we can't load connections, assume the ID is unique
		return true;
	}
}

/**
 * Validate connection ID format
 */
export function validateConnectionId(id: string): IdValidationResult {
	if (!id || typeof id !== "string") {
		return {
			isValid: false,
			error: "Connection ID must be a non-empty string",
		};
	}

	if (id.length < 8) {
		return {
			isValid: false,
			error: "Connection ID must be at least 8 characters long",
		};
	}

	if (id.length > 50) {
		return {
			isValid: false,
			error: "Connection ID must be less than 50 characters long",
		};
	}

	// Allow alphanumeric characters, hyphens, and underscores
	const validPattern = /^[a-zA-Z0-9_-]+$/;
	if (!validPattern.test(id)) {
		return {
			isValid: false,
			error:
				"Connection ID can only contain letters, numbers, hyphens, and underscores",
		};
	}

	return { isValid: true };
}

/**
 * Ensure a connection ID is unique, modifying it if necessary
 */
export async function ensureUniqueId(id: string): Promise<string> {
	const validation = validateConnectionId(id);
	if (!validation.isValid) {
		// If invalid, generate a new unique ID
		return await generateUniqueConnectionId();
	}

	// Check if it's unique
	if (await isConnectionIdUnique(id)) {
		return id;
	}

	// If not unique, append a suffix
	let suffix = 1;
	let newId = `${id}_${suffix}`;

	while (!(await isConnectionIdUnique(newId)) && suffix < 100) {
		suffix++;
		newId = `${id}_${suffix}`;
	}

	// If still not unique after many attempts, generate a new one
	if (!(await isConnectionIdUnique(newId))) {
		return await generateUniqueConnectionId();
	}

	return newId;
}

/**
 * Check if a connection ID exists in saved connections
 */
export async function connectionExists(id: string): Promise<boolean> {
	if (!id) return false;

	try {
		const connectionsResult = await loadConnections();
		return connectionsResult.connections.some((conn) => conn.id === id);
	} catch {
		return false;
	}
}

/**
 * Find a connection by ID
 */
export async function findConnectionById(id: string) {
	if (!id) return null;

	try {
		const connectionsResult = await loadConnections();
		return connectionsResult.connections.find((conn) => conn.id === id) || null;
	} catch {
		return null;
	}
}

/**
 * Check if a connection name is unique (case-insensitive)
 */
export async function isConnectionNameUnique(
	name: string,
	excludeId?: string,
): Promise<boolean> {
	if (!name || typeof name !== "string") return false;

	try {
		const connectionsResult = await loadConnections();
		const normalizedName = name.trim().toLowerCase();

		return !connectionsResult.connections.some(
			(conn) =>
				conn.id !== excludeId &&
				conn.name.trim().toLowerCase() === normalizedName,
		);
	} catch {
		// If we can't load connections, assume the name is unique
		return true;
	}
}

/**
 * Validate connection name format and rules
 */
export function validateConnectionName(name: string): NameValidationResult {
	if (!name || typeof name !== "string") {
		return {
			isValid: false,
			error: "Connection name must be a non-empty string",
		};
	}

	const trimmedName = name.trim();

	if (trimmedName.length === 0) {
		return {
			isValid: false,
			error: "Connection name cannot be empty",
		};
	}

	if (trimmedName.length > 100) {
		return {
			isValid: false,
			error: "Connection name must be less than 100 characters long",
		};
	}

	// Check for invalid characters that might cause issues
	const invalidPattern = /[<>:"/\\|?*]/;
	if (invalidPattern.test(trimmedName)) {
		return {
			isValid: false,
			error: "Connection name contains invalid characters",
		};
	}

	// Names that look like system-generated should be avoided
	const systemPattern = /^(connection|database|db)\s*\d*$/i;
	if (systemPattern.test(trimmedName)) {
		return {
			isValid: false,
			error: "Connection name is too generic, please be more descriptive",
		};
	}

	return { isValid: true };
}

/**
 * Generate a unique connection name with automatic suffix resolution
 */
export async function generateUniqueConnectionName(
	baseName: string,
	type: DBType,
	excludeId?: string,
): Promise<string> {
	const validation = validateConnectionName(baseName);
	if (!validation.isValid) {
		// If invalid, generate a better default name
		baseName = `${type} Database`;
	}

	// Check if the base name is unique
	if (await isConnectionNameUnique(baseName, excludeId)) {
		return baseName.trim();
	}

	// If not unique, try adding numbered suffixes
	let suffix = 2;
	let uniqueName = `${baseName} (${suffix})`;

	while (
		!(await isConnectionNameUnique(uniqueName, excludeId)) &&
		suffix < 100
	) {
		suffix++;
		uniqueName = `${baseName} (${suffix})`;
	}

	// If still not unique after many attempts, generate a more unique name
	if (!(await isConnectionNameUnique(uniqueName, excludeId))) {
		const timestamp = Date.now();
		const randomSuffix = Math.floor(Math.random() * 1000);
		uniqueName = `${baseName} (${timestamp}-${randomSuffix})`;
	}

	return uniqueName.trim();
}

/**
 * Find a connection by name (case-insensitive)
 */
export async function findConnectionByName(name: string) {
	if (!name) return null;

	try {
		const connectionsResult = await loadConnections();
		const normalizedName = name.trim().toLowerCase();
		return (
			connectionsResult.connections.find(
				(conn) => conn.name.trim().toLowerCase() === normalizedName,
			) || null
		);
	} catch {
		return null;
	}
}

/**
 * Validate both connection name format and uniqueness
 */
export async function validateConnectionNameComplete(
	name: string,
	excludeId?: string,
): Promise<NameValidationResult> {
	// First validate format
	const formatValidation = validateConnectionName(name);
	if (!formatValidation.isValid) {
		return formatValidation;
	}

	// Then check uniqueness
	const isUnique = await isConnectionNameUnique(name, excludeId);
	if (!isUnique) {
		// Generate a suggestion
		const existingConnection = await findConnectionByName(name);
		const type = existingConnection?.type || DBType.PostgreSQL;
		const suggestion = await generateUniqueConnectionName(
			name,
			type,
			excludeId,
		);

		return {
			isValid: false,
			error: `A connection with the name "${name.trim()}" already exists`,
			suggestion,
		};
	}

	return { isValid: true };
}
