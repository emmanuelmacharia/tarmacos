import { z } from 'zod';

const BlockingIssueSchema = z.object({
	title: z.string().min(1).max(200),
	severity: z.enum(['low', 'medium', 'high']),
	explanation: z.string().min(1).max(1000),
	suggestedFix: z.string().min(1).max(1000)
});

export const CritiqueAndPlanSchema = z.object({
	candidateFitSummary: z.string().min(1).max(2000),
	strengthsToEmphasize: z.array(z.string().min(1).max(300)).max(12),
	gapsOrRisks: z.array(BlockingIssueSchema).max(10),
	targetKeywords: z.array(z.string().min(1).max(100)).max(30),
	experiencePriorities: z.array(z.string().min(1).max(300)).max(12),
	writerStrategy: z.array(z.string().min(1).max(500)).max(12),
	factualGuardrails: z.array(z.string().min(1).max(300)).max(12),
	suggestedResumeFocus: z.string().min(1).max(1000),
	resumeAlignmentScore: z.number().min(0).max(1),
	keywordMatchScore: z.number().min(0).max(1),
	yearsOfExperienceScore: z.number().min(0).max(1)
	// confidence score is an aggregate of all the scores in the resume - it's a ui only thing
});

export type CritiquePlan = z.infer<typeof CritiqueAndPlanSchema>;

export const ReviewSchema = z.discriminatedUnion('verdict', [
	z.object({
		verdict: z.literal('approved'),
		summary: z.string().min(1).max(4000),
		blockingIssues: z.array(BlockingIssueSchema).max(10),
		handoffInstructions: z.array(z.string().min(1).max(500)).max(10),
		approvalReason: z.string().min(1).max(2000),
		resumeAlignmentScore: z.number().min(0).max(100),
		keywordMatchScore: z.number().min(0).max(100),
		yearsOfExperienceScore: z.number().min(0).max(100)
	}),
	z.object({
		verdict: z.literal('revise'),
		summary: z.string().min(1).max(4000),
		blockingIssues: z.array(BlockingIssueSchema).min(1).max(10),
		handoffInstructions: z.array(z.string().min(1).max(500)).min(1).max(10),
		approvalReason: z.string().max(2000).optional(),
		resumeAlignmentScore: z.number().min(0).max(100),
		keywordMatchScore: z.number().min(0).max(100),
		yearsOfExperienceScore: z.number().min(0).max(100)
	})
]);

export type ReviewResult = z.infer<typeof ReviewSchema>;

export const WriterDraftSchema = z.object({}); // I'm thinking of creating an output schema for the writer as well

export const WorkflowRequestSchema = z.object({
	profileId: z.string(), // not optional anymore
	// projectId: z.string().optional(), // what was this one for?

	// TODO: we need to check into this one again
	jobDescription: z.object({
		extractedText: z.string().min(1).max(20_000),
		extractedTextSource: z.optional(z.string()),
		id: z.string(),
		purpose: z.literal('job_description')
	}),
	baselineCv: z.object({
		extractedText: z.string().min(1).max(30_000),
		extractedTextSource: z.optional(z.string()),
		id: z.string(),
		purpose: z.literal('baseline_resume')
	}),
	jobInstructions: z.string().max(4_000).optional(),

	maxIterations: z.number().int().min(1).max(6).default(4),

	writer: z.object({
		modelId: z.string().min(2).max(100),
		instructions: z.string().max(4_000).optional()
	}),

	reviewer: z.object({
		modelId: z.string().min(2).max(100),
		instructions: z.string().max(4_000).optional()
	}),
	signal: z.instanceof(AbortSignal)
});

export type WorkflowRequest = z.infer<typeof WorkflowRequestSchema>;

export type WorkflowPhase = 'reviewerPlan' | 'writerDraft' | 'writerRevise' | 'reviewerReview';

export type WorkflowEvent =
	| {
			type: 'run-started';
			runId: string;
			startedAt: string;
			writerModelId: string;
			reviewerModelId: string;
			maxIterations: number;
	  }
	| {
			type: 'agent-started';
			role: 'writer' | 'reviewer';
			phase: WorkflowPhase;
			iteration: number;
			modelId: string;
	  }
	| {
			type: 'plan-produced';
			plan: CritiquePlan | string;
	  }
	| {
			type: 'draft-produced';
			iteration: number;
			draft: string;
	  }
	| {
			type: 'review-produced';
			iteration: number;
			review: ReviewResult | string;
	  }
	| {
			type: 'approved';
			iteration: number;
			finalResume: string;
			review: ReviewResult | string;
	  }
	| {
			type: 'max-iterations-reached';
			iteration: number;
			finalResume: string;
			review: ReviewResult | string | null;
	  }
	| {
			type: 'error';
			message: string;
	  };

export type WorkflowResult =
	| {
			status: 'approved';
			iterations: number;
			finalResume: string;
			review: ReviewResult | string;
			plan: CritiquePlan | string;
	  }
	| {
			status: 'needs-human-review';
			iterations: number;
			finalResume: string;
			review: ReviewResult | string | null;
			plan: CritiquePlan | string;
	  };
