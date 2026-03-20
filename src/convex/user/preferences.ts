import { v } from 'convex/values';
import { mutation } from '../_generated/server';
import { defaultResumeLength } from '../schema';
import { api } from '../_generated/api';

export const createPreferences = mutation({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();

		if (!identity) throw new Error('Not authorized');

		const clerkId = identity.subject;

		const user = await ctx.db
			.query('users')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkId))
			.unique();

		if (!user) {
			// no preference can be created without a user
			throw new Error('Not found');
		}

		try {
			const payload = {
				userId: user._id,
				updatedAt: new Date().getTime(),
				createdAt: new Date().getTime()
			};
			await ctx.db.insert('userPreferences', payload);
		} catch (error) {
			console.log(error);
		}
	}
});

export const patchProfile = mutation({
	args: {
		defaultProfileId: v.optional(v.id('profiles')),
		defaultWriterModel: v.optional(v.string()),
		defaultScorerModel: v.optional(v.string()),
		defaultTemplateId: v.optional(v.string()),
		defaultResumeLength: v.optional(defaultResumeLength),
		theme: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();

		if (!identity) throw new Error('Not authorized');

		const clerkId = identity.subject;

		const user = await ctx.db
			.query('users')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkId))
			.unique();

		if (!user) {
			// no profile can be created without a user
			return;
		}

		const preferences = await ctx.db
			.query('userPreferences')
			.withIndex('by_userId', (q) => q.eq('userId', user._id))
			.unique();

		if (!preferences) {
			try {
				// create the preference row if it doesn't exist
				await ctx.runMutation(api.user.userPreferences.createPreferences);
				return;
			} catch (error) {
				console.log(error);
				return
			}
		}

		try {
			const payload = {
				...args
			};
			await ctx.db.patch('userPreferences', preferences._id, payload);
		} catch (error) {
			console.log(error);
		}
	}
});
