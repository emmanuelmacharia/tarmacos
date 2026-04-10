import { v } from 'convex/values';
import { mutation } from '../_generated/server';
import { assertFound, forbiddenCheck, withAppErrors } from '../lib/errorMapper';
import { agentConfig, runPhase, runStatus } from '../lib/schemaTypes';
import { ok } from '../lib/responseMapper';

export const createRun = mutation({
	args: {
		profileId: v.id('profiles'),
		title: v.string(),
		status: v.optional(runStatus),
		phase: v.optional(runPhase),
		parentRunId: v.optional(v.id('runs')),
		agentConfig: agentConfig,
		metadata: v.optional(v.any())
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
				phase: 'initiating' as const,
				nextMessageSequenceNumber: 0,
				loopCount: 0,
				agentConfig: args.agentConfig,
				createdAt: new Date().getTime(),
				updatedAt: new Date().getTime()
			};

			const runid = await ctx.db.insert('runs', payload);
			const run = assertFound(await ctx.db.get(runid));
			return ok(
				{
					id: run._id,
					title: run.title,
					status: run.status,
					phase: run.phase,
					loopCount: run.loopCount,
					agentConfig: run.agentConfig
				},
				{}
			);
		});
	}
});
