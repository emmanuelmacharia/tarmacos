// Types for API request/respones

import { z } from 'zod';
import type { Id, TableNames } from '../../../../../convex/_generated/dataModel';

export const convexId = <TTable extends TableNames>() =>
	z
		.string()
		.min(1)
		.transform((value) => value as Id<TTable>);

const normalizedString = z.string().transform((value) => value.replace(/\r\n/g, '\n').trim());

const optionalNormalizedString = z
	.string()
	.transform((value) => value.replace(/\r\n/g, '\n').trim())
	.optional()
	.transform((value) => (value ? value : undefined));

export const Base64DocumentSchema = z.object({
	documentId: z.string().optional(),
	fileName: z.string().trim().min(1),
	mimeType: z.string().trim().min(1),
	base64: z.string().min(1),
	purpose: z.enum(['resume', 'supporting']).optional()
});

export const StartWorkflowApiRequestSchema = z.object({
	//<= request you get from the user
	profileId: convexId<'profiles'>().optional(),

	jobDescription: normalizedString.pipe(z.string().min(1).max(60_000)),
	baselineCv: Base64DocumentSchema,
	supportingDocuments: z.array(Base64DocumentSchema).max(3).default([]),

	jobDescriptionText: z.string().optional(),
	jobInstructions: z.string().trim().max(10_000).optional(),

	models: z
		.object({
			reviewerModelSlug: z.string().optional(),
			writerModelSlug: z.string().optional()
		})
		.optional()
});

export type StartWorkflowApiRequest = z.infer<typeof StartWorkflowApiRequestSchema>;

export type Base64DocumentInput = z.infer<typeof Base64DocumentSchema>;

export type ParsedStartWorkflowApiRequest = StartWorkflowApiRequest & {
	files?: File[];
};

export const PreparedDocumentSchema = z.object({
	documentId: z.string(),
	extractedText: z.string(),
	mimeType: z.string().optional(),
	fileName: z.string().optional()
});

export type PreparedDocument = z.infer<typeof PreparedDocumentSchema>;

export const NormalizedJobInputSchema = z.object({
	jobDescriptionText: normalizedString.pipe(z.string().min(1).max(60_000)),
	instructions: optionalNormalizedString.pipe(z.string().max(10_000).optional()),
	source: z.enum(['document', 'pasted_text', 'document_plus_instructions'])
});

export type NormalizedJobInput = z.infer<typeof NormalizedJobInputSchema>;

export const PreparedWorkflowStartSchema = z.object({
	profileId: convexId<'profiles'>(),
	title: z.string(),

	documents: z.object({
		baselineResume: PreparedDocumentSchema,
		jobDescription: PreparedDocumentSchema,
		supportingDocuments: z.array(PreparedDocumentSchema).optional()
	}),

	job: NormalizedJobInputSchema,

	models: z.object({
		reviewer: z.object({
			modelSlug: z.string(),
			gatewayProvider: z.literal('openrouter')
		}),
		writer: z.object({
			modelSlug: z.string(),
			gatewayProvider: z.literal('openrouter')
		})
	})
});

export type PreparedWorkflowStart = z.infer<typeof PreparedWorkflowStartSchema>;

export const WorkflowAPIRequestSchema = z.object({
	profileId: convexId<'profiles'>(),
	title: z.string(),

	baselineResume: z.object({
		documentId: z.string(),
		extractedText: z.string()
	}),

	jobDescription: z.object({
		documentId: z.string().optional(),
		text: normalizedString.pipe(z.string().min(1).max(60_000))
	}),

	supportingDocuments: z.array(
		z.object({
			documentId: z.string(),
			extractedText: z.string()
		})
	),

	jobInstructions: optionalNormalizedString.pipe(z.string().max(10_000).optional()),

	models: z.object({
		reviewerModelSlug: z.string(),
		writerModelSlug: z.string()
	}),

	signal: z.custom<AbortSignal>((value) => value instanceof AbortSignal).optional()
});

export type WorkflowAPIRequest = z.infer<typeof WorkflowAPIRequestSchema>;

export const ApiRunMessageSchema = z.object({
	id: z.string(),
	runId: z.string(),
	seqNo: z.number(),
	author: z.object({
		type: z.enum(['user', 'agent', 'system']),
		role: z.enum(['user', 'writer', 'reviewer', 'system']).optional()
	}),
	type: z.enum([
		'user_prompt',
		'review_summary',
		'draft_announcement',
		'revision_request',
		'approval',
		'system_status',
		'final_message'
	]),
	visibility: z.literal('user_visible'),
	body: z.object({
		format: z.enum(['text', 'markdown']),
		text: z.string()
	}),
	related: z
		.object({
			artifactVersionId: z.string().optional(),
			reviewId: z.string().optional()
		})
		.optional(),
	createdAt: z.number()
});

export type ApiRunMessage = z.infer<typeof ApiRunMessageSchema>;

export const ApiErrorResponseSchema = z.object({
	error: z.object({
		code: z.string(),
		message: z.string(),
		details: z.unknown().optional()
	})
});

export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
