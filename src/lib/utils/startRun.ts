// Client-side helper shared by the landing page and dashboard: turns a MainPrompt
// submission into a StartWorkflowApiRequest, kicks off the run, and navigates to it.

import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import type { AttachedFile } from '$lib/components/main-prompt.svelte';
import type { Role, SelectedModel } from '$lib/data/models';
import type { StartWorkflowApiRequest } from '$lib/server/ai/workflow/api/types';

export type PromptSubmission = {
	jobDescription: string;
	jobInstructions: string;
	models: Record<Role, SelectedModel>;
	resume: AttachedFile;
	supportingDocuments: AttachedFile[];
};

const fileToBase64 = async (file: File) => {
	const bytes = new Uint8Array(await file.arrayBuffer());
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
};

const inferMimeType = (file: File) =>
	file.type ||
	({
		pdf: 'application/pdf',
		doc: 'application/msword',
		docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		md: 'text/markdown',
		markdown: 'text/markdown',
		txt: 'text/plain'
	}[file.name.split('.').pop()?.toLowerCase() ?? ''] ??
		'application/octet-stream');

export async function startRun(
	data: PromptSubmission,
	profileId?: StartWorkflowApiRequest['profileId']
) {
	const supportingDocuments = await Promise.all(
		data.supportingDocuments.map(async (doc) => ({
			documentId: doc.documentId,
			fileName: doc.file.name,
			mimeType: inferMimeType(doc.file),
			purpose: 'supporting' as const,
			base64: await fileToBase64(doc.file)
		}))
	);

	const payload: StartWorkflowApiRequest = {
		profileId,
		jobDescription: data.jobDescription,
		models: {
			reviewerModelSlug: data.models.reviewer.id ?? undefined,
			writerModelSlug: data.models.writer.id ?? undefined
		},
		jobInstructions: data.jobInstructions,
		baselineCv: {
			documentId: data.resume.documentId,
			fileName: data.resume.file.name,
			mimeType: inferMimeType(data.resume.file),
			purpose: 'resume' as const,
			base64: await fileToBase64(data.resume.file)
		},
		supportingDocuments
	};

	const response = await fetch('/api/ai/runs', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(payload)
	});

	if (!response.ok || !response.body) {
		console.error('failed to start workflow', response);
		throw new Error(`Failed to start workflow: ${response.status}`);
	}

	const body = await response.json();
	const { id } = body;

	if (!id) {
		console.error('workflow response missing run id', body);
		throw new Error('Workflow response missing run id');
	}

	await goto(resolve(`/runs/${id}`));
}
