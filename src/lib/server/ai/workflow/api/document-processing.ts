import { validationError } from '$lib/utils/errorHandler';
import { parseBase64Document } from './document-parser';
import type { Base64DocumentInput, PreparedDocument } from './types';

const MAX_SUPPORTING_DOCUMENTS = 3;

export type PrepareWorkflowDocumentInput = {
	resume: Base64DocumentInput;
	supportingDocuments?: Base64DocumentInput[];
};

export type PrepareWorkflowDocumentsResults = {
	baselineCv: PreparedDocument;
	supportingDocuments?: PreparedDocument[];
};

export async function prepareWorkflowDocuments(
	input: PrepareWorkflowDocumentInput
): Promise<PrepareWorkflowDocumentsResults> {
	const supportingDocs = input.supportingDocuments ?? [];

	if (supportingDocs.length > MAX_SUPPORTING_DOCUMENTS) {
		throw validationError(
			'Too many uploaded files for this run. This generally pollutes context and can lead to less desirable results'
		);
	}

	const [baselineCv, ...supportingDocuments] = await Promise.all([
		parseBase64Document({ ...input.resume, purpose: 'resume' }),
		...supportingDocs.map((doc) => parseBase64Document({ ...doc, purpose: 'supporting' }))
	]);

	return {
		baselineCv: toPreparedDocument(baselineCv),
		supportingDocuments: supportingDocuments.map(toPreparedDocument)
	};
}

function toPreparedDocument(document: {
	documentId: string;
	extractedText: string;
	mimeType: string;
	fileName: string;
}): PreparedDocument {
	return {
		documentId: document.documentId,
		extractedText: document.extractedText,
		mimeType: document.mimeType,
		fileName: document.fileName
	};
}
