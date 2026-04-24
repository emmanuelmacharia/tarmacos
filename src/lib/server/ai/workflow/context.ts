import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import type {
	ConvexClient,
	InstructionExecutionClaim,
	NextInstruction,
	ReviewerPlanContext,
	ReviewerReviewContext,
	WriterContext
} from './types';

export async function getReviewerPlanContext(
	convex: ConvexClient,
	runId: Id<'runs'>,
	artifactVersionId: Id<'artifactVersions'>
): Promise<ReviewerPlanContext> {
	return convex.query(api.runs.index.getReviewerPlanContext, { runId, artifactVersionId });
}

export async function getReviewerReviewContext(
	convex: ConvexClient,
	runId: Id<'runs'>,
	artifactVersionId: Id<'artifactVersions'>
): Promise<ReviewerReviewContext> {
	return convex.query(api.runs.index.getReviewerReviewContext, { runId, artifactVersionId });
}

export async function getWriterContext(
	convex: ConvexClient,
	args: {
		runId: Id<'runs'>;
		basedOnVersionId: Id<'artifactVersions'>;
		reviewId: Id<'reviews'>;
		requestKind: 'initial_draft' | 'review_revisions' | 'user_feedback_revision';
		userMessageId: Id<'messages'>;
	}
): Promise<WriterContext> {
	return convex.query(api.runs.index.getWriterContext, args);
}

export async function claimInstructionExecution(
	convex: ConvexClient,
	claim: InstructionExecutionClaim
): Promise<void> {
	await convex.mutation(api.runs.index.claimInstructionExecution, claim);
}

export async function releaseInstructionExecution(
	convex: ConvexClient,
	args: {
		runId: Id<'runs'>;
		executionId: string;
		outcome: 'completed' | 'failed' | 'cancelled';
	}
): Promise<void> {
	await convex.mutation(api.runs.index.releaseInstructionExecution, args);
}

export async function getNextInstructionForRun(
	convex: ConvexClient,
	runId: Id<'runs'>
): Promise<NextInstruction> {
	return await convex.query(api.runs.index.getNextInstruction, { runId });
}
