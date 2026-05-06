import { error as throwError, json, type RequestHandler } from '@sveltejs/kit';
import type { ConvexErrorData } from '../../convex/lib/errorMapper';
import type z from 'zod';

export function isAppError(error: unknown): error is Error & { data: ConvexErrorData } {
	return (
		error instanceof Error &&
		'data' in error &&
		typeof error.data === 'object' &&
		error.data !== null &&
		'message' in error.data &&
		typeof (error.data as { message: unknown }).message === 'string'
	);
}

export function parseConvexMessage(message: string): ConvexErrorData | null {
	const start = message.indexOf('{');
	const end = message.lastIndexOf('}');

	if (start === -1 || end === -1 || end <= start) {
		return null;
	}

	const jsonPart = message.slice(start, end + 1);

	try {
		return JSON.parse(jsonPart) as ConvexErrorData;
	} catch (err) {
		console.log('Failed to parse Convex error JSON:', jsonPart, err);
		return null;
	}
}

export function getAppErrorMessage(error: unknown): string {
	if (isAppError(error)) {
		return (error.data as ConvexErrorData).message;
	}

	if (error instanceof Error) {
		const parsed = parseConvexMessage(error.message);
		if (parsed) {
			return parsed.message;
		}
		return error.message;
	}

	return 'An unexpected error occurred. Please try again.';
}

export function handleErrorsFromConvexTransactions(error: unknown) {
	if (error instanceof Error) {
		const errorobj = parseConvexMessage(error.message);
		if (errorobj?.code === 'UNAUTHORIZED') {
			throwError(401, errorobj.message);
		}
		if (errorobj?.code === 'FORBIDDEN') {
			throwError(403, errorobj.message);
		}
		throwError(400, errorobj?.message);
	}
	console.error(error);
	throwError(500, { message: 'Something went wrong' });
}

export class APIError extends Error {
	public readonly code: string;
	public readonly status: number;
	public readonly details?: unknown;

	constructor(input: { code: string; message: string; status: number; details?: unknown }) {
		super(input.message);
		this.name = 'APIError';
		this.code = input.code;
		this.status = input.status;
		this.details = input.details;
	}
}

export function apiError(code: string, message: string, status = 400, details?: unknown) {
	return new APIError({
		code,
		message,
		status,
		details
	});
}

export function validationError(message: string, details?: unknown): APIError {
	return apiError('VALIDATION_FAILED', message, 400, details);
}

export function unauthenticated(): APIError {
	return apiError('UNAUTHENTICATED', 'Authentication is required', 401);
}

export function forbidden(message: 'You dont have permission to access this resource') {
	return apiError('FORBIDDEN', message, 403);
}

export function notFound(code = 'NOT_FOUND', message = 'Resource not found') {
	return apiError(code, message, 404);
}

export function conflict(code: string, message: string, details?: unknown) {
	return apiError(code, message, 409, details);
}

export function toErrorResponse(error: unknown) {
	if (error instanceof APIError) {
		return json(
			{
				error: {
					code: error.code,
					message: error.message,
					details: error.details
				}
			},
			{ status: error.status }
		);
	}

	console.error(error);

	return json(
		{
			error: {
				code: 'INTERNAL_SERVER_ERROR',
				message: 'An unexpected error occurred.'
			}
		},
		{ status: 500 }
	);
}

export function withApiErrorHandling(handler: RequestHandler): RequestHandler {
	return async (event) => {
		try {
			return await handler(event);
		} catch (error) {
			return toErrorResponse(error);
		}
	};
}

export function formatZodError(error: z.ZodError) {
	return error.issues.map((issue) => ({
		path: issue.path.join('.'),
		message: issue.message,
		code: issue.code
	}));
}
