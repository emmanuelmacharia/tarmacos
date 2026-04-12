import { v } from 'convex/values';
import { mutation } from '../_generated/server';
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
		relatedReviewid: v.optional(v.string()) // fix when we get the review table
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
				relatedReviewId: args.relatedReviewid,
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
