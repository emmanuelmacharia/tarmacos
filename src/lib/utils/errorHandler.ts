
import type { ConvexErrorData } from '../../convex/lib/errorMapper';

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

function parseConvexMessage(message: string): ConvexErrorData | null {
	const start = message.indexOf("{");
	const end = message.lastIndexOf("}");

	if (start === -1 || end === -1 || end <= start) {
		return null;
	}

	const jsonPart = message.slice(start, end + 1);

	try {
		return JSON.parse(jsonPart) as ConvexErrorData;
	} catch (err) {
		console.log("Failed to parse Convex error JSON:", jsonPart, err);
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
