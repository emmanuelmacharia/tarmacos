/**
 * A render failure with an HTTP-friendly shape. `retryable` tells the caller
 * (and the app's client) whether retrying with backoff could help — transient
 * upstream/timeout failures are retryable; bad input is not.
 */
export class RenderError extends Error {
	readonly code: string;
	readonly status: number;
	readonly retryable: boolean;
	readonly details?: unknown;

	constructor(opts: {
		code: string;
		status: number;
		message: string;
		retryable?: boolean;
		details?: unknown;
	}) {
		super(opts.message);
		this.name = 'RenderError';
		this.code = opts.code;
		this.status = opts.status;
		this.retryable = opts.retryable ?? false;
		this.details = opts.details;
	}
}

export function badRequest(message: string, details?: unknown): RenderError {
	return new RenderError({ code: 'BAD_REQUEST', status: 400, message, details });
}

export function notImplemented(message: string): RenderError {
	return new RenderError({ code: 'NOT_IMPLEMENTED', status: 501, message });
}

export function upstreamError(message: string, retryable: boolean, details?: unknown): RenderError {
	return new RenderError({ code: 'RENDER_UPSTREAM', status: 502, message, retryable, details });
}
