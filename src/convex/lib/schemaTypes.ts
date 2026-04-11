import { v } from 'convex/values';

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

// TODO: follow architecture doc for more indepth configs for our agents
export const agentConfig = v.object({
	reviewer: v.object({
		modelSlug: v.string()
	}),
	writer: v.object({
		modelSlug: v.string()
	})
});

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
	v.literal('approve'),
	v.literal('revise'),
	v.literal('approve')
);

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
