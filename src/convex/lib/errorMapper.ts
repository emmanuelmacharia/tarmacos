import { ConvexError } from 'convex/values';

export type ConvexErrorData = {
	status: number;
	message: string;
	details: any; //eslint-disable-line @typescript-eslint/no-explicit-any
	code:
		| 'USER_EXISTS'
		| 'UNAUTHORIZED'
		| 'DUPLICATE_ENTRY'
		| 'NOT_FOUND'
		| 'INVALID_PATCH'
		| 'FORBIDDEN'
		| 'INVALID_ACCOUNT_TYPE'
		| 'CONVEX_ERROR'
		| 'BAD_REQUEST';
};

export function mapConvexError(data: ConvexErrorData): never {
	throw new ConvexError<ConvexErrorData>(data);
}

export function badRequest(message = 'Bad Request', details: unknown = {}): never {
	mapConvexError({
		status: 400,
		message,
		details,
		code: 'BAD_REQUEST'
	});
}

export function unauthorized(message = 'Unauthorized', details: unknown = {}): never {
	mapConvexError({
		status: 401,
		message,
		details,
		code: 'UNAUTHORIZED'
	});
}

export function forbiddenCheck(check: () => boolean) {
	const authorized = check();
	if (!authorized) {
		forbidden();
	}
}

export function forbidden(message = 'Forbidden', details: unknown = {}): never {
	mapConvexError({
		status: 403,
		message,
		details,
		code: 'FORBIDDEN'
	});
}

export function internalServerError(
	message = 'Internal Server Error',
	details: unknown = {}
): never {
	mapConvexError({
		status: 500,
		message,
		details,
		code: 'CONVEX_ERROR'
	});
}

export function assertFound<T>(
	value: T | null | undefined,
	message = 'Not Found',
	isAuth = false,
	details: unknown = {}
): T {
	if (value === null || value === undefined) {
		if (isAuth) {
			unauthorized(message);
		}
		mapConvexError({
			status: 404,
			message,
			details,
			code: 'NOT_FOUND'
		});
	}
	return value;
}

export async function withAppErrors<T>(fn: () => Promise<T>): Promise<T> {
	try {
		return await fn();
	} catch (error) {
		if (error instanceof ConvexError) {
			throw error;
		}
		console.error('Unexpected error in Convex function:', error);
		internalServerError('An unexpected error occurred');
	}
}
