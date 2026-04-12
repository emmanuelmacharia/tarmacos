import { api } from '../_generated/api';
import { mutation } from '../_generated/server';

export const createUser = mutation({
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();

		if (!identity) {
			throw new Error('Not authorized');
		}
		const clerkId = identity.subject;

		const existing = await ctx.db
			.query('users')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkId))
			.unique();

		if (existing) {
			await ctx.db.patch(existing._id, {
				lastSeenAt: new Date().getTime(),
				email: identity.email!,
				fullName: identity.name!,
				imageUrl: identity.pictureUrl
			});
			return existing._id;
		}

		try {
			const payload = {
				clerkUserId: clerkId,
				email: identity.email!,
				fullName: identity.name!,
				imageUrl: identity.pictureUrl,
				status: 'active' as const,
				createdAt: new Date().getTime(),
				updatedAt: new Date().getTime()
			};
			const user = await ctx.db.insert('users', payload);
			await ctx.runMutation(api.user.preferences.createPreferences);
			return user;
		} catch (error) {
			// handle convex errors more gracefully
			console.log(error);
		}
	}
});
