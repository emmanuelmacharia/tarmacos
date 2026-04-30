import { v } from 'convex/values';
import { internal } from '../_generated/api';
import { internalMutation, internalQuery } from '../_generated/server';
import { assertFound } from '../lib/errorMapper';
import {
	runStatus,
	runPhase,
	agentConfig,
	documentPurpose,
	artifactType
} from '../lib/schemaTypes';

export const createRunWithDocumentsAndArtifact = internalMutation({
	args: {
		userId: v.id('users'),
		profileId: v.id('profiles'),
		title: v.string(),
		status: v.optional(runStatus),
		phase: v.optional(runPhase),
		parentRunId: v.optional(v.id('runs')),
		agentConfig: agentConfig,
		metadata: v.optional(v.any()),
		instructionSnapshot: v.optional(
			v.object({
				profile: v.optional(
					v.object({
						writer: v.optional(v.string()),
						reviewer: v.optional(v.string())
					})
				),
				job: v.optional(v.string())
			})
		),
		documents: v.array(
			v.object({
				documentId: v.id('documents'),
				purpose: documentPurpose,
				extractedText: v.optional(v.string()),
				extractedTextSource: v.optional(
					v.object({
						kind: v.literal('storage'),
						storageId: v.id('_storage'),
						mimeType: v.literal('text/plain'),
						byteLength: v.number()
					})
				)
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
		const now = Date.now();
		const payload = {
			userId: args.userId,
			profileId: args.profileId,
			title: args.title,
			status: 'created' as const,
			phase: 'baseline_review' as const,
			nextMessageSequenceNumber: 0,
			loopCount: 0,
			parentRunId: args.parentRunId,
			metadata: args.metadata,
			agentConfig: args.agentConfig,
			createdAt: now,
			updatedAt: now,
			instructionSnapshot: args.instructionSnapshot
		};

		const runid = await ctx.db.insert('runs', payload);
		const run = assertFound(await ctx.db.get(runid));

		await ctx.runMutation(internal.runs.runDocuments.persistRunDocument, {
			runId: run._id,
			documents: args.documents
		});

		await ctx.runMutation(internal.artifacts.index.createArtifact, {
			runId: run._id,
			artifactType: args.artifact.type,
			status: 'in_progress',
			versionData: { ...args.artifact.data }
		});

		return {
			id: run._id,
			title: run.title,
			status: run.status,
			phase: run.phase,
			loopCount: run.loopCount,
			agentConfig: run.agentConfig,
			nextMessageSequenceNumber: run.nextMessageSequenceNumber
		};
	}
});

export const getCreateRunAuthContext = internalQuery({
	args: {
		clerkId: v.string(),
		profileId: v.id('profiles')
	},
	handler: async (ctx, args) => {
		const user = assertFound(
			await ctx.db
				.query('users')
				.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', args.clerkId))
				.unique(),
			'User not found',
			true
		);

		const profile = assertFound(await ctx.db.get(args.profileId));

		return {
			user,
			profile
		};
	}
});

export const getRunAndUser = internalQuery({
	args: { clerkId: v.string(), runId: v.id('runs') },
	handler: async (ctx, args) => {
		const user = assertFound(
			await ctx.db
				.query('users')
				.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', args.clerkId))
				.unique(),
			'User not found',
			true
		);

		const run = assertFound(await ctx.db.get(args.runId));

		return {
			user,
			run
		};
	}
});

export const getArtifacts = internalQuery({
	args: { artifactVersionId: v.id('artifactVersions') },
	handler: async (ctx, args) => {
		const artifactVersion = assertFound(
			await ctx.db.get(args.artifactVersionId),
			'Artifact version not found'
		);
		return artifactVersion;
	}
});

export const getRunDocuments = internalQuery({
	args: { runId: v.id('runs') },
	handler: async (ctx, args) => {
		const runDocuments = assertFound(
			await ctx.db
				.query('runDocuments')
				.withIndex('by_run', (q) => q.eq('runId', args.runId))
				.collect(),
			'Run documents not found'
		);

		return runDocuments;
	}
});

export const getRunReviews = internalQuery({
	args: {
		runId: v.id('runs')
	},
	handler: async (ctx, args) => {
		return await ctx.db
			.query('reviews')
			.withIndex('by_run_created_at', (q) => q.eq('runId', args.runId))
			.collect();
	}
});
