import type { Base64DocumentInput } from './types';
import { apiError, validationError } from '$lib/utils/errorHandler';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_EXTRACTED_TEXT_CHARS = 200_000;

const SUPPORTED_MIME_TYPES = new Set([
	'application/pdf',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'text/plain',
	'text/markdown',
	'text/md',
	'md'
]);

export type ParsedDocumentContent = {
	documentId: string;
	extractedText: string;
	mimeType: string;
	fileName: string;
	purpose?: 'resume' | 'supporting';
};

export async function parseBase64Document(
	document: Base64DocumentInput
): Promise<ParsedDocumentContent> {
	validateDocumentInput(document);
	const bytes = decodeBase64Document(document.base64);
	if (bytes.byteLength > MAX_FILE_SIZE_BYTES) {
		throw validationError('File is too large', {
			fileName: document.fileName,
			maxBytes: MAX_FILE_SIZE_BYTES,
			actualBytes: bytes.byteLength
		});
	}

	const textFileExtract = extractTextFileDataWithoutEncoding(document);

	const extractedText =
		textFileExtract ??
		(await extractTextFromBytes({
			bytes,
			mimeType: document.mimeType,
			fileName: document.fileName
		}));

	const normalizedText = normalizeExtractedText(extractedText);

	if (!normalizedText) {
		throw apiError('DOCUMENT_PARSE_FAILED', 'Document has no extractable text.', 422, {
			fileName: document.fileName
		});
	}

	if (normalizedText.length > MAX_EXTRACTED_TEXT_CHARS) {
		throw validationError('Extracted document text is too large', {
			fileName: document.fileName,
			maxChars: MAX_EXTRACTED_TEXT_CHARS
		});
	}

	return {
		documentId: document.documentId ?? crypto.randomUUID(),
		extractedText: normalizedText,
		mimeType: document.mimeType,
		fileName: document.fileName,
		purpose: document.purpose
	};
}

function extractTextFileDataWithoutEncoding(document: Base64DocumentInput): string | null {
	const { mimeType } = document;
	if (mimeType === 'text/plain' || mimeType === 'text/markdown' || mimeType.includes('md')) {
		return document.base64;
	}
	return null;
}

function validateDocumentInput(document: Base64DocumentInput): void {
	if (!document.fileName.trim()) {
		throw validationError('Document fileName is required.');
	}

	if (!SUPPORTED_MIME_TYPES.has(document.mimeType)) {
		throw apiError('UNSUPPORTED_DOCUMENT_TYPE', 'Unsupported document type.', 415, {
			fileName: document.fileName,
			mimeType: document.mimeType
		});
	}

	if (!document.base64.trim()) {
		throw validationError('Document base64 content is required.', {
			fileName: document.fileName
		});
	}
}

function decodeBase64Document(base64OrDataUrl: string): Uint8Array {
	const base64 = stripDataUrlPrefix(base64OrDataUrl);
	try {
		return Uint8Array.from(Buffer.from(base64, 'base64'));
	} catch {
		throw validationError('Invalid base64 document content');
	}
}

function stripDataUrlPrefix(value: string): string {
	const trimmed = value.trim();
	const commaIndex = trimmed.indexOf(',');
	if (trimmed.startsWith('data:') && commaIndex !== -1) {
		return trimmed.slice(commaIndex + 1);
	}
	return trimmed;
}

async function extractTextFromBytes(input: {
	bytes: Uint8Array;
	mimeType: string;
	fileName: string;
}): Promise<string> {
	switch (input.mimeType) {
		case 'text/plain':
		case 'text/markdown':
			return new TextDecoder('utf-8').decode(input.bytes);

		case 'application/pdf':
			return extractPdfText(input.bytes);

		case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
			return extractDocxText(input.bytes);
		default:
			throw apiError('UNSUPPORTED_DOCUMENT_TYPE', 'Unsupported document type', 415, {
				fileName: input.fileName,
				mimeType: input.mimeType
			});
	}
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
	const { PDFParse } = await import('pdf-parse');
	const parser = new PDFParse({
		data: Buffer.from(bytes)
	});
	const result = await parser.getText();
	await parser.destroy();
	return result.text;
}

async function extractDocxText(bytes: Uint8Array): Promise<string> {
	const mammoth = await import('mammoth');
	const result = await mammoth.extractRawText({
		buffer: Buffer.from(bytes)
	});
	return result.value;
}

function normalizeExtractedText(text: string): string {
	return text.replace(/\r\n/g, '\n').trim();
}
