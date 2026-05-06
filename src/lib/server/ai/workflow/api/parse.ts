import { validationError, formatZodError } from '$lib/utils/errorHandler';
import { StartWorkflowApiRequestSchema, type ParsedStartWorkflowApiRequest } from './types';

const JSON_CONTENT_TYPES = new Set(['application/json', 'application/vnd.api+json']);

export async function parseStartWorkflowApiRequest(
	request: Request
): Promise<ParsedStartWorkflowApiRequest> {
	const contentType = request.headers.get('content-type') ?? '';

	if (isJsonContentType(contentType)) {
		const body = await request.json().catch(() => {
			throw validationError('Invalid request format');
		});
		return parseBody(body);
	}

	if (contentType.includes('multipart/form-data')) {
		const form = await request.formData();
		const inputRaw = form.get('input');
		const rawBody =
			typeof inputRaw === 'string' && inputRaw.trim() ? parseJsonString(inputRaw, 'input') : {};
		const files = form.getAll('files').filter((val): val is File => val instanceof File);
		return {
			...parseBody(rawBody),
			files
		};
	}

	throw validationError('Unsupported request format and content type', { contentType });
}

function isJsonContentType(contentType: string): boolean {
	const [type] = contentType.split(';').map((val) => val.trim());
	return JSON_CONTENT_TYPES.has(type);
}

function parseJsonString(value: string, fieldName: string): unknown {
	try {
		return JSON.parse(value);
	} catch {
		throw validationError(`${fieldName} must be valid JSON`);
	}
}

function parseBody(value: unknown) {
	const result = StartWorkflowApiRequestSchema.safeParse(value);

	if (!result.success) {
		throw validationError('Invalid request', { issue: formatZodError(result.error) });
	}

	return result.data;
}
