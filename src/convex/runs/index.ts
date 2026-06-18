import { v } from 'convex/values';
import { internalMutation, mutation, query } from '../_generated/server';
import { assertFound, forbiddenCheck, mapConvexError, withAppErrors } from '../lib/errorMapper';
import {
	agentConfig,
	CanonicalReviewResult,
	CritiquePlan,
	documentPurpose,
	llmRequestKind,
	nextInstructions,
	runPhase,
	runStatus,
	type NextInstruction
} from '../lib/schemaTypes';
import { ok } from '../lib/responseMapper';
import { internal } from '../_generated/api';
import {
	deriveNextInstructionForRun,
	getExecutionClaim,
	getSafeMetadataObject,
	sameInstruction
} from '../lib/run/utils';
import type { Doc, Id } from '../_generated/dataModel';

const CanonicalResumeSectionValidator = v.object({
	kind: v.union(
		v.literal('header'),
		v.literal('summary'),
		v.literal('experience'),
		v.literal('skills'),
		v.literal('education'),
		v.literal('projects'),
		v.literal('certifications'),
		v.literal('other')
	),
	title: v.string(),
	lines: v.array(v.string())
});

const CanonicalResumeDocumentValidator = v.object({
	schemaVersion: v.string(),
	sections: v.array(CanonicalResumeSectionValidator)
});

const CompleteDraftCanonicalValidator = v.object({
	canonicalJson: CanonicalResumeDocumentValidator,
	markdown: v.string(),
	plainText: v.string(),
	previewText: v.string()
});

const DEFAULT_RUN_LIST_LIMIT = 20;
const MAX_RUN_LIST_LIMIT = 100;

export const listUserRuns = query({
	args: {
		limit: v.optional(v.number())
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

			const limit = Math.min(Math.max(args.limit ?? DEFAULT_RUN_LIST_LIMIT, 1), MAX_RUN_LIST_LIMIT);

			// fetch one extra row so the client knows whether a "load more" remains
			const rows = await ctx.db
				.query('runs')
				.withIndex('by_user_updated', (q) => q.eq('userId', user._id))
				.order('desc')
				.take(limit + 1);

			const hasMore = rows.length > limit;
			const runs = hasMore ? rows.slice(0, limit) : rows;

			// runs typically share a handful of profiles, so resolve each name once
			const profileNames = new Map<Id<'profiles'>, string>();
			for (const run of runs) {
				if (!profileNames.has(run.profileId)) {
					const profile = await ctx.db.get(run.profileId);
					profileNames.set(run.profileId, profile?.name ?? 'Deleted profile');
				}
			}

			// count ready exports per run so the history list can flag runs that
			// produced a downloadable file (plan §8, Phase 6)
			const enriched = await Promise.all(
				runs.map(async (run) => {
					const exports = await ctx.db
						.query('exports')
						.withIndex('by_run_createdat', (q) => q.eq('runId', run._id))
						.collect();
					const exportCount = exports.filter((e) => e.status === 'ready' && e.documentId).length;
					return {
						...run,
						profileName: profileNames.get(run.profileId) ?? '',
						exportCount
					};
				})
			);

			return ok({ hasMore, runs: enriched }, { message: 'Runs found', status: 200 });
		});
	}
});

export const getRun = query({
	args: {
		runId: v.id('runs'),
		getInstructions: v.optional(v.boolean())
	},
	handler: async (ctx, args) => {
		return withAppErrors(async () => {
			const identity = assertFound(await ctx.auth.getUserIdentity());
			const clerkId = identity.subject;
			const user = assertFound(
				await ctx.db
					.query('users')
					.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkId))
					.unique(),
				'User not found',
				true
			);

			const { runId } = args;
			const run = assertFound(await ctx.db.get(runId), 'Run not found');

			forbiddenCheck(() => run.userId === user._id);

			const next = args.getInstructions ? await deriveNextInstructionForRun(ctx, run) : undefined;
			return ok<{ run: Doc<'runs'>; next?: NextInstruction }, { message: string; status: number }>(
				{ run, ...(next ? { next } : {}) },
				{
					message: 'Run found',
					status: 200
				}
			);
		});
	}
});

export const updateRun = mutation({
	args: {
		runId: v.id('runs'),
		title: v.optional(v.string()),
		status: v.optional(runStatus),
		phase: v.optional(runPhase),
		currentArtifactId: v.optional(v.id('artifacts')),
		currentArtifactVersionId: v.optional(v.id('artifactVersions')),
		finalArtifactVersionId: v.optional(v.id('artifactVersions')),
		parentRunId: v.optional(v.id('runs')),
		nextMessageSequenceNumber: v.optional(v.number()),
		loopCount: v.optional(v.number()),
		agentConfig: v.optional(agentConfig),
		metadata: v.optional(v.any()),
		error: v.optional(v.any()),
		documents: v.optional(
			v.array(
				v.object({
					documentId: v.id('documents'),
					purpose: documentPurpose,
					extractedText: v.optional(v.string())
				})
			)
		)
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

			const { runId } = args;
			const run = assertFound(await ctx.db.get(runId), 'Run not found');

			forbiddenCheck(() => run.userId === user._id);

			const payload = {
				updatedAt: new Date().getTime(),
				...Object.fromEntries(
					Object.entries({
						title: args.title,
						status: args.status,
						phase: args.phase,
						currentArtifactId: args.currentArtifactId,
						finalArtifactVersionId: args.finalArtifactVersionId,
						currentArtifactVersionId: args.currentArtifactVersionId,
						parentRunId: args.parentRunId,
						nextMessageSequenceNumber: args.nextMessageSequenceNumber,
						loopCount: args.loopCount,
						agentConfig: args.agentConfig,
						metadata: args.metadata,
						error: args.error
					}).filter(([, value]) => value !== undefined)
				)
			};

			await ctx.db.patch(run._id, payload);

			const updatedRun = await ctx.db.get(run._id);

			if (args.documents && args.documents.length > 0) {
				await ctx.runMutation(internal.runs.runDocuments.persistRunDocument, {
					runId: run._id,
					documents: args.documents
				});
			}

			return ok(updatedRun, { message: 'Run updated successfully', statusCode: 200 });
		});
	}
});

export const cancelRun = mutation({
	args: {
		runId: v.id('runs'),
		reason: v.string()
	},
	handler: async (ctx, args) => {
		return withAppErrors(async () => {
			const identity = assertFound(
				await ctx.auth.getUserIdentity(),
				'Please log in or sign up to continue',
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
			const run = assertFound(await ctx.db.get(args.runId), 'Run not found');
			forbiddenCheck(() => run.userId === user._id);

			await ctx.db.patch(run._id, {
				status: 'cancelled' as const,
				updatedAt: Date.now(),
				error: args.reason
			});

			return ok({ ok: true }, { message: 'Run cancelled' });
		});
	}
});

export const failRun = mutation({
	args: {
		runId: v.id('runs'),
		error: v.any()
	},
	handler: async (ctx, args) => {
		return withAppErrors(async () => {
			const identity = assertFound(
				await ctx.auth.getUserIdentity(),
				'Please log in or sign up to continue',
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
			const run = assertFound(await ctx.db.get(args.runId), 'Run not found');
			forbiddenCheck(() => run.userId === user._id);
			await ctx.db.patch(run._id, {
				status: 'failed' as const,
				updatedAt: Date.now(),
				error: args.error
			});
			return ok({ ok: true }, { message: 'Run failed' });
		});
	}
});

export const completeBaselineReview = mutation({
	args: {
		runId: v.id('runs'),
		llmCallId: v.id('llmCalls'),
		messageSummary: v.string(),
		canonical: v.object({ summary: v.string(), content: CritiquePlan, schemaVersion: v.string() })
	},
	handler: async (ctx, args) => {
		return withAppErrors(async () => {
			const identity = assertFound(
				await ctx.auth.getUserIdentity(),
				'Please log in or sign up to continue',
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
			const run = assertFound(await ctx.db.get(args.runId), 'Run not found');
			forbiddenCheck(() => run.userId === user._id);

			const now = Date.now();

			if (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') {
				mapConvexError({
					status: 400,
					message: `Run is terminal: ${run.status}`,
					code: 'BAD_REQUEST',
					details: ''
				});
			}

			if (run.phase !== 'baseline_review') {
				mapConvexError({
					status: 400,
					message: `Invalid phase for completeBaselineReview: ${run.phase}`,
					code: 'BAD_REQUEST',
					details: ''
				});
			}

			if (!run.currentArtifactVersionId) {
				mapConvexError({
					status: 400,
					message: 'Run is missing currentArtifactVersionId during baseline review',
					code: 'BAD_REQUEST',
					details: ''
				});
			}

			const artifactVersion = assertFound(
				await ctx.db.get(run.currentArtifactVersionId),
				'Current artifact version not found'
			);

			forbiddenCheck(() => run._id === artifactVersion.runId);

			const llmCall = assertFound(await ctx.db.get(args.llmCallId));

			forbiddenCheck(() => llmCall.runId === run._id);

			const reviewPayload = {
				runId: run._id,
				artifactVersionId: artifactVersion._id,
				reviewKind: 'baseline_assessment' as const,
				decision: 'no-decision' as const,
				summary: args.canonical.summary,
				content: JSON.stringify(args.canonical.content),
				schemaVersion: args.canonical.schemaVersion,
				sourceLlmCallId: args.llmCallId,
				createdAt: now
			};

			const reviewId = await ctx.db.insert('reviews', reviewPayload);

			const sequenceNumber = run.nextMessageSequenceNumber;

			const messagePayload = {
				runId: run._id,
				sequenceNumber,
				authorType: 'agent' as const,
				authorRole: 'reviewer' as const,
				messageType: 'reviewer_summary' as const,
				visibility: 'user_visible' as const,
				bodyFormat: 'markdown' as const,
				body: args.messageSummary,
				relatedArtifactVersionId: artifactVersion._id,
				relatedReviewId: reviewId,
				createdAt: now
			};

			await ctx.db.insert('messages', messagePayload);

			await ctx.db.patch(run._id, {
				status: 'running' as const,
				phase: 'drafting' as const,
				nextMessageSequenceNumber: sequenceNumber + 1,
				updatedAt: now
			});

			const updatedRun = await ctx.db.get(run._id);

			return {
				next: await deriveNextInstructionForRun(ctx, updatedRun!)
			};
		});
	}
});

export const completeReview = mutation({
	args: {
		runId: v.id('runs'),
		llmCallId: v.id('llmCalls'),
		canonical: CanonicalReviewResult,
		messageSummary: v.string(),
		maxIterationsMessage: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		/**
		 * TODO:
		 * 1. persist the review in the reviews table
		 * 2. Update the run phase and status as appropriate
		 * 3. Derive the next instruction and return it to the caller
		 */
		return withAppErrors(async () => {
			const identity = assertFound(
				await ctx.auth.getUserIdentity(),
				'Please log in or sign up to continue',
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
			const run = assertFound(await ctx.db.get(args.runId), 'Run not found');
			forbiddenCheck(() => run.userId === user._id);

			const now = Date.now();

			if (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') {
				mapConvexError({
					status: 400,
					message: `Run is terminal: ${run.status}`,
					code: 'BAD_REQUEST',
					details: ''
				});
			}

			if (run.phase !== 'reviewing') {
				mapConvexError({
					status: 400,
					message: `Invalid phase for completeBaselineReview: ${run.phase}`,
					code: 'BAD_REQUEST',
					details: ''
				});
			}

			if (!run.currentArtifactVersionId) {
				mapConvexError({
					status: 400,
					message: 'Run is missing currentArtifactVersionId during baseline review',
					code: 'BAD_REQUEST',
					details: ''
				});
			}

			const llmCall = assertFound(await ctx.db.get(args.llmCallId));

			forbiddenCheck(() => llmCall.runId === run._id);

			const reviewPayload = {
				runId: run._id,
				artifactVersionId: run.currentArtifactVersionId,
				reviewKind: 'draft_review' as const,
				decision: args.canonical.decision,
				summary: args.canonical.summary,
				content: JSON.stringify(args.canonical),
				schemaVersion: args.canonical.schemaVersion,
				sourceLlmCallId: args.llmCallId,
				createdAt: now
			};

			const reviewId = await ctx.db.insert('reviews', reviewPayload);

			let sequenceNumber = run.nextMessageSequenceNumber;

			// a user-requested review (@reviewer) only reports feedback on the latest
			// draft — it never re-enters the writer loop or consumes an iteration
			const metadata = getSafeMetadataObject(run.metadata);
			const isUserRequestedReview = metadata.userRequestedReview === true;

			const loopCount = isUserRequestedReview ? run.loopCount : run.loopCount + 1;

			const maxIterationsMessage =
				args.maxIterationsMessage ??
				'Review limit reached. The latest draft is ready for your review.';

			const messagePayload = {
				runId: run._id,
				sequenceNumber,
				authorType: 'agent' as const,
				authorRole: 'reviewer' as const,
				messageType: 'reviewer_summary' as const,
				visibility: 'user_visible' as const,
				bodyFormat: 'markdown' as const,
				body: args.messageSummary,
				relatedArtifactVersionId: run.currentArtifactVersionId,
				relatedReviewId: reviewId,
				createdAt: now
			};

			await ctx.db.insert('messages', messagePayload);

			if (!isUserRequestedReview && loopCount > run.agentConfig.maxIterations) {
				const maxIterMessagePayload = {
					runId: run._id,
					sequenceNumber: sequenceNumber + 1,
					authorType: 'system' as const,
					authorRole: 'system' as const,
					messageType: 'system_status' as const,
					visibility: 'user_visible' as const,
					bodyFormat: 'markdown' as const,
					body: maxIterationsMessage,
					relatedArtifactVersionId: run.currentArtifactVersionId,
					relatedReviewId: reviewId,
					createdAt: now
				};

				await ctx.db.insert('messages', maxIterMessagePayload);

				sequenceNumber++;
			}

			const handBackToUser =
				isUserRequestedReview ||
				args.canonical.decision === 'approve' ||
				loopCount > run.agentConfig.maxIterations;

			const status = handBackToUser ? ('awaiting_user' as const) : ('running' as const);
			const phase = handBackToUser ? ('user_review' as const) : ('revision' as const);

			if (isUserRequestedReview) {
				delete metadata.userRequestedReview;
			}

			await ctx.db.patch(run._id, {
				status,
				phase,
				metadata,
				nextMessageSequenceNumber: sequenceNumber + 1,
				loopCount,
				updatedAt: now
			});

			const updatedRun = await ctx.db.get(run._id);

			return {
				next: await deriveNextInstructionForRun(ctx, updatedRun!)
			};
		});
	}
});

export const completeDraft = mutation({
	args: {
		runId: v.id('runs'),
		llmCallId: v.id('llmCalls'),
		basedOnVersionId: v.id('artifactVersions'),
		messageSummary: v.string(),
		canonical: CompleteDraftCanonicalValidator,
		requestKind: v.optional(llmRequestKind)
	},
	handler: async (ctx, args) => {
		return withAppErrors(async () => {
			const identity = assertFound(
				await ctx.auth.getUserIdentity(),
				'Please log in or sign up to continue',
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
			const run = assertFound(await ctx.db.get(args.runId), 'Run not found');
			forbiddenCheck(() => run.userId === user._id);

			const now = Date.now();

			if (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') {
				mapConvexError({
					status: 400,
					message: `Run is terminal: ${run.status}`,
					code: 'BAD_REQUEST',
					details: ''
				});
			}
			if (run.phase !== 'drafting' && run.phase !== 'revision') {
				mapConvexError({
					status: 400,
					message: `Run is in: ${run.phase} state. Cannot complete drafting`,
					code: 'BAD_REQUEST',
					details: ''
				});
			}

			if (!run.currentArtifactId || !run.currentArtifactVersionId) {
				mapConvexError({
					status: 400,
					message: 'Run is missing current artifact pointers during draft completion',
					code: 'BAD_REQUEST',
					details: ''
				});
			}

			if (run.currentArtifactVersionId !== args.basedOnVersionId) {
				mapConvexError({
					status: 400,
					message: 'basedOnVersionId does not match run currentArtifactVersionId',
					code: 'BAD_REQUEST',
					details: ''
				});
			}

			const artifact = assertFound(await ctx.db.get(run.currentArtifactId), 'Artifact not found');

			forbiddenCheck(() => artifact.runId === run._id);

			const basedOnVersion = assertFound(
				await ctx.db.get(args.basedOnVersionId),
				'Based-on artifact version not found'
			);

			forbiddenCheck(() => basedOnVersion.runId === run._id);

			forbiddenCheck(() => basedOnVersion.artifactId === artifact._id);

			const llmCall = assertFound(await ctx.db.get(args.llmCallId), 'LLM call not found');
			forbiddenCheck(() => llmCall.runId === run._id);

			const versionNo = artifact.nextVersionNumber;

			// drafts written from user feedback skip the reviewer and go straight
			// back to the user, so they are never submitted for review
			const isUserFeedbackDraft = args.requestKind === 'user_feedback_revision';

			const origin = isUserFeedbackDraft
				? ('user_revisions' as const)
				: run.phase === 'drafting'
					? ('agent_draft' as const)
					: ('agent_revision' as const);

			const canonicalJson = args.canonical.canonicalJson
				? typeof args.canonical.canonicalJson !== 'string'
					? JSON.stringify(args.canonical.canonicalJson)
					: args.canonical.canonicalJson
				: '';

			const artifactVersionId = await ctx.db.insert('artifactVersions', {
				artifactId: artifact._id,
				runId: run._id,
				versionNumber: versionNo,
				basedOnVersionId: basedOnVersion._id,
				origin,
				status: isUserFeedbackDraft ? ('draft' as const) : ('submitted_for_review' as const),
				previewText: args.canonical.previewText,
				markdown: args.canonical.markdown,
				plainText: args.canonical.plainText,
				sourceLlmCallId: args.llmCallId,
				canonicalJson,
				createdAt: now
			});

			await ctx.db.patch(artifact._id, {
				currentVersionId: artifactVersionId,
				nextVersionNumber: versionNo + 1,
				updatedAt: now
			});

			const sqNo = run.nextMessageSequenceNumber;

			await ctx.db.insert('messages', {
				runId: run._id,
				sequenceNumber: sqNo,
				authorRole: 'writer' as const,
				authorType: 'agent' as const,
				messageType: 'draft_announcement',
				visibility: 'user_visible',
				bodyFormat: 'markdown' as const,
				body: args.messageSummary,
				relatedArtifactVersionId: artifactVersionId,
				relatedReviewId: undefined,
				createdAt: now
			});

			await ctx.db.patch(run._id, {
				currentArtifactVersionId: artifactVersionId,
				phase: isUserFeedbackDraft ? ('user_review' as const) : ('reviewing' as const),
				status: isUserFeedbackDraft ? ('awaiting_user' as const) : ('running' as const),
				nextMessageSequenceNumber: sqNo + 1,
				updatedAt: now
			});

			const updatedRun = await ctx.db.get(run._id);

			return {
				artifactVersionId,
				next: await deriveNextInstructionForRun(ctx, updatedRun!)
			};
		});
	}
});

export const submitUserFeedback = mutation({
	args: {
		runId: v.id('runs'),
		body: v.string(),
		target: v.union(v.literal('writer'), v.literal('reviewer')),
		maxUserFeedbackIterations: v.number(),
		limitMessage: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		return withAppErrors(async () => {
			const identity = assertFound(
				await ctx.auth.getUserIdentity(),
				'Please log in or sign up to continue',
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
			const run = assertFound(await ctx.db.get(args.runId), 'Run not found');
			forbiddenCheck(() => run.userId === user._id);

			const now = Date.now();

			if (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') {
				mapConvexError({
					status: 400,
					message: `Run is terminal: ${run.status}`,
					code: 'BAD_REQUEST',
					details: ''
				});
			}

			if (run.status !== 'awaiting_user' || run.phase !== 'user_review') {
				mapConvexError({
					status: 400,
					message:
						'The models are still working on this run. Feedback can only be given once a draft is ready for your review.',
					code: 'BAD_REQUEST',
					details: { status: run.status, phase: run.phase }
				});
			}

			if (!run.currentArtifactVersionId) {
				mapConvexError({
					status: 400,
					message: 'Run is missing currentArtifactVersionId during user review',
					code: 'BAD_REQUEST',
					details: ''
				});
			}

			const messages = await ctx.db
				.query('messages')
				.withIndex('by_run', (q) => q.eq('runId', run._id))
				.collect();

			// the initial prompt is a 'user_prompt'; every feedback round is persisted
			// as a 'revision_request', so this count is exactly the rounds consumed
			const feedbackCount = messages.filter(
				(message) => message.authorType === 'user' && message.messageType === 'revision_request'
			).length;

			const sequenceNumber = run.nextMessageSequenceNumber;

			if (feedbackCount >= args.maxUserFeedbackIterations) {
				const limitBody =
					args.limitMessage ??
					`You've reached the limit of ${args.maxUserFeedbackIterations} feedback rounds for this run. The latest draft is final — you can download it or start a new run.`;

				const lastMessage = messages.at(-1);
				const alreadyNotified =
					lastMessage?.authorType === 'system' && lastMessage.body === limitBody;

				if (!alreadyNotified) {
					await ctx.db.insert('messages', {
						runId: run._id,
						sequenceNumber,
						authorType: 'system' as const,
						authorRole: 'system' as const,
						messageType: 'system_status' as const,
						visibility: 'user_visible' as const,
						bodyFormat: 'markdown' as const,
						body: limitBody,
						relatedArtifactVersionId: run.currentArtifactVersionId,
						createdAt: now
					});

					await ctx.db.patch(run._id, {
						nextMessageSequenceNumber: sequenceNumber + 1,
						updatedAt: now
					});
				}

				return {
					limitReached: true as const,
					next: { action: 'await_user' } as NextInstruction
				};
			}

			await ctx.db.insert('messages', {
				runId: run._id,
				sequenceNumber,
				authorType: 'user' as const,
				authorRole: 'user' as const,
				messageType: 'revision_request' as const,
				visibility: 'user_visible' as const,
				bodyFormat: 'markdown' as const,
				body: args.body,
				relatedArtifactVersionId: run.currentArtifactVersionId,
				createdAt: now
			});

			// @writer feedback re-enters drafting (the writer revises the latest draft);
			// @reviewer only asks for a fresh review of the latest draft, flagged so
			// completeReview hands control straight back to the user
			const metadata = getSafeMetadataObject(run.metadata);
			if (args.target === 'reviewer') {
				metadata.userRequestedReview = true;
			} else {
				delete metadata.userRequestedReview;
			}

			await ctx.db.patch(run._id, {
				status: 'running' as const,
				phase: args.target === 'writer' ? ('drafting' as const) : ('reviewing' as const),
				metadata,
				nextMessageSequenceNumber: sequenceNumber + 1,
				updatedAt: now
			});

			const updatedRun = await ctx.db.get(run._id);

			return {
				limitReached: false as const,
				next: await deriveNextInstructionForRun(ctx, updatedRun!)
			};
		});
	}
});

const STALE_EXECUTION_CLAIM_MS = 120_000;

export const resetRunForResume = mutation({
	args: {
		runId: v.id('runs')
	},
	handler: async (ctx, args) => {
		return withAppErrors(async () => {
			const identity = assertFound(
				await ctx.auth.getUserIdentity(),
				'Please log in or sign up to continue',
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
			const run = assertFound(await ctx.db.get(args.runId), 'Run not found');
			forbiddenCheck(() => run.userId === user._id);

			if (run.status === 'completed' || run.status === 'cancelled') {
				return ok({ reset: false }, { message: `Run is ${run.status}` });
			}

			const now = Date.now();
			const claim = getExecutionClaim(run);
			const claimIsStale = claim !== undefined && now - claim.claimedAt > STALE_EXECUTION_CLAIM_MS;

			if (!claimIsStale && run.status !== 'failed') {
				return ok({ reset: false }, { message: 'Run does not need a reset' });
			}

			const metadata = getSafeMetadataObject(run.metadata);
			if (claimIsStale) {
				delete metadata.execution;
			}

			await ctx.db.patch(run._id, {
				metadata,
				...(run.status === 'failed' ? { status: 'running' as const, error: null } : {}),
				updatedAt: now
			});

			return ok({ reset: true }, { message: 'Run is ready to resume' });
		});
	}
});

export const claimInstructionExecution = mutation({
	args: {
		runId: v.id('runs'),
		executionId: v.string(),
		instruction: nextInstructions
	},
	handler: async (ctx, args) => {
		return withAppErrors(async () => {
			const identity = assertFound(
				await ctx.auth.getUserIdentity(),
				'Please log in or sign up to continue',
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
			const run = assertFound(await ctx.db.get(args.runId), 'Run not found');
			forbiddenCheck(() => run.userId === user._id);

			if (run.status === 'cancelled' || run.status === 'completed' || run.status === 'failed') {
				mapConvexError({
					status: 400,
					message: 'Cannot claim instruction for terminated run',
					details: run.status,
					code: 'BAD_REQUEST'
				});
			}

			const currentInstruction = await deriveNextInstructionForRun(ctx, run);

			if (currentInstruction.action === 'await_user' || currentInstruction.action === 'done') {
				mapConvexError({
					message: `Run ${args.runId} is not in an executable state`,
					status: 400,
					code: 'BAD_REQUEST',
					details: { nextAction: currentInstruction }
				});
			}

			if (!sameInstruction(currentInstruction, args.instruction)) {
				mapConvexError({
					message: `Stale or invalid instruction. Refused to claim execution`,
					status: 400,
					code: 'BAD_REQUEST',
					details: { nextAction: currentInstruction }
				});
			}

			const existingClaim = getExecutionClaim(run);

			if (existingClaim) {
				mapConvexError({
					message: `Instruction already claimed by execution ${existingClaim.executionId}`,
					status: 400,
					code: 'BAD_REQUEST',
					details: { nextAction: currentInstruction }
				});
			}

			const payload = {
				metadata: {
					...getSafeMetadataObject(run.metadata),
					execution: {
						executionId: args.executionId,
						claimedAt: Date.now(),
						action: args.instruction.action
					}
				},
				updatedAt: Date.now()
			};

			await ctx.db.patch(args.runId, payload);

			await ctx.db.get(args.runId);

			return ok({ ok: true }, { message: 'Instruction claimed!' });
		});
	}
});

export const releaseInstructionExecution = mutation({
	args: {
		runId: v.id('runs'),
		executionId: v.string(),
		outcome: v.union(v.literal('completed'), v.literal('failed'), v.literal('cancelled'))
	},
	handler: async (ctx, args) => {
		return withAppErrors(async () => {
			const identity = assertFound(
				await ctx.auth.getUserIdentity(),
				'Please log in or sign up to continue',
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
			const run = assertFound(await ctx.db.get(args.runId), 'Run not found');
			forbiddenCheck(() => run.userId === user._id);
			const existingClaim = getExecutionClaim(run);

			if (!existingClaim) {
				return ok({ ok: true }, {});
			}

			if (existingClaim.executionId !== args.executionId) {
				mapConvexError({
					message: `Mismatch in execution id ${existingClaim.executionId} doesnt match payload execution id ${args.executionId}. Refused to release claim`,
					status: 400,
					code: 'BAD_REQUEST',
					details: { executionId: existingClaim.executionId }
				});
			}

			const metadata = getSafeMetadataObject(run.metadata);
			const nextMetadata = { ...metadata };

			delete nextMetadata.execution;

			await ctx.db.patch(run._id, { metadata: nextMetadata, updatedAt: Date.now() });

			return ok({ ok: true }, {});
		});
	}
});

export const killExecution = internalMutation({
	args: {
		runId: v.id('runs')
	},
	handler: async (ctx, args) => {
		return withAppErrors(async () => {
			const run = assertFound(await ctx.db.get(args.runId), 'Run not found');
			const existingClaim = getExecutionClaim(run);
			if (!existingClaim) {
				return ok({ ok: true }, {});
			}

			const metadata = getSafeMetadataObject(run.metadata);
			const nextMetadata = { ...metadata };

			delete nextMetadata.execution;

			await ctx.db.patch(run._id, { metadata: nextMetadata, updatedAt: Date.now() });

			return ok({ ok: true }, {});
		});
	}
});

export const getNextInstruction = query({
	args: { runId: v.id('runs') },
	handler: async (ctx, args) => {
		return withAppErrors(async () => {
			const identity = assertFound(
				await ctx.auth.getUserIdentity(),
				'Please log in or sign up to continue',
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
			const run = assertFound(await ctx.db.get(args.runId), 'Run not found');
			forbiddenCheck(() => run.userId === user._id);

			return deriveNextInstructionForRun(ctx, run);
		});
	}
});
