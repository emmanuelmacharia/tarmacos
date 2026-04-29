import { v } from 'convex/values';
import { mutation, type MutationCtx } from '../_generated/server';
import { assertFound, forbiddenCheck, mapConvexError, withAppErrors } from '../lib/errorMapper';
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
import { buildPromptText, byteLength } from '../lib/ai/utils';
import type { Id } from '../_generated/dataModel';

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

			const artifactVersion = assertFound(await ctx.db.get(args.artifactVersionId));

			const artifact = assertFound(await ctx.db.get(artifactVersion.artifactId));

			if (artifact.runId !== run._id) {
				mapConvexError({
					code: 'BAD_REQUEST',
					status: 412,
					message: 'Mismatch on run and artifacts',
					details: null
				});
			}

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
		openRouterRequestId: v.optional(v.string()),
		phase: runPhase,
		role: authorRole,
		attemptNumber: v.number(),
		retryOfCallId: v.optional(v.id('llmCalls')),
		gatewayProvider: v.optional(v.string()),
		modelSlug: v.string(),
		routedProvider: v.optional(v.string()),
		requestParams: v.any(),
		requestedStrategy: v.string(),
		strategyUsed: v.optional(v.string()),
		status: LlmCallStatus,
		latencyMs: v.optional(v.number()),
		inputTokens: v.optional(v.number()),
		outputTokens: v.optional(v.number()),
		reasoningTokens: v.optional(v.number()),
		cachedTokens: v.optional(v.number()),
		costUsd: v.optional(v.number()),
		finishReason: v.optional(v.string()),
		normalizationStatus: normalizationStatus,
		normalizationError: v.optional(v.string()),
		completedAt: v.optional(v.number()),
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
				runId: run._id,
				openRouterRequestId: args.openRouterRequestId,
				phase: args.phase,
				role: args.role,
				attemptNumber: args.attemptNumber,
				retryOfCallId: args.retryOfCallId,
				gatewayProvider: args.gatewayProvider,
				modelSlug: args.modelSlug,
				routedProvider: args.routedProvider,
				requestParams: args.requestParams,
				strategyUsed: args.strategyUsed,
				requestedStrategy: args.requestedStrategy,
				status: args.status,
				latencyMs: args.latencyMs,
				inputTokens: args.inputTokens,
				outputTokens: args.outputTokens,
				reasoningTokens: args.reasoningTokens,
				cachedTokens: args.cachedTokens,
				costUsd: args.costUsd,
				finishReason: args.finishReason,
				normalizationStatus: args.normalizationStatus,
				normalizationError: args.normalizationError,
				completedAt: args.completedAt,
				loopNumber: args.loopNumber,
				operationKind: args.operationKind,
				createdAt: new Date().getTime()
			};

			const llmCallId = await ctx.db.insert('llmCalls', payload);

			return ok(llmCallId, { message: 'Call created successfully', statusCode: 201 });
		});
	}
});

export const completeAiCall = mutation({
	args: {
		llmCallId: v.id('llmCalls'),
		status: LlmCallStatus,
		openRouterRequestId: v.optional(v.string()),
		strategyUsed: v.optional(v.string()),
		attemptNumber: v.number(),
		retryOfCallId: v.optional(v.id('llmCalls')),
		gatewayProvider: v.optional(v.string()),
		routedProvider: v.optional(v.string()),
		latencyMs: v.optional(v.number()),
		inputTokens: v.optional(v.number()),
		outputTokens: v.optional(v.number()),
		reasoningTokens: v.optional(v.number()),
		cachedTokens: v.optional(v.number()),
		costUsd: v.optional(v.number()),
		finishReason: v.optional(v.string()),
		normalizationStatus: v.optional(normalizationStatus),
		normalizationError: v.optional(v.string()),
		completedAt: v.optional(v.number()),
		loopNumber: v.optional(v.number()),
		content: v.object({
			kind: v.optional(llmContentKind),
			format: v.optional(llmContentFormat),
			storageKey: v.optional(v.string()),
			systemPrompt: v.string(),
			userPrompt: v.string(),
			rawResponse: v.string(),
			structuredOutput: v.optional(v.string()),
			reasoning: v.optional(v.string()),
			error: v.optional(v.any())
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

			if (llmCall.status !== 'running') {
				mapConvexError({
					code: 'BAD_REQUEST',
					status: 400,
					details: ``,
					message: `Expected running status, got ${llmCall.status}`
				});
			}

			const payload = {
				...Object.fromEntries(
					Object.entries({
						openRouterRequestId: args.openRouterRequestId,
						attemptNumber: args.attemptNumber,
						retryOfCallId: args.retryOfCallId,
						gatewayProvider: args.gatewayProvider,
						routedProvider: args.routedProvider,
						strategyUsed: args.strategyUsed,
						latencyMs: args.latencyMs,
						inputTokens: args.inputTokens,
						outputTokens: args.outputTokens,
						reasoningTokens: args.reasoningTokens,
						cachedTokens: args.cachedTokens,
						costUsd: args.costUsd,
						finishReason: args.finishReason,
						normalizationStatus: args.normalizationStatus,
						normalizationError: args.normalizationError,
						completedAt: args.completedAt,
						loopNumber: args.loopNumber,
						status: args.status
					}).filter(([, value]) => value !== undefined)
				)
			};

			await ctx.db.patch(llmCall._id, payload);
			const updatedCall = await ctx.db.get(llmCall._id);

			const now = Date.now();

			const promptText = buildPromptText(args.content.systemPrompt, args.content.userPrompt);

			if (promptText) {
				await insertLlmCallContentIfMissing(ctx, {
					llmCallId: args.llmCallId,
					kind: 'prompt' as const,
					format: 'text',
					text: promptText,
					createdAt: now
				});
			}

			if (args.content.rawResponse) {
				await insertLlmCallContentIfMissing(ctx, {
					llmCallId: args.llmCallId,
					kind: 'response',
					format: 'text',
					text: args.content.rawResponse,
					contentBytes: byteLength(args.content.rawResponse),
					createdAt: now
				});
			}

			if (args.content.structuredOutput !== undefined) {
				await insertLlmCallContentIfMissing(ctx, {
					llmCallId: args.llmCallId,
					kind: 'structured_output',
					format: 'json',
					json: args.content.structuredOutput,
					contentBytes: byteLength(JSON.stringify(args.content.structuredOutput)),
					createdAt: now
				});
			}

			if (args.content.reasoning) {
				await insertLlmCallContentIfMissing(ctx, {
					llmCallId: args.llmCallId,
					kind: 'reasoning',
					format: 'text',
					text: args.content.reasoning,
					contentBytes: byteLength(args.content.reasoning),
					createdAt: now
				});
			}

			if (args.content.error) {
				const errorText =
					typeof args.content.error === 'string'
						? args.content.error
						: JSON.stringify(args.content.error);
				await insertLlmCallContentIfMissing(ctx, {
					llmCallId: args.llmCallId,
					kind: 'raw_response',
					format: 'text',
					text: errorText,
					contentBytes: byteLength(errorText),
					createdAt: now
				});
			}

			return ok(updatedCall, { message: 'Call updated successfully', statusCode: 200 });
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

export const updateNormalization = mutation({
	args: {
		llmCallId: v.id('llmCalls'),
		normalizationStatus: v.union(v.literal('succeeded'), v.literal('failed')),
		normalizationError: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		withAppErrors(async () => {
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

			const llmCall = assertFound(await ctx.db.get(args.llmCallId), 'LLM call not found');

			const run = assertFound(await ctx.db.get(llmCall.runId), 'Run not found');

			forbiddenCheck(() => run.userId === user._id);

			if (llmCall.status !== 'completed') {
				mapConvexError({
					status: 400,
					message: `Cannot update normalization for llmCall with status ${llmCall.status}`,
					code: 'BAD_REQUEST',
					details: ''
				});
			}

			if (llmCall.normalizationStatus === 'succeeded' && args.normalizationStatus !== 'succeeded') {
				mapConvexError({
					status: 400,
					message: `Cannot downgrade normalization status from succeeded to failed`,
					code: 'BAD_REQUEST',
					details: ''
				});
			}

			if (
				args.normalizationStatus === 'failed' &&
				(!args.normalizationError || args.normalizationError.trim().length === 0)
			) {
				mapConvexError({
					status: 400,
					message: 'normalizationError is required when normalizationStatus is failed',
					code: 'BAD_REQUEST',
					details: ''
				});
			}

			await ctx.db.patch(args.llmCallId, {
				normalizationStatus: args.normalizationStatus,
				normalizationError:
					args.normalizationStatus === 'failed' ? args.normalizationError : undefined
			});

			return { ok: true };
		});
	}
});

async function insertLlmCallContentIfMissing(
	ctx: MutationCtx,
	doc: {
		llmCallId: Id<'llmCalls'>;
		kind:
			| 'prompt'
			| 'raw_request'
			| 'response'
			| 'raw_response'
			| 'reasoning'
			| 'structured_output';
		format: 'text' | 'json';
		text?: string;
		json?: string;
		contentBytes?: number;
		createdAt: number;
	}
) {
	const existing = await ctx.db
		.query('llmCallContents')
		.withIndex('by_call_kind', (q) => q.eq('llmCallId', doc.llmCallId).eq('kind', doc.kind))
		.first();

	if (existing) return;

	await ctx.db.insert('llmCallContents', {
		llmCallId: doc.llmCallId,
		kind: doc.kind,
		format: doc.format,
		text: doc.text,
		json: doc.json,
		storageKey: undefined,
		contentBytes: doc.contentBytes,
		createdAt: doc.createdAt
	});
}
