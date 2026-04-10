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
	v.literal('baseline_review'),
	v.literal('drafting'),
	v.literal('reviewing'),
	v.literal('revision'),
	v.literal('user_review'),
	v.literal('finalizing')
);

// follow architecture doc for more indepth configs for our agents
export const agentConfig = v.object({
	reviewer: v.object({
		modelSlug: v.string()
	}),
	writer: v.object({
		modelSlug: v.string()
	})
});
