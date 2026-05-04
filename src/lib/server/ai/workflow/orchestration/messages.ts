import { MESSAGE_LIMITS } from './constants';
import type {
	NormalizedCritiquePlan,
	NormalizedDraft,
	NormalizedReviewResult
} from './normalization';

export function buildBaselineAssessmentMessage(plan: NormalizedCritiquePlan): string {
	const strengths = plan.strengthsToEmphasize.length;
	const gaps = plan.gapsOrRisks.length;
	const highGaps = plan.gapsOrRisks.filter((gap) => gap.severity === 'high').length;

	const confidenceScoreUserView = calculateConfidenceScore(
		plan.resumeAlignmentScore,
		plan.keywordMatchScore,
		plan.yearsOfExperienceScore
	);
	let message = `Baseline assessment complete (${confidenceScoreUserView}% confidence). `;
	message += plan.candidateFitSummary.slice(0, 180);
	if (plan.candidateFitSummary.length > 180) message += '…';
	message += ` Found ${strengths} strengths to emphasize`;

	if (gaps > 0) {
		message += ` and ${gaps} gap${gaps > 1 ? 's' : ''} to address`;
		if (highGaps > 0) {
			message += ` (${highGaps} high severity)`;
		}
	}

	message += '. Starting draft.';

	return clampMessage(message);
}

export function buildDraftAnnouncementMessage(args: {
	iteration: number;
	isRevision: boolean;
	draft: NormalizedDraft;
}): string {
	const label = args.isRevision
		? `Revision ${args.iteration} ready for review. `
		: 'First tailored draft ready for review. ';

	return clampMessage(`${label}${args.draft.previewText}`);
}

export function buildReviewMessage(review: NormalizedReviewResult, iteration: number): string {
	if (review.verdict === 'approved') {
		const reason = review.approvalReason || review.summary;
		return clampMessage(`Review ${iteration} approved. ${reason.slice(0, 260)}`);
	}

	const issues = review.blockingIssues
		.slice(0, 3)
		.map((issue) => issue.title)
		.join(', ');

	return clampMessage(`Review ${iteration} requested revisions. Main issues: ${issues}.`);
}

export function buildMaxIterationsMessage(iterations: number): string {
	return clampMessage(
		`Review limit reached after ${iterations} iteration${
			iterations === 1 ? '' : 's'
		}. The latest draft is ready for your review or for specific change requests.`
	);
}

function clampMessage(text: string): string {
	return text.length > MESSAGE_LIMITS.summary
		? `${text.slice(0, MESSAGE_LIMITS.summary - 1)}…`
		: text;
}

function calculateConfidenceScore(alignment: number, keywords: number, experience: number): number {
	const sum = alignment + keywords + experience;
	return (sum / 3) * 100;
}
