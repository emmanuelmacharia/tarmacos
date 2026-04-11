import { v } from 'convex/values';
import { mutation } from '../_generated/server';
import { assertFound, forbiddenCheck, withAppErrors } from '../lib/errorMapper';
import { exportFormat, exportStatus } from '../lib/schemaTypes';
import { ok } from '../lib/responseMapper';
import { api } from '../_generated/api';

export const createExport = mutation({
	args: {
		runId: v.id('runs'),
		artifactVersionId: v.id('artifactVersions'),
		format: exportFormat,
		exporterVersion: v.string(),
		renderOptionHash: v.string(),
		status: exportStatus,
		documentId: v.optional(v.id('documents')),
		contentHash: v.optional(v.string()),
		fileSizeBytes: v.number(),
		mimeType: v.string()
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

			const run = assertFound(await ctx.db.get(args.runId));

			forbiddenCheck(() => run.userId === user._id);

			const artifactVersion = assertFound(await ctx.db.get(args.artifactVersionId));

			const payload = {
				...args,
				createdAt: new Date().getTime()
			};

			const artifact = assertFound(await ctx.db.get(artifactVersion.artifactId));

			const exportId = await ctx.db.insert('exports', payload);

			const exportData = await ctx.db.get(exportId);

			// update artifact final id

			await ctx.runMutation(api.artifacts.index.updateArtifact, {
				artifactId: artifact._id,
				finalVersionId: artifactVersion._id
			});

			// update run version id final
			await ctx.runMutation(api.runs.index.updateRun, {
				runId: run._id,
				finalArtifactVersionId: artifactVersion._id
			});

			return ok(exportData, { message: 'Review created successfully', statusCode: 201 });
		});
	}
});
