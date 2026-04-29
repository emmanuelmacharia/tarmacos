import { v } from 'convex/values';
import type { Id } from '../_generated/dataModel';

// enums
export const userStatus = v.union(v.literal('active'), v.literal('disabled'));
export const defaultResumeLength = v.union(
	v.literal('one_page'),
	v.literal('two_page'),
	v.literal('auto')
);

export const seniorityLevel = v.union(
	v.literal('intern'),
	v.literal('junior'),
	v.literal('mid'),
	v.literal('senior'),
	v.literal('staff'),
	v.literal('principal'),
	v.literal('lead'),
	v.literal('manager')
);

export const documentType = v.union(
	v.literal('uploaded_resume'),
	v.literal('promoted_generated_resume'),
	v.literal('uploaded_coverletter'),
	v.literal('promoted_generated_coverletter')
);

export const documentFormat = v.union(
	v.literal('pdf'),
	v.literal('docx'),
	v.literal('markdown'),
	v.literal('txt'),
	v.literal('json')
);

export const runStatus = v.union(
	v.literal('created'),
	v.literal('running'),
	v.literal('awaiting_user'),
	v.literal('completed'),
	v.literal('failed'),
	v.literal('cancelled')
);

export const runPhase = v.union(
	// what happens next
	v.literal('baseline_review'),
	v.literal('drafting'),
	v.literal('reviewing'),
	v.literal('revision'),
	v.literal('user_review'),
	v.literal('finalizing')
);

export const ModelRequestParametersValidator = v.object({
	temperature: v.number(),
	topP: v.number(),
	maxOutputTokens: v.optional(v.number()),
	seed: v.optional(v.number()),
	stopSequences: v.optional(v.array(v.string())),
	responseFormat: v.optional(v.union(v.literal('text'), v.literal('json'))),
	reasoning: v.optional(
		v.union(
			v.object({
				effort: v.union(v.literal('low'), v.literal('medium'), v.literal('high'))
			}),
			v.null()
		)
	),
	routing: v.optional(
		v.object({
			order: v.optional(v.array(v.string())),
			requireParameters: v.optional(v.boolean())
		})
	)
});

export const AgentRoleConfigValidator = v.object({
	modelSlug: v.string(),
	gatewayProvider: v.optional(v.string()),
	promptVersions: v.object({
		system: v.string(),
		planning: v.optional(v.string()),
		drafting: v.optional(v.string()),
		review: v.optional(v.string()),
		revision: v.optional(v.string()),
		rolePromptVersion: v.string()
	}),
	defaultRequestParams: ModelRequestParametersValidator
});

export const AgentConfigValidator = v.object({
	reviewer: AgentRoleConfigValidator,
	writer: AgentRoleConfigValidator,
	maxIterations: v.number(),
	maxRetriesPerCall: v.number(),
	maxNormalizationRepairs: v.number()
});

export const agentConfig = AgentConfigValidator;

export const documentPurpose = v.union(
	v.literal('baseline_resume'),
	v.literal('job_description'),
	v.literal('supporting_documents'),
	v.literal('generated_export')
);

export const authorType = v.union(v.literal('user'), v.literal('agent'), v.literal('system'));

export const authorRole = v.union(
	v.literal('user'),
	v.literal('writer'),
	v.literal('reviewer'),
	v.literal('system')
);

export const messageType = v.union(
	v.literal('user_prompt'),
	v.literal('reviewer_summary'),
	v.literal('draft_announcement'),
	v.literal('revision_request'),
	v.literal('approval'),
	v.literal('system_status'),
	v.literal('final_message')
);

export const messageVisibility = v.union(v.literal('user_visible'), v.literal('internal'));

export const messageBodyFormat = v.union(v.literal('text'), v.literal('markdown'));

export const artifactType = v.union(v.literal('resume'), v.literal('cover_letter'));

export const artifactStatus = v.union(
	v.literal('in_progress'),
	v.literal('approved'),
	v.literal('finalized'),
	v.literal('abandoned')
);

export const artifactVersionOrigin = v.union(
	v.literal('imported_source'),
	v.literal('agent_draft'),
	v.literal('agent_revision'),
	v.literal('user_revisions'),
	v.literal('system_finalized')
);

export const artifactVersionStatus = v.union(
	v.literal('draft'),
	v.literal('submitted_for_review'),
	v.literal('revision_requested'),
	v.literal('approved'),
	v.literal('finalized')
);

export const reviewType = v.union(v.literal('baseline_assessment'), v.literal('draft_review'));

export const reviewDecision = v.union(
	v.literal('no-decision'),
	v.literal('approve'),
	v.literal('revise')
); // no decision for baseline assessments

export const LlmCallStatus = v.union(
	v.literal('queued'),
	v.literal('running'),
	v.literal('completed'),
	v.literal('failed'),
	v.literal('cancelled')
);

export const normalizationStatus = v.union(
	v.literal('pending'),
	v.literal('succeeded'),
	v.literal('failed')
);

export const operationKind = v.union(
	v.literal('baseline_review'),
	v.literal('draft_generation'),
	v.literal('draft_review'),
	v.literal('draft_revision'),
	v.literal('revision_review'),
	v.literal('user_feedback_draft')
);

export const llmContentKind = v.union(
	v.literal('prompt'),
	v.literal('raw_request'),
	v.literal('response'),
	v.literal('raw_response'),
	v.literal('reasoning'),
	v.literal('structured_output')
);

export const llmContentFormat = v.union(v.literal('json'), v.literal('text'));

export const exportFormat = v.union(v.literal('pdf'), v.literal('docx'), v.literal('txt'));

export const exportStatus = v.union(v.literal('pending'), v.literal('ready'), v.literal('failed'));

export const llmRequestKind = v.union(
	v.literal('initial_draft'),
	v.literal('review_revision'),
	v.literal('user_feedback_revision')
);

export const nextInstructions = v.union(
	v.object({
		action: v.literal('call_reviewer'),
		artifactVersionId: v.id('artifactVersions'),
		reviewKind: v.union(v.literal('baseline_assessment'), v.literal('draft_review'))
	}),
	v.object({
		action: v.literal('call_writer'),
		requestKind: v.union(
			v.literal('initial_draft'),
			v.literal('review_revision'),
			v.literal('user_feedback_revision')
		),
		reviewId: v.union(v.id('reviews'), v.null()),
		basedOnVersionId: v.id('artifactVersions'),
		userMessageId: v.optional(v.id('messages'))
	}),
	v.object({
		action: v.literal('await_user')
	}),
	v.object({
		action: v.literal('generate_export'),
		artifactVersionId: v.id('artifactVersions')
	}),
	v.object({
		action: v.literal('done')
	})
);

export type NextInstruction =
	| {
			action: 'call_reviewer';
			artifactVersionId: Id<'artifactVersions'>;
			reviewKind: 'baseline_assessment' | 'draft_review';
	  }
	| {
			action: 'call_writer';
			reviewId: Id<'reviews'> | null;
			basedOnVersionId: Id<'artifactVersions'>;
			requestKind: 'initial_draft' | 'review_revision' | 'user_feedback_revision';
			userMessageId?: Id<'messages'>;
	  }
	| { action: 'await_user' }
	| {
			action: 'generate_export';
			artifactVersionId: Id<'artifactVersions'>;
	  }
	| { action: 'done' };

export const CritiquePlan = v.object({
	candidateFitSummary: v.string(),
	strengthsToEmphasize: v.array(v.string()),
	gapsOrRisks: v.array(
		v.object({
			title: v.string(),
			explanation: v.string(),
			suggestedFix: v.string(),
			severity: v.union(v.literal('low'), v.literal('medium'), v.literal('high'))
		})
	),
	targetKeywords: v.array(v.string()),
	experiencePriorities: v.array(v.string()),
	writerStrategy: v.array(v.string()),
	factualGuardrails: v.array(v.string()),
	suggestedResumeFocus: v.string(),
	resumeAlignmentScore: v.number(),
	keywordMatchScore: v.number(),
	yearsOfExperienceScore: v.number()
});

export const ReviewValidator = v.union(
	v.object({
		verdict: v.literal('approved'),
		summary: v.string(),
		blockingIssues: v.array(
			v.object({
				title: v.string(),
				explanation: v.string(),
				suggestedFix: v.string(),
				severity: v.union(v.literal('low'), v.literal('medium'), v.literal('high'))
			})
		),
		handoffInstructions: v.array(v.string()),
		approvalReason: v.string(),
		resumeAlignmentScore: v.number(),
		keywordMatchScore: v.number(),
		yearsOfExperienceScore: v.number()
	}),
	v.object({
		verdict: v.literal('revise'),
		summary: v.string(),
		blockingIssues: v.array(
			v.object({
				title: v.string(),
				explanation: v.string(),
				suggestedFix: v.string(),
				severity: v.union(v.literal('low'), v.literal('medium'), v.literal('high'))
			})
		),
		handoffInstructions: v.array(v.string()),
		approvalReason: v.optional(v.string()),
		resumeAlignmentScore: v.number(),
		keywordMatchScore: v.number(),
		yearsOfExperienceScore: v.number()
	})
);
