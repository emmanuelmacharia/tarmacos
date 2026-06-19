/**
 * Environment configuration, validated once at startup so the process fails
 * fast (rather than per-request) if it is misconfigured.
 */
export interface Config {
	port: number;
	sharedSecret: string;
	gotenbergUrl: string;
	gotenbergTimeoutMs: number;
}

function required(name: string): string {
	const value = process.env[name];
	if (!value || value.trim().length === 0) {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value.trim();
}

function intWithDefault(name: string, fallback: number): number {
	const raw = process.env[name];
	if (!raw) return fallback;
	const parsed = Number.parseInt(raw, 10);
	if (Number.isNaN(parsed) || parsed <= 0) {
		throw new Error(`Environment variable ${name} must be a positive integer`);
	}
	return parsed;
}

export function loadConfig(): Config {
	return {
		port: intWithDefault('PORT', 8080),
		sharedSecret: required('RENDERER_SHARED_SECRET'),
		// trailing slash stripped so we can safely concatenate paths
		gotenbergUrl: required('GOTENBERG_URL').replace(/\/+$/, ''),
		gotenbergTimeoutMs: intWithDefault('GOTENBERG_TIMEOUT_MS', 30_000)
	};
}
