import type { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import type {
	InstructionExecutionClaim,
	ReviewerPlanContext,
	ReviewerReviewContext,
	WriterContext
} from './types';
import { handleErrorsFromConvexTransactions } from '$lib/utils/errorHandler';
import type { NextInstruction } from '../../../../convex/lib/schemaTypes';

export async function getReviewerPlanContext(
	convex: ConvexHttpClient,
	runId: Id<'runs'>,
	artifactVersionId: Id<'artifactVersions'>
): Promise<ReviewerPlanContext> {
	try {
		const result = await convex.action(api.runs.actions.getReviewerPlanContext, {
			runId,
			artifactVersionId
		});
		return result.data as ReviewerPlanContext;
	} catch (error) {
		throw handleErrorsFromConvexTransactions(error);
	}
}

export async function getReviewerReviewContext(
	convex: ConvexHttpClient,
	runId: Id<'runs'>,
	artifactVersionId: Id<'artifactVersions'>
): Promise<ReviewerReviewContext> {
	try {
		const result = await convex.action(api.runs.actions.getReviewerReviewContext, {
			runId,
			artifactVersionId
		});
		return result.data as ReviewerReviewContext;
	} catch (error) {
		throw handleErrorsFromConvexTransactions(error);
	}
}

export async function getWriterContext(
	convex: ConvexHttpClient,
	args: {
		runId: Id<'runs'>;
		basedOnVersionId: Id<'artifactVersions'>;
		reviewId: Id<'reviews'>;
		requestKind: 'initial_draft' | 'review_revision' | 'user_feedback_revision';
		userMessageId?: Id<'messages'>;
	}
): Promise<WriterContext> {
	try {
		const result = await convex.action(api.runs.actions.getWriterContext, args);
		return result.data as WriterContext;
	} catch (error) {
		throw handleErrorsFromConvexTransactions(error);
	}
}

export async function claimInstructionExecution(
	convex: ConvexHttpClient,
	claim: InstructionExecutionClaim
): Promise<void> {
	try {
		await convex.mutation(api.runs.index.claimInstructionExecution, claim);
	} catch (error) {
		handleErrorsFromConvexTransactions(error);
	}
}

export async function releaseInstructionExecution(
	convex: ConvexHttpClient,
	args: {
		runId: Id<'runs'>;
		executionId: string;
		outcome: 'completed' | 'failed' | 'cancelled';
	}
): Promise<void> {
	try {
		await convex.mutation(api.runs.index.releaseInstructionExecution, args);
	} catch (error) {
		handleErrorsFromConvexTransactions(error);
	}
}

export async function getNextInstructionForRun(
	convex: ConvexHttpClient,
	runId: Id<'runs'>
): Promise<NextInstruction> {
	try {
		const result = await convex.query(api.runs.index.getNextInstruction, { runId });
		return result;
	} catch (error) {
		throw handleErrorsFromConvexTransactions(error);
	}
}
