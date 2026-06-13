import { v } from 'convex/values';
import { mutation, query, type QueryCtx } from '../_generated/server';
import type { Doc, Id } from '../_generated/dataModel';
import { assertFound, forbiddenCheck, withAppErrors } from '../lib/errorMapper';
import {
	authorRole,
	authorType,
	messageBodyFormat,
	messageType,
	messageVisibility
} from '../lib/schemaTypes';
import { api } from '../_generated/api';
import { ok } from '../lib/responseMapper';

export const createMessage = mutation({
	args: {
		runId: v.id('runs'),
		authorType: authorType,
		authorRole: authorRole,
		messageType: messageType,
		visibility: messageVisibility,
		bodyFormat: messageBodyFormat,
		body: v.string(),
		relatedArtifactVersionId: v.optional(v.id('artifactVersions')),
		relatedReviewId: v.optional(v.id('reviews')) // fix when we get the review table
	},
	handler: async (ctx, args) => {
		return withAppErrors(async () => {
			const identity = assertFound(
				await ctx.auth.getUserIdentity(),
				'Please log in to continue',
				true
			);

			const clerkId = identity.subject;
			// get the user
			const user = assertFound(
				await ctx.db
					.query('users')
					.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkId))
					.unique(),
				'User not found',
				true
			);

			const run = assertFound(await ctx.db.get(args.runId));

			forbiddenCheck(() => run.userId === user._id);

			const payload = {
				runId: args.runId,
				sequenceNumber: run.nextMessageSequenceNumber,
				authorRole: args.authorRole,
				authorType: args.authorType,
				body: args.body,
				bodyFormat: args.bodyFormat,
				messageType: args.messageType,
				relatedArtifactVersionId: args.relatedArtifactVersionId,
				relatedReviewId: args.relatedReviewId,
				visibility: args.visibility,
				createdAt: new Date().getTime()
			};

			const message = await ctx.db.insert('messages', payload);

			// update the sequence number in the run

			await ctx.runMutation(api.runs.index.updateRun, {
				runId: run._id,
				nextMessageSequenceNumber: run.nextMessageSequenceNumber + 1
			});

			return ok(message, { message: 'Message created', statusCode: 201 });
		});
	}
});

export type MessageMetrics = {
	resumeAlignment: number;
	keywordMatch: number;
	experienceAlignment: number;
};

// Reviews store their scores inside the JSON `content` column — either at the top
// level (baseline critique plans) or nested under `content` (draft reviews). Scores
// are persisted on a 0-1 scale.
function parseReviewMetrics(content: string): MessageMetrics | null {
	try {
		const parsed = JSON.parse(content);
		const scores = typeof parsed?.resumeAlignmentScore === 'number' ? parsed : parsed?.content;
		if (
			typeof scores?.resumeAlignmentScore !== 'number' ||
			typeof scores?.keywordMatchScore !== 'number' ||
			typeof scores?.yearsOfExperienceScore !== 'number'
		) {
			return null;
		}
		const asPercent = (score: number) => Math.round(score <= 1 ? score * 100 : score);
		return {
			resumeAlignment: asPercent(scores.resumeAlignmentScore),
			keywordMatch: asPercent(scores.keywordMatchScore),
			experienceAlignment: asPercent(scores.yearsOfExperienceScore)
		};
	} catch {
		return null;
	}
}

async function getReasoningForLlmCall(
	ctx: QueryCtx,
	llmCallId: Id<'llmCalls'> | undefined
): Promise<string | null> {
	if (!llmCallId) return null;
	const content = await ctx.db
		.query('llmCallContents')
		.withIndex('by_call_kind', (q) => q.eq('llmCallId', llmCallId).eq('kind', 'reasoning'))
		.first();
	return content?.text ?? null;
}

export type ChatMessage = Doc<'messages'> & {
	metrics: MessageMetrics | null;
	reasoning: string | null;
};

export const getMessagesByRunId = query({
	args: { runId: v.id('runs') },
	handler: async (ctx, args) => {
		return withAppErrors(async () => {
			const identity = assertFound(
				await ctx.auth.getUserIdentity(),
				'Please log in to continue',
				true
			);

			const clerkId = identity.subject;
			// get the user
			const user = assertFound(
				await ctx.db
					.query('users')
					.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkId))
					.unique(),
				'User not found',
				true
			);

			const run = assertFound(await ctx.db.get(args.runId));

			forbiddenCheck(() => run.userId === user._id);

			const messages = await ctx.db
				.query('messages')
				.withIndex('by_run_visibility_seq', (q) =>
					q.eq('runId', args.runId).eq('visibility', 'user_visible')
				)
				.collect();

			// Enrich at read time: metrics come from the linked review row and the
			// execution trace from the originating llm call, so the stored message
			// format stays untouched.
			const enriched: ChatMessage[] = await Promise.all(
				messages.map(async (message) => {
					let metrics: MessageMetrics | null = null;
					let reasoning: string | null = null;

					if (message.authorType === 'agent') {
						if (message.relatedReviewId && message.authorRole === 'reviewer') {
							const review = await ctx.db.get(message.relatedReviewId);
							if (review) {
								metrics = parseReviewMetrics(review.content);
								reasoning = await getReasoningForLlmCall(ctx, review.sourceLlmCallId);
							}
						} else if (message.relatedArtifactVersionId && message.authorRole === 'writer') {
							const version = await ctx.db.get(message.relatedArtifactVersionId);
							reasoning = await getReasoningForLlmCall(ctx, version?.sourceLlmCallId);
						}
					}

					return { ...message, metrics, reasoning };
				})
			);

			return enriched;
		});
	}
});

export const getMessageById = query({
	args: { messageId: v.id('messages') },
	handler: async (ctx, args) => {
		return withAppErrors(async () => {
			const identity = assertFound(
				await ctx.auth.getUserIdentity(),
				'Please log in to continue',
				true
			);

			const clerkId = identity.subject;
			// get the user
			const user = assertFound(
				await ctx.db
					.query('users')
					.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkId))
					.unique(),
				'User not found',
				true
			);

			const message = assertFound(await ctx.db.get(args.messageId));

			const run = assertFound(await ctx.db.get(message?.runId));

			forbiddenCheck(() => run.userId === user._id);

			return message;
		});
	}
});
