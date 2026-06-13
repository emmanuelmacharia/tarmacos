import { MESSAGE_LIMITS } from './constants';
import type {
	NormalizedCritiquePlan,
	NormalizedDraft,
	NormalizedReviewResult
} from './normalization';

export function buildInitialPromptMessage(
	instructions: {
		profile: { writer: string | undefined; reviewer: string | undefined };
		job: string;
	},
	title: string
): string {
	const message = [
		`## ${title}`,
		'',
		'Please review the job description and my resume, then rewrite my resume so it better aligns with the role. Highlight my most important relevant experience, skills, and achievements, include important keywords from the jd, and keep everything accurate, professional, and easy to read',
		''
	];

	const steeringInstructions = [
		'## Steering instructions',
		'',
		`- ${instructions.job?.slice(0, 2000)}${instructions.job?.length > 2000 ? '…' : ''}`,
		`- ${instructions.profile?.writer ? `Writer profile: ${instructions.profile.writer.slice(0, 2000)}${instructions.profile.writer.length > 2000 ? '…' : ''}` : ''}`,
		`- ${instructions.profile?.reviewer ? `Reviewer profile: ${instructions.profile.reviewer.slice(0, 2000)}${instructions.profile.reviewer.length > 2000 ? '…' : ''}` : ''}`
	];

	console.log('steeringInstructions', steeringInstructions);

	const appendSteering = steeringInstructions.filter((s) => !!s && s.trim().length > 1).length > 1;

	const finalMessage = appendSteering
		? [...message, '', ...steeringInstructions].join('\n')
		: message.join('\n');

	return clampMessage(finalMessage);
}

export function buildBaselineAssessmentMessage(plan: NormalizedCritiquePlan): string {
	// scores are intentionally omitted from the body — the chat UI renders them
	// graphically from the linked review row
	const message = [
		'## Baseline Assessment',
		'',
		'### Summary',
		'',
		`${plan.candidateFitSummary.slice(0, 1000)}${
			plan.candidateFitSummary.length > 1000 ? '…' : ''
		}`,
		'',
		'### Strengths to emphasize',
		'',
		...plan.strengthsToEmphasize.slice(0, 3).map((s) => `- ${s}`),
		'',
		'### Gaps or risks to address',
		'',
		...plan.gapsOrRisks.slice(0, 3).map((g) => `- ${g.title} (severity: ${g.severity})`),
		'',
		'### Next steps',
		'',
		...plan.writerStrategy.slice(0, 3).map((s) => `- ${s}`)
	].join('\n');

	return clampMessage(message);
}

export function buildDraftAnnouncementMessage(args: {
	iteration: number;
	isRevision: boolean;
	isUserFeedback?: boolean;
	draft: NormalizedDraft;
}): string {
	const label = args.isUserFeedback
		? 'I have updated the draft based on your feedback. '
		: args.isRevision
			? `Revision ${args.iteration} ready for review. `
			: 'First tailored draft ready for review. ';

	const message = [`${label}`, ''].join('\n');

	return clampMessage(message);
}

export function buildReviewMessage(review: NormalizedReviewResult, iteration: number): string {
	if (review.verdict === 'approved') {
		const reason = review.approvalReason || review.summary;
		console.log('review', review);

		const message = [
			`${iteration === 0 ? '## First Review' : '## Review ' + (iteration + 1)} - ${review.verdict}`,
			'',
			'### Summary',
			'',
			`${reason.slice(0, 1800)}${reason.length > 1800 ? '…' : ''}`
		].join('\n');

		return clampMessage(message);
	}

	const message = [
		`${iteration === 0 ? '## First Review' : '## Review ' + (iteration + 1)} - ${review.verdict}`,
		'',
		'### Summary',
		'',
		`${review.summary.slice(0, 1000)}${review.summary.length > 1000 ? '…' : ''}`,
		'',
		'### Blocking issues to address',
		'',
		...review.blockingIssues
			.slice(0, 3)
			.map((issue) => `- ${issue.title} (severity: ${issue.severity})`),
		'',
		'### Handoff instructions for writer',
		'',
		...review.handoffInstructions.slice(0, 3).map((instruction) => `- ${instruction}`)
	].join('\n');

	return clampMessage(message);
}

export function buildMaxIterationsMessage(iterations: number): string {
	return clampMessage(
		`Review limit reached after ${iterations} iteration${
			iterations === 1 ? '' : 's'
		}. The latest draft is ready for your review or for specific change requests.`
	);
}

export function buildUserFeedbackLimitMessage(maxFeedbackRounds: number): string {
	return clampMessage(
		`You've reached the limit of ${maxFeedbackRounds} feedback round${
			maxFeedbackRounds === 1 ? '' : 's'
		} for this run. The latest draft is final — you can download it or start a new run to keep iterating.`
	);
}

function clampMessage(text: string): string {
	return text.length > MESSAGE_LIMITS.summary
		? `${text.slice(0, MESSAGE_LIMITS.summary - 1)}…`
		: text;
}
