import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import {
	ensureDataDirectory,
	fileExists,
	resolveDataPath,
} from "./file-utils.js";

// Encryption key derivation - uses machine-specific salt
const ENCRYPTION_KEY_FILE = "encryption.key";
const ALGORITHM = "aes-256-gcm";

export async function getEncryptionKey(): Promise<Buffer> {
	const keyPath = resolveDataPath(ENCRYPTION_KEY_FILE);

	// Try to load existing key
	try {
		if (await fileExists(keyPath)) {
			const keyData = await readFile(keyPath);
			if (keyData.length === 32) {
				return keyData;
			}
		}
	} catch {
		// Key file doesn't exist or is invalid
	}

	// Generate new key
	const newKey = randomBytes(32);
	await ensureDataDirectory();
	await writeFile(keyPath, newKey);

	return newKey;
}

export async function encryptPassword(
	password: string,
): Promise<{ encrypted: string; iv: string; tag: string }> {
	const key = await getEncryptionKey();
	const iv = randomBytes(16);
	const cipher = createCipheriv(ALGORITHM, key, iv);

	let encrypted = cipher.update(password, "utf8", "hex");
	encrypted += cipher.final("hex");

	const tag = cipher.getAuthTag();

	return {
		encrypted,
		iv: iv.toString("hex"),
		tag: tag.toString("hex"),
	};
}

export async function decryptPassword(encryptedData: {
	encrypted: string;
	iv: string;
	tag: string;
}): Promise<string> {
	const key = await getEncryptionKey();
	const iv = Buffer.from(encryptedData.iv, "hex");
	const tag = Buffer.from(encryptedData.tag, "hex");

	const decipher = createDecipheriv(ALGORITHM, key, iv);
	decipher.setAuthTag(tag);

	let decrypted = decipher.update(encryptedData.encrypted, "hex", "utf8");
	decrypted += decipher.final("utf8");

	return decrypted;
}
