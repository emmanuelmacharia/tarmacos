import { v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { assertFound, forbiddenCheck, mapConvexError, withAppErrors } from '../lib/errorMapper';
import {
	agentConfig,
	artifactType,
	documentPurpose,
	llmRequestKind,
	nextInstructions,
	runPhase,
	runStatus
} from '../lib/schemaTypes';
import { ok } from '../lib/responseMapper';
import { api, internal } from '../_generated/api';
import {
	artifactVersionToPromptText,
	deriveNextInstructionForRun,
	getExecutionClaim,
	getSafeMetadataObject,
	sameInstruction
} from './utils';

export const createRun = mutation({
	args: {
		profileId: v.id('profiles'),
		title: v.string(),
		status: v.optional(runStatus),
		phase: v.optional(runPhase),
		parentRunId: v.optional(v.id('runs')),
		agentConfig: agentConfig,
		metadata: v.optional(v.any()),
		documents: v.array(
			v.object({
				documentId: v.id('documents'),
				purpose: documentPurpose,
				extractedText: v.optional(v.string())
			})
		),
		artifact: v.object({
			type: artifactType,
			data: v.object({
				previewText: v.string(),
				canonicalJson: v.optional(v.string()),
				markdown: v.optional(v.string()),
				plainText: v.string(),
				contentHash: v.optional(v.string())
			})
		})
	},
	handler: async (ctx, args) => {
		return withAppErrors(async () => {
			// auth check
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

			// runs are created within profiles - we need to make sure those profiles belong to the user
			const profile = assertFound(await ctx.db.get(args.profileId));

			forbiddenCheck(() => profile.userId === user._id);

			const payload = {
				userId: user._id,
				profileId: profile._id,
				title: args.title,
				status: 'created' as const,
				phase: 'baseline_review' as const,
				nextMessageSequenceNumber: 0,
				loopCount: 0,
				parentRunId: args.parentRunId,
				metadata: args.metadata,
				agentConfig: args.agentConfig,
				createdAt: new Date().getTime(),
				updatedAt: new Date().getTime()
			};

			const runid = await ctx.db.insert('runs', payload);
			const run = assertFound(await ctx.db.get(runid));

			await ctx.runMutation(internal.runs.runDocuments.persistRunDocument, {
				runId: run._id,
				documents: args.documents
			});

			await ctx.runMutation(api.artifacts.index.createArtifact, {
				runId: run._id,
				artifactType: args.artifact.type,
				status: 'in_progress',
				versionData: { ...args.artifact.data }
			});

			return ok(
				{
					id: run._id,
					title: run.title,
					status: run.status,
					phase: run.phase,
					loopCount: run.loopCount,
					agentConfig: run.agentConfig,
					nextMessageSequenceNumber: run.nextMessageSequenceNumber
				},
				{ message: 'Run created', statusCode: 201 }
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

export const getReviewerPlanContext = query({
	args: {
		runId: v.id('runs'),
		artifactVersionId: v.id('artifactVersions')
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

			const artifactVersion = assertFound(
				await ctx.db.get(args.artifactVersionId),
				'Artifact version not found'
			);

			forbiddenCheck(() => run._id === artifactVersion.runId);

			// extracted text may be an issue - we have an upper limit on size
			const runDocuments = assertFound(
				await ctx.db
					.query('runDocuments')
					.withIndex('by_run', (q) => q.eq('runId', args.runId))
					.collect(),
				'Run documents not found'
			);
			return ok(
				{
					runId: run._id,
					artifactVersionId: artifactVersion._id,
					reviewer: run.agentConfig.reviewer,
					loopCount: run.loopCount,
					baselineCv: runDocuments.find((doc) => doc.purpose === 'baseline_resume')?.documentId,
					jobDescription: runDocuments.find((doc) => doc.purpose === 'job_description')?.documentId,
					supportingDocuments: runDocuments.filter((doc) => doc.purpose === 'supporting_documents')
				},
				{ message: 'Initial review context retrieved', statusCode: 200 }
			);
		});
	}
});

export const getReviewerReviewContext = query({
	args: {
		runId: v.id('runs'),
		artifactVersionId: v.id('artifactVersions')
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
			const artifactVersion = assertFound(await ctx.db.get(args.artifactVersionId));
			const runDocuments = assertFound(
				await ctx.db
					.query('runDocuments')
					.withIndex('by_run', (q) => q.eq('runId', args.runId))
					.collect(),
				'Run documents not found'
			);
			const reviews = await ctx.db
				.query('reviews')
				.withIndex('by_run_created_at', (q) => q.eq('runId', args.runId))
				.collect();
			const latestAssessment = reviews
				.filter((review) => review.reviewKind === 'baseline_assessment')
				.at(-1);

			const currentDraft = artifactVersionToPromptText(artifactVersion);
			return ok(
				{
					runId: run._id,
					artifactVersionId: artifactVersion._id,
					reviewer: run.agentConfig.reviewer,
					loopCount: run.loopCount,
					baselineCv: runDocuments.find((doc) => doc.purpose === 'baseline_resume')?.documentId,
					jobDescription: runDocuments.find((doc) => doc.purpose === 'job_description')?.documentId,
					supportingDocuments: runDocuments.filter((doc) => doc.purpose === 'supporting_documents'),
					critiquePlan: latestAssessment?.content,
					currentDraft
				},
				{ message: 'Review context found' }
			);
		});
	}
});

export const getWriterContext = query({
	args: {
		runId: v.id('runs'),
		basedOnVersionId: v.id('artifactVersions'),
		reviewId: v.id('reviews'),
		requestKind: llmRequestKind,
		userMessageId: v.optional(v.id('messages'))
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
			const artifactVersion = assertFound(await ctx.db.get(args.basedOnVersionId));
			const runDocuments = assertFound(
				await ctx.db
					.query('runDocuments')
					.withIndex('by_run', (q) => q.eq('runId', args.runId))
					.collect(),
				'Run documents not found'
			);
			const reviews = await ctx.db
				.query('reviews')
				.withIndex('by_run_created_at', (q) => q.eq('runId', args.runId))
				.collect();
			const baselineAssessment = reviews
				.filter((review) => review.reviewKind === 'baseline_assessment')
				.at(-1);
			const latestAssessment = reviews
				.filter((review) => review.reviewKind === 'draft_review')
				.at(-1);
			return ok(
				{
					runId: run._id,
					artifactVersion: artifactVersion._id,
					writer: run.agentConfig.writer,
					loopCount: run.loopCount,
					baselineCv: runDocuments.find((doc) => doc.purpose === 'baseline_resume')?.documentId,
					jobDescription: runDocuments.find((doc) => doc.purpose === 'job_description')?.documentId,
					supportingDocuments: runDocuments.filter((doc) => doc.purpose === 'supporting_documents'),
					baselineAssessment: baselineAssessment?.content,
					latestAssessment:
						latestAssessment?._id !== baselineAssessment?._id ? latestAssessment?.content : ''
				},
				{ message: 'Writer context found' }
			);
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
						execution: {
							executionId: args.executionId,
							claimedAt: Date.now(),
							action: args.instruction.action
						}
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
