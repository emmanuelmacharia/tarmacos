import { v } from 'convex/values';
import { mutation } from '../_generated/server';
import { assertFound, forbiddenCheck, withAppErrors } from '../lib/errorMapper';
import {
	reviewType,
	reviewDecision,
	authorRole,
	runPhase,
	LlmCallStatus,
	normalizationStatus,
	operationKind,
	llmContentKind,
	llmContentFormat
} from '../lib/schemaTypes';
import { ok } from '../lib/responseMapper';

export const reviews = mutation({
	args: {
		runId: v.id('runs'),
		artifactVersionId: v.id('artifactVersions'),
		reviewKind: reviewType,
		decision: reviewDecision,
		summary: v.string(),
		content: v.string(),
		schemaVersion: v.string(),
		sourceLlmCallId: v.optional(v.id('llmCalls'))
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

			assertFound(await ctx.db.get(args.artifactVersionId));

			const payload = {
				...args,
				createdAt: new Date().getTime()
			};

			const reviewid = await ctx.db.insert('reviews', payload);

			return ok(reviewid, { message: 'Review created successfully', statusCode: 201 });
		});
	}
});

export const aiCall = mutation({
	args: {
		runId: v.id('runs'),
		openRouterRequestid: v.string(),
		phase: runPhase,
		role: authorRole,
		attemptNumber: v.number(),
		retryOfCallId: v.optional(v.id('llmCalls')),
		gatewayProvider: v.string(),
		modelSlug: v.string(),
		routedProvider: v.optional(v.string()),
		requestParams: v.any(),
		requestedStrategy: v.string(),
		strategyUsed: v.optional(v.string()),
		status: LlmCallStatus,
		latencyMs: v.optional(v.number()),
		inputTokens: v.optional(v.number()),
		outputToken: v.optional(v.number()),
		reasoningToken: v.optional(v.number()),
		cachedTokens: v.optional(v.number()),
		costUsd: v.optional(v.number()),
		finishReason: v.optional(v.string()),
		normalizationStatus: normalizationStatus,
		normalizationError: v.string(),
		completedAt: v.number(),
		loopNumber: v.number(),
		operationKind: operationKind,
		content: v.object({
			kind: llmContentKind,
			format: llmContentFormat,
			text: v.optional(v.string()),
			json: v.optional(v.string()),
			storageKey: v.optional(v.string()),
			contentBytes: v.optional(v.number())
		})
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
				...args,
				createdAt: new Date().getTime()
			};

			const llmCallId = await ctx.db.insert('llmCalls', payload);

			return ok(llmCallId, { message: 'Call created successfully', statusCode: 201 });
		});
	}
});

export const aiCallContent = mutation({
	args: {
		llmCallId: v.id('llmCalls'),
		kind: llmContentKind,
		format: llmContentFormat,
		text: v.optional(v.string()),
		json: v.optional(v.string()),
		storageKey: v.optional(v.string()),
		contentBytes: v.optional(v.number())
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

			const llmCall = assertFound(await ctx.db.get(args.llmCallId));

			const run = assertFound(await ctx.db.get(llmCall.runId));

			forbiddenCheck(() => run.userId === user._id);

			const payload = {
				...args,
				createdAt: new Date().getTime()
			};

			const contentId = await ctx.db.insert('llmCallContents', payload);

			return ok(contentId, { message: 'Content persisted', statusCode: 201 });
		});
	}
});
