export const SCHEMA_VERSIONS = {
	critiquePlan: 'critique-plan-v1',
	reviewResult: 'review-v1',
	resume: 'resume-v1'
} as const;

export const OPERATION_KIND = {
	baselineReview: `baseline_review`,
	draftGeneration: `draft_generation`,
	draftReview: `draft_review`,
	draftRevision: `draft_revision`,
	revisionReview: `revision_review`,
	userFeedbackDraft: `user_feedback_draft`
} as const;

export const MESSAGE_LIMITS = {
	summary: 4000,
	review: 1800,
	preview: 1000
} as const;
