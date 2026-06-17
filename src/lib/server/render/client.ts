import { env } from '$env/dynamic/private';
import {
	RENDERER_API_VERSION,
	type RenderErrorPayload,
	type RenderRequest,
	type RenderResult
} from './types';

/** Error thrown by the renderer client. `retryable` reflects the failed attempt. */
export class RendererClientError extends Error {
	readonly code: string;
	readonly status?: number;
	readonly retryable: boolean;
	readonly details?: unknown;

	constructor(opts: {
		code: string;
		message: string;
		status?: number;
		retryable: boolean;
		details?: unknown;
	}) {
		super(opts.message);
		this.name = 'RendererClientError';
		this.code = opts.code;
		this.status = opts.status;
		this.retryable = opts.retryable;
		this.details = opts.details;
	}
}

interface RenderOptions {
	/** Total attempts including the first. Default 3. */
	maxAttempts?: number;
	/** Per-attempt timeout in ms. Default 30000. */
	timeoutMs?: number;
	/** Base backoff in ms (exponential). Default 300. */
	backoffBaseMs?: number;
}

function resolveConfig(): { url: string; secret: string } {
	const url = env.RENDERER_URL;
	const secret = env.RENDERER_SHARED_SECRET;
	if (!url || !secret) {
		throw new RendererClientError({
			code: 'RENDERER_NOT_CONFIGURED',
			message: 'RENDERER_URL and RENDERER_SHARED_SECRET must be set',
			retryable: false
		});
	}
	return { url: url.replace(/\/+$/, ''), secret };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function parseFileName(disposition: string | null): string | undefined {
	if (!disposition) return undefined;
	const match = /filename="?([^"]+)"?/.exec(disposition);
	return match?.[1];
}

async function attempt(
	url: string,
	secret: string,
	req: RenderRequest,
	timeoutMs: number
): Promise<RenderResult> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);

	let response: Response;
	try {
		response = await fetch(`${url}/${RENDERER_API_VERSION}/render`, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${secret}`,
				'content-type': 'application/json'
			},
			body: JSON.stringify(req),
			signal: controller.signal
		});
	} catch (err) {
		const aborted = err instanceof Error && err.name === 'AbortError';
		throw new RendererClientError({
			code: aborted ? 'RENDERER_TIMEOUT' : 'RENDERER_UNREACHABLE',
			message: aborted ? 'Renderer request timed out' : 'Could not reach renderer',
			retryable: true,
			details: aborted ? undefined : String(err)
		});
	} finally {
		clearTimeout(timer);
	}

	if (!response.ok) {
		const payload = (await response.json().catch(() => null)) as {
			error?: RenderErrorPayload;
		} | null;
		// 5xx is transient; 4xx is a bad request we should not retry.
		throw new RendererClientError({
			code: payload?.error?.code ?? 'RENDERER_ERROR',
			message: payload?.error?.message ?? `Renderer returned ${response.status}`,
			status: response.status,
			retryable: response.status >= 500,
			details: payload?.error?.details
		});
	}

	const bytes = new Uint8Array(await response.arrayBuffer());
	return {
		bytes,
		contentType: response.headers.get('content-type') ?? 'application/octet-stream',
		fileName: parseFileName(response.headers.get('content-disposition'))
	};
}

/**
 * Render a document via the renderer service, with bounded exponential backoff
 * on transient (network/timeout/5xx) failures. Non-retryable errors (bad
 * request, auth, not-configured) throw immediately.
 */
export async function renderDocument(
	req: RenderRequest,
	options: RenderOptions = {}
): Promise<RenderResult> {
	const { url, secret } = resolveConfig();
	const maxAttempts = options.maxAttempts ?? 3;
	const timeoutMs = options.timeoutMs ?? 30_000;
	const backoffBaseMs = options.backoffBaseMs ?? 300;

	let lastError: RendererClientError | undefined;
	for (let i = 0; i < maxAttempts; i++) {
		try {
			return await attempt(url, secret, req, timeoutMs);
		} catch (err) {
			if (!(err instanceof RendererClientError) || !err.retryable) throw err;
			lastError = err;
			if (i < maxAttempts - 1) await sleep(backoffBaseMs * 2 ** i);
		}
	}
	throw lastError;
}
