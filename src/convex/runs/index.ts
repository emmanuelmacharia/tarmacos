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
				phase: 'baseline_review' as const,
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
		currentArtifactId: v.optional(v.string()), // update when we define the artifacts table
		currentArtifactVersionId: v.optional(v.string()), // update when we define the artifacts versions table
		finalArtifactVersionId: v.optional(v.string()),
		parentRunId: v.optional(v.id('runs')),
		nextMessageSequenceNumber: v.optional(v.number()),
		loopCount: v.optional(v.number()),
		agentConfig: v.optional(agentConfig),
		metadata: v.optional(v.any()),
		error: v.optional(v.any())
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
			await ctx.db.patch('runs', run._id, payload);

			const updatedRun = await ctx.db.get(run._id);

			return ok(updatedRun, { message: 'Run updated successfully', statusCode: 200 });
		});
	}
});
