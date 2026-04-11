import { v } from 'convex/values';
import { mutation } from '../_generated/server';
import { assertFound, forbiddenCheck, withAppErrors } from '../lib/errorMapper';
import { artifactVersionOrigin, artifactVersionStatus } from '../lib/schemaTypes';
import { ok } from '../lib/responseMapper';
import { api } from '../_generated/api';

export const createArtifactVersion = mutation({
	args: {
		artifactId: v.id('artifacts'),
		basedOnVersionId: v.optional(v.number()),
		origin: artifactVersionOrigin,
		status: artifactVersionStatus,
		previewText: v.string(),
		canonicalJson: v.optional(v.string()),
		markdown: v.optional(v.string()),
		plainText: v.optional(v.string()),
		contentHash: v.optional(v.string()),
		sourceLlmCallId: v.optional(v.id('llmCalls'))
	},
	handler: async (ctx, args) => {
		/**
		 * 1. verify identity (we get user)
		 * 2. Forbidden check (we get artifact and run)
		 * 3. Create artifact version
		 * 4. Update artifact with version (how do we know for final? maybe through the artifact version status)
		 * 5. Update run with artifact version
		 */
		return withAppErrors(async () => {
			// 1
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

			// 2
			const artifact = assertFound(await ctx.db.get(args.artifactId));
			const run = assertFound(await ctx.db.get(artifact.runId));
			forbiddenCheck(() => run.userId === user._id);

			// 3
			const payload = {
				...args,
				runId: run._id,
				artifactId: artifact._id,
				versionNumber: artifact.nextVersionNumber,
				createdAt: new Date().getTime()
			};
			const artifactVersion = await ctx.db.insert('artifactVersions', payload);

			// 4
			const isFinal = args.status === 'finalized';
			const propagateVersionUpdates = {
				artifactId: artifact._id,
				currentVersionId: artifactVersion,
				finalVersionId: isFinal ? artifactVersion : undefined,
				nextVersionNumber: artifact.nextVersionNumber + 1
			};
			await ctx.runMutation(api.artifacts.index.updateArtifact, { ...propagateVersionUpdates });

			// 5
			await ctx.runMutation(api.runs.index.updateRun, {
				runId: run._id,
				currentArtifactId: propagateVersionUpdates.artifactId,
				currentArtifactVersionId: propagateVersionUpdates.currentVersionId,
				finalArtifactVersionId: propagateVersionUpdates.finalVersionId
			});

			return ok(artifactVersion, { message: 'Artifact version created', statusCode: 201 });
		});
	}
});
