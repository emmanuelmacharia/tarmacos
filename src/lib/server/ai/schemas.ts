import { z } from 'zod';

function truncateString(max: number) {
	return z.preprocess((value) => {
		if (value == null) return value;

		const text = typeof value === 'string' ? value : JSON.stringify(value);

		const trimmed = text.trim();

		if (trimmed.length <= max) return trimmed;

		return trimmed.slice(0, max);
	}, z.string().min(1).max(max));
}

function stringArray(options: {
	maxItems?: number;
	maxStringLength: number;
	minItems?: number;
	defaultValue?: string[];
}) {
	return z.preprocess(
		(value) => {
			if (value == null) return options.defaultValue ?? [];

			const arr = Array.isArray(value) ? value : [value];

			const cleaned = arr
				.map((item) => {
					if (item == null) return '';

					if (typeof item === 'string') return item.trim();

					return JSON.stringify(item).trim();
				})
				.filter(Boolean)
				.map((item) => item.slice(0, options.maxStringLength));

			const deduped = [...new Set(cleaned)];

			return typeof options.maxItems === 'number' ? deduped.slice(0, options.maxItems) : deduped;
		},
		z
			.array(z.string().min(1).max(options.maxStringLength))
			.min(options.minItems ?? 0)
			.max(options.maxItems ?? Number.MAX_SAFE_INTEGER)
			.default(options.defaultValue ?? [])
	);
}

// function numberFromUnknown(options: { min?: number; max?: number; defaultValue?: number }) {
// 	return z.preprocess(
// 		(value) => {
// 			if (typeof value === 'number' && Number.isFinite(value)) {
// 				return value;
// 			}

// 			if (typeof value === 'string') {
// 				const parsed = Number(value.replace('%', '').trim());

// 				if (Number.isFinite(parsed)) {
// 					return parsed;
// 				}
// 			}

// 			return options.defaultValue ?? value;
// 		},
// 		z
// 			.number()
// 			.min(options.min ?? Number.NEGATIVE_INFINITY)
// 			.max(options.max ?? Number.POSITIVE_INFINITY)
// 	);
// }

/**
 * Accepts:
 * - 0..1
 * - 0..100
 * - "0.82"
 * - "82"
 * - "82%"
 *
 * Outputs:
 * - 0..1
 */
function score01(defaultValue = 0) {
	return z.preprocess((value) => {
		let parsed: number | null = null;

		if (typeof value === 'number' && Number.isFinite(value)) {
			parsed = value;
		}

		if (typeof value === 'string') {
			const numeric = Number(value.replace('%', '').trim());

			if (Number.isFinite(numeric)) {
				parsed = numeric;
			}
		}

		if (parsed === null) return defaultValue;

		const normalized = parsed > 1 ? parsed / 100 : parsed;

		return Math.min(Math.max(normalized, 0), 1);
	}, z.number().min(0).max(1));
}

function yearsOfExperience(defaultValue = 0) {
	return z.preprocess((value) => {
		let parsed: number | null = null;

		if (typeof value === 'number' && Number.isFinite(value)) {
			parsed = value;
		}

		if (typeof value === 'string') {
			const match = value.match(/\d+(\.\d+)?/);
			const numeric = match ? Number(match[0]) : NaN;

			if (Number.isFinite(numeric)) {
				parsed = numeric;
			}
		}

		if (parsed === null) return defaultValue;

		return Math.max(parsed, 0);
	}, z.number().min(0));
}

function seniorityLevel(defaultValue = 'mid' as const) {
	return z.preprocess(
		(value) => {
			if (typeof value !== 'string') return defaultValue;

			const normalized = value.toLowerCase().trim();

			if (['intern', 'internship', 'student', 'trainee'].includes(normalized)) {
				return 'intern';
			}

			if (
				['junior', 'jr', 'entry', 'entry-level', 'entry level', 'associate'].includes(normalized)
			) {
				return 'junior';
			}

			if (['mid', 'mid-level', 'mid level', 'intermediate', 'professional'].includes(normalized)) {
				return 'mid';
			}

			if (['senior', 'sr', 'experienced'].includes(normalized)) {
				return 'senior';
			}

			if (['lead', 'principal', 'staff', 'tech lead', 'technical lead'].includes(normalized)) {
				return 'lead';
			}

			if (['manager', 'management', 'people manager', 'engineering manager'].includes(normalized)) {
				return 'manager';
			}

			return defaultValue;
		},
		z.enum(['intern', 'junior', 'mid', 'senior', 'lead', 'manager'])
	);
}

const LLMBlockingIssueSchema = z
	.object({
		title: truncateString(200),
		severity: z.preprocess(
			(value) => {
				if (typeof value !== 'string') return 'medium';

				const normalized = value.toLowerCase().trim();

				if (['critical', 'blocker', 'high', 'major'].includes(normalized)) {
					return 'high';
				}

				if (['medium', 'moderate', 'med'].includes(normalized)) {
					return 'medium';
				}

				if (['low', 'minor', 'small'].includes(normalized)) {
					return 'low';
				}

				return 'medium';
			},
			z.enum(['low', 'medium', 'high'])
		),
		explanation: truncateString(1000),
		suggestedFix: truncateString(1000)
	})
	.strip();

const LLMBlockingIssuesSchema = z.preprocess((value) => {
	if (value == null) return [];

	const arr = Array.isArray(value) ? value : [value];

	return arr.slice(0, 10);
}, z.array(LLMBlockingIssueSchema).max(10).default([]));

export const LLMProfileCreationSchema = z
	.object({
		profileName: truncateString(200),
		profileSummary: truncateString(2000),
		primaryFocus: truncateString(500),
		yearsOfExperience: yearsOfExperience(0),
		seniorityLevel: seniorityLevel('mid')
	})
	.strip();

export const LLMCritiqueAndPlanSchema = z
	.object({
		candidateFitSummary: truncateString(2000),
		strengthsToEmphasize: stringArray({
			maxItems: 12,
			maxStringLength: 300
		}),
		gapsOrRisks: LLMBlockingIssuesSchema,
		targetKeywords: stringArray({
			maxItems: 30,
			maxStringLength: 100
		}),
		experiencePriorities: stringArray({
			maxItems: 12,
			maxStringLength: 300
		}),
		writerStrategy: stringArray({
			maxItems: 12,
			maxStringLength: 500,
			minItems: 1
		}),
		factualGuardrails: stringArray({
			maxItems: 12,
			maxStringLength: 300
		}),
		suggestedResumeFocus: truncateString(1000),
		resumeAlignmentScore: score01(0),
		keywordMatchScore: score01(0),
		yearsOfExperienceScore: yearsOfExperience(0)
	})
	.strip();

const LLMApprovedReviewSchema = z
	.object({
		verdict: z.literal('approved'),
		summary: truncateString(4000),
		handoffInstructions: stringArray({
			maxItems: 10,
			maxStringLength: 500,
			defaultValue: []
		}),
		approvalReason: truncateString(2000),
		resumeAlignmentScore: score01(0),
		keywordMatchScore: score01(0),
		yearsOfExperienceScore: yearsOfExperience(0)
	})
	.strip();

const LLMReviseReviewSchema = z
	.object({
		verdict: z.literal('revise'),
		summary: truncateString(4000),
		blockingIssues: z.preprocess((value) => {
			if (value == null) return [];

			const arr = Array.isArray(value) ? value : [value];

			return arr.slice(0, 10);
		}, z.array(LLMBlockingIssueSchema).min(1).max(10)),
		handoffInstructions: stringArray({
			maxItems: 10,
			maxStringLength: 500,
			minItems: 1
		}),
		resumeAlignmentScore: score01(0),
		keywordMatchScore: score01(0),
		yearsOfExperienceScore: yearsOfExperience(0)
	})
	.strip();

export const LLMReviewSchema = z.preprocess(
	(value) => {
		if (!value || typeof value !== 'object') return value;

		const input = value as Record<string, unknown>;
		const verdict = input.verdict;

		if (typeof verdict !== 'string') return input;

		const normalized = verdict.toLowerCase().trim();

		if (['approve', 'approved', 'accept', 'accepted'].includes(normalized)) {
			return {
				...input,
				verdict: 'approved'
			};
		}

		if (
			[
				'revise',
				'revision',
				'needs_revision',
				'needs revision',
				'changes_requested',
				'changes requested',
				'fail',
				'failed'
			].includes(normalized)
		) {
			return {
				...input,
				verdict: 'revise'
			};
		}

		return input;
	},
	z.discriminatedUnion('verdict', [LLMApprovedReviewSchema, LLMReviseReviewSchema])
);

export type LLMProfileCreation = z.infer<typeof LLMProfileCreationSchema>;
export type LLMCritiquePlan = z.infer<typeof LLMCritiqueAndPlanSchema>;
export type LLMReviewResult = z.infer<typeof LLMReviewSchema>;

export const ProfileCreationSchema = z.object({
	profileName: z.string().min(1).max(200),
	profileSummary: z.string().min(1).max(2000),
	primaryFocus: z.string().min(1).max(500),
	yearsOfExperience: z.number().min(0),
	seniorityLevel: z.union([
		z.literal('intern'),
		z.literal('junior'),
		z.literal('mid'),
		z.literal('senior'),
		z.literal('lead'),
		z.literal('manager')
	])
});

const BlockingIssueSchema = z.object({
	title: z.string().min(1).max(200),
	severity: z.enum(['low', 'medium', 'high']),
	explanation: z.string().min(1).max(1000),
	suggestedFix: z.string().min(1).max(1000)
});

export const CritiqueAndPlanSchema = z.object({
	candidateFitSummary: z.string().min(1).max(2000),
	strengthsToEmphasize: z.array(z.string().min(1).max(300)),
	gapsOrRisks: z.array(BlockingIssueSchema).max(10),
	targetKeywords: z.array(z.string().min(1).max(100)),
	experiencePriorities: z.array(z.string().min(1).max(300)),
	writerStrategy: z.array(z.string().min(1).max(500)),
	factualGuardrails: z.array(z.string().min(1).max(300)),
	suggestedResumeFocus: z.string().min(1).max(1000),
	resumeAlignmentScore: z.number().min(0).max(1),
	keywordMatchScore: z.number().min(0).max(1),
	yearsOfExperienceScore: z.number().min(0)
	// confidence score is an aggregate of all the scores in the resume - it's a ui only thing
});

export type CritiquePlan = z.infer<typeof CritiqueAndPlanSchema>;

export const ReviewSchema = z.discriminatedUnion('verdict', [
	z.object({
		verdict: z.literal('approved'),
		summary: z.string().min(1).max(4000),
		handoffInstructions: z.array(z.string().min(1).max(500)).max(10),
		approvalReason: z.string().min(1).max(2000),
		resumeAlignmentScore: z.number().min(0).max(1),
		keywordMatchScore: z.number().min(0).max(1),
		yearsOfExperienceScore: z.number().min(0)
	}),
	z.object({
		verdict: z.literal('revise'),
		summary: z.string().min(1).max(4000),
		blockingIssues: z.array(BlockingIssueSchema).min(1).max(10),
		handoffInstructions: z.array(z.string().min(1).max(500)).min(1).max(10),
		resumeAlignmentScore: z.number().min(0).max(1),
		keywordMatchScore: z.number().min(0).max(1),
		yearsOfExperienceScore: z.number().min(0)
	})
]);

export type ReviewResult = z.infer<typeof ReviewSchema>;

export const WriterDraftSchema = z.object({}); // I'm thinking of creating an output schema for the writer as well

export const WorkflowRequestSchema = z.object({
	// <- request you send to the orchestration layer
	profileId: z.string(), // not optional anymore
	// projectId: z.string().optional(), // what was this one for?

	// TODO: we need to check into this one again
	/**
	 * We could use the JD as a simple string - use it that way = the problem is where it would live
	 * Run documents need to be maintained in storage
	 * Unless we create a file from the pasted text JD - we'll need to rethink this one
	 */
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

export type WorkflowPhase =
	| 'reviewerPlan'
	| 'writerDraft'
	| 'writerRevise'
	| 'reviewerReview'
	| 'preflight'; // preflight for profile creeation or other llm calls that dont work within a phase

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
