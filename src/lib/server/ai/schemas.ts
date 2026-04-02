import { z } from 'zod';

export const CritiqueAndPlanSchema = z.object({
	candidateFitSummary: z.string().min(1).max(2000),
	strengthsToEmphasize: z.array(z.string().min(1).max(300)).max(12),
	gapsOrRisks: z
		.array(
			z.object({
				title: z.string().min(1).max(200),
				severity: z.enum(['low', 'medium', 'high']),
				explanation: z.string().min(1).max(800),
				mitigation: z.string().min(1).max(800)
			})
		)
		.max(10),
	targetKeywords: z.array(z.string().min(1).max(100)).max(30),
	experiencePriorities: z.array(z.string().min(1).max(300)).max(12),
	writerStrategy: z.array(z.string().min(1).max(500)).max(12),
	factualGuardrails: z.array(z.string().min(1).max(300)).max(12),
	suggestedResumeFocus: z.string().min(1).max(1000),
	confidenceScore: z.number().min(0).max(100)
});

export type CritiquePlan = z.infer<typeof CritiqueAndPlanSchema>;

export const ReviewSchema = z.object({
	verdict: z.enum(['approved', 'revise']),
	summary: z.string().min(1).max(4000),
	blockingIssues: z
		.array(
			z.object({
				title: z.string().min(1).max(200),
				severity: z.enum(['low', 'medium', 'high']),
				explanation: z.string().min(1).max(1000),
				suggestedFix: z.string().min(1).max(1000)
			})
		)
		.max(10),
	handoffInstructions: z.array(z.string().min(1).max(500)).max(10),
	approvalReason: z.string().max(2000).optional(),
	confidenceScore: z.number().min(0).max(100)
});

export type ReviewResult = z.infer<typeof ReviewSchema>;

export const WorkflowRequestSchema = z.object({
	profileId: z.string().optional(), // these need to be set before any run starts - they shouldnt be optional
	projectId: z.string().optional(),

	jobDescription: z.string().min(1).max(20_000),
	baselineCv: z.string().min(1).max(30_000),
	jobInstructions: z.string().max(4_000).optional(),

	maxIterations: z.number().int().min(1).max(6).default(4),

	writer: z.object({
		modelId: z.string().min(2).max(100),
		instructions: z.string().max(4_000).optional()
	}),

	reviewer: z.object({
		modelId: z.string().min(2).max(100),
		instructions: z.string().max(4_000).optional()
	})
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
