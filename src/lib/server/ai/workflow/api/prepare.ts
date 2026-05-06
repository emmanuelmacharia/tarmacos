// brings all request params from client - creates an orchestration safe payload

import type { ConvexHttpClient } from 'convex/browser';
import type { PreparedDocument, PreparedWorkflowStart, StartWorkflowApiRequest } from './types';
import { prepareWorkflowDocuments } from './document-processing';
import { DEFAULT_MAX_ITERATIONS, DEFAULT_MODELS } from '../../models';
import { resolveProfileForWorkflow } from './profile';
import { createFileFromJD } from './jobDescription';
import type { WorkflowRequest } from '../../schemas';

export async function prepareWorkflowStart(args: {
	convex: ConvexHttpClient;
	input: StartWorkflowApiRequest;
}): Promise<PreparedWorkflowStart> {
	const { convex, input } = args;

	console.log('workflow start');

	const job = {
		jobDescriptionText: input.jobDescription,
		instructions: input.jobInstructions,
		source: 'pasted_text' as const
	};

	const title = deriveRunTitle(job.jobDescriptionText);

	console.log('our title ====>', title);

	const jobDescriptionDoc = await createFileFromJD(convex, {
		text: job.jobDescriptionText,
		filename: title
	});

	console.log('our jd name ====>', jobDescriptionDoc.filename);

	const jd: PreparedDocument = {
		documentId: jobDescriptionDoc.storageId,
		extractedText: job.jobDescriptionText,
		fileName: jobDescriptionDoc.filename,
		mimeType: jobDescriptionDoc.contentType
	};

	const documents = await prepareWorkflowDocuments({
		resume: input.baselineCv,
		supportingDocuments: input.supportingDocuments
	});

	const models = {
		writer: {
			modelSlug: input.models?.writerModelSlug ?? DEFAULT_MODELS.writer,
			gatewayProvider: 'openrouter' as const
		},
		reviewer: {
			modelSlug: input.models?.reviewerModelSlug ?? DEFAULT_MODELS.reviewer,
			gatewayProvider: 'openrouter' as const
		}
	};

	const profile = await resolveProfileForWorkflow({
		convex,
		profileId: input.profileId,
		resumeText: documents.baselineCv.extractedText,
		jobDescription: job.jobDescriptionText
	});

	return {
		profileId: profile.profileId,
		title,
		documents: {
			baselineResume: documents.baselineCv,
			jobDescription: jd,
			supportingDocuments: documents.supportingDocuments
		},
		job,
		models
	};
}

export async function buildWorkflowArgs(args: PreparedWorkflowStart, convex: ConvexHttpClient) {
	const controller = new AbortController();
	const workflowArgs: WorkflowRequest = {
		profileId: args.profileId,
		jobDescription: {
			extractedText: args.job.jobDescriptionText,
			id: args.documents.jobDescription.documentId,
			purpose: 'job_description' as const
		},
		baselineCv: {
			extractedText: args.documents.baselineResume.extractedText,
			id: args.documents.baselineResume.documentId,
			purpose: 'baseline_resume' as const
		},
		jobInstructions: args.job.instructions,
		maxIterations: DEFAULT_MAX_ITERATIONS,
		writer: {
			modelId: args.models.writer.modelSlug
		},
		reviewer: {
			modelId: args.models.reviewer.modelSlug
		},
		signal: controller.signal
	};

	return {
		convex,
		input: workflowArgs
	};
}

function deriveRunTitle(jobDescriptionText: string): string {
	const firstLine = jobDescriptionText
		.split('\n')
		.map((line) => line.trim())
		.find(Boolean);

	if (!firstLine) {
		return 'Resume tailoring run';
	}

	return firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine;
}
