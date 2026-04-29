import { v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { assertFound, forbiddenCheck, mapConvexError, withAppErrors } from '../lib/errorMapper';
import {
	agentConfig,
	CritiquePlan,
	documentPurpose,
	nextInstructions,
	runPhase,
	runStatus
} from '../lib/schemaTypes';
import { ok } from '../lib/responseMapper';
import { internal } from '../_generated/api';
import {
	deriveNextInstructionForRun,
	getExecutionClaim,
	getSafeMetadataObject,
	sameInstruction
} from '../lib/run/utils';

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

			console.log(payload);
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

			assertFound(await ctx.db.get(args.llmCallId));

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
				next: deriveNextInstructionForRun(ctx, updatedRun!)
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
		canonical: CompleteDraftCanonicalValidator
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

			const versionNo = artifact.nextVersionNumber;

			const origin =
				run.phase === 'drafting' ? ('agent_draft' as const) : ('agent_revision' as const);

			const artifactVersionId = await ctx.db.insert('artifactVersions', {
				artifactId: artifact._id,
				runId: run._id,
				versionNumber: versionNo,
				basedOnVersionId: basedOnVersion._id,
				origin,
				status: 'submitted_for_review',
				previewText: args.canonical.previewText,
				markdown: args.canonical.markdown,
				plainText: args.canonical.plainText,
				sourceLlmCallId: args.llmCallId,
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
				phase: 'reviewing' as const,
				status: 'running',
				nextMessageSequenceNumber: sqNo + 1,
				updatedAt: now
			});

			const updatedRun = await ctx.db.get(run._id);

			return {
				artifactVersionId,
				next: deriveNextInstructionForRun(ctx, updatedRun!)
			};
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

			await ctx.db.patch(args.runId, {
				metadata: {
					...getSafeMetadataObject(run.metadata),
					execution: {
						executionId: args.executionId,
						claimedAt: Date.now(),
						action: args.instruction.action
					}
				},
				updatedAt: Date.now()
			});

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
					message: `Mismatch in execution id`,
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
