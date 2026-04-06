import { v } from 'convex/values';
import { mutation } from '../_generated/server';
import { seniorityLevel } from '../schema';
import { assertFound, withAppErrors } from '../lib/errorMapper';
import { ok } from '../lib/responseMapper';
export const createProfile = mutation({
	args: {
		name: v.string(),
		slug: v.optional(v.string()),
		headline: v.optional(v.string()),
		summary: v.optional(v.string()),
		primaryFocus: v.optional(v.string()),
		yearsOfExperience: v.optional(v.number()),
		seniorityLevel: v.optional(seniorityLevel),
		coreSkills: v.optional(v.array(v.string())),
		industries: v.optional(v.array(v.string())),
		profileWriterPrompt: v.optional(v.string()),
		profileReaderPrompt: v.optional(v.string()),
		profileWriterVersion: v.optional(v.number()),
		profileReaderVersion: v.optional(v.number()),
		preferredTemplateId: v.optional(v.string()),
		isDefault: v.optional(v.boolean()),
		isArchived: v.optional(v.boolean())
	},
	handler: async (ctx, args) => {
		withAppErrors(async () => {
			const identity = assertFound(await ctx.auth.getUserIdentity(), 'Not authorized');
			const clerkId = identity.subject;
			const existing = assertFound(
				await ctx.db
					.query('users')
					.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkId))
					.unique(),
				'User not found'
			);
			const payload = {
				userId: existing._id,
				name: args.name,
				slug: args.slug,
				headline: args.headline,
				summary: args.summary,
				primaryFocus: args.primaryFocus,
				yearsOfExperience: args.yearsOfExperience,
				seniorityLevel: args.seniorityLevel,
				coreSkills: args.coreSkills,
				industries: args.industries,
				profileWriterPrompt: args.profileWriterPrompt,
				profileReaderPrompt: args.profileReaderPrompt,
				profileWriterVersion: args.profileWriterVersion,
				profileReaderVersion: args.profileReaderVersion,
				preferredTemplateId: args.preferredTemplateId,
				isDefault: args.isDefault,
				isArchived: args.isArchived,
				createdAt: new Date().getTime(),
				updatedAt: new Date().getTime()
			};
			const profile = await ctx.db.insert('profiles', payload);
			return ok(profile, { message: 'Profile created successfully' });
		});
	}
});
