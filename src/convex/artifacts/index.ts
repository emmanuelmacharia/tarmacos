import { v } from 'convex/values';
import { internalMutation, mutation } from '../_generated/server';
import { assertFound, forbiddenCheck, withAppErrors } from '../lib/errorMapper';
import { artifactStatus, artifactType } from '../lib/schemaTypes';
import { ok } from '../lib/responseMapper';
import { api } from '../_generated/api';

export const createArtifact = internalMutation({
	args: {
		runId: v.id('runs'),
		artifactType: artifactType,
		status: artifactStatus,
		versionData: v.object({
			previewText: v.string(),
			canonicalJson: v.optional(v.string()),
			markdown: v.optional(v.string()),
			plainText: v.optional(v.string()),
			contentHash: v.optional(v.string()),
			sourceLlmCallId: v.optional(v.id('llmCalls'))
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
				artifactType: args.artifactType,
				status: args.status,
				createdAt: new Date().getTime(),
				updatedAt: new Date().getTime(),
				nextVersionNumber: 1
			};

			// create this row without a versionId first
			const artifactId = await ctx.db.insert('artifacts', payload);

			// create the version
			await ctx.runMutation(api.artifacts.versions.createArtifactVersion, {
				artifactId: artifactId,
				origin: 'imported_source' as const,
				status: 'draft' as const,
				...args.versionData
			});

			return ok(artifactId, { message: 'Artifact created successfully', statusCode: 201 });
		});
	}
});

export const updateArtifact = mutation({
	args: {
		artifactId: v.id('artifacts'),
		status: v.optional(artifactStatus),
		currentVersionId: v.optional(v.id('artifactVersions')),
		finalVersionId: v.optional(v.id('artifactVersions')),
		nextVersionNumber: v.optional(v.number())
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

			const artifact = assertFound(await ctx.db.get(args.artifactId));

			const run = assertFound(await ctx.db.get(artifact.runId));

			forbiddenCheck(() => run.userId === user._id);

			const payload = {
				updatedAt: new Date().getTime(),
				...Object.fromEntries(
					Object.entries({
						status: args.status,
						currentVersionId: args.currentVersionId,
						finalVersionId: args.finalVersionId,
						nextVersionNumber: args.nextVersionNumber
					}).filter(([, value]) => value !== undefined)
				)
			};

			console.log(payload);

			await ctx.db.patch(artifact._id, payload);

			const updatedArtifact = await ctx.db.get(artifact._id);

			return ok(updatedArtifact, { message: 'Artifact updated successfully', statusCode: 200 });
		});
	}
});
