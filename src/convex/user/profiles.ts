import { v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { seniorityLevel } from '../schema';
import { assertFound, forbidden, unauthorized, withAppErrors } from '../lib/errorMapper';
import { ok } from '../lib/responseMapper';

export const createProfile = mutation({
	args: {
		name: v.string(),
		summary: v.optional(v.string()),
		primaryFocus: v.optional(v.string()),
		yearsOfExperience: v.optional(v.number()),
		seniorityLevel: v.optional(seniorityLevel),
		profileWriterPrompt: v.optional(v.string()),
		profileReaderPrompt: v.optional(v.string()),
		preferredTemplateId: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		return withAppErrors(async () => {
			const identity = await ctx.auth.getUserIdentity();
			if (!identity) {
				unauthorized('Please log in to continue');
			}
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
				summary: args.summary,
				primaryFocus: args.primaryFocus,
				yearsOfExperience: args.yearsOfExperience,
				seniorityLevel: args.seniorityLevel,
				profileWriterPrompt: args.profileWriterPrompt,
				profileReaderPrompt: args.profileReaderPrompt,
				preferredTemplateId: args.preferredTemplateId,
				createdAt: new Date().getTime(),
				updatedAt: new Date().getTime(),
				isDefault: false,
				isArchived: false,
				profileReaderVersion: 1,
				profileWriterVersion: 1
			};
			await ctx.db.insert('profiles', payload);
			const profiles = await ctx.db
				.query('profiles')
				.withIndex('by_userId', (q) => q.eq('userId', existing._id))
				.collect();
			return ok(profiles, { message: 'Profile created successfully' });
		});
	}
});

export const fetchProfile = query({
	args: { profileId: v.id('profiles') },
	handler: async (ctx, args) => {
		return withAppErrors(async () => {
			const identity = assertFound(await ctx.auth.getUserIdentity(), 'Not authorized');
			const clerkId = identity.subject;
			const user = assertFound(
				await ctx.db
					.query('users')
					.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkId))
					.unique(),
				'User not found'
			);
			const profile = assertFound(
				await ctx.db
					.query('profiles')
					.withIndex('by_id', (q) => q.eq('_id', args.profileId))
					.unique(),
				'Profile not found'
			);
			if (profile.userId !== user._id) {
				forbidden('Not authorized to access this profile');
			}
			return ok(profile, { message: 'Profile fetched successfully' });
		});
	}
});

export const fetchUserProfiles = query({
	handler: async (ctx) => {
		return withAppErrors(async () => {
			const identity = await ctx.auth.getUserIdentity();
			if (!identity) {
				unauthorized('Please log in to continue');
			}
			const clerkId = identity.subject;
			const user = await ctx.db
				.query('users')
				.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkId))
				.unique();
			if (!user) {
				unauthorized('Please sign up to continue');
			}
			const profiles = await ctx.db
				.query('profiles')
				.withIndex('by_userId', (q) => q.eq('userId', user._id))
				.collect();
			//return ok(profiles, { message: 'User profiles fetched successfully' });
			return profiles;
		});
	}
});

export const deleteProfile = mutation({
	args: { profileId: v.id('profiles') },
	handler: async (ctx, args) => {
		withAppErrors(async () => {
			const identity = assertFound(await ctx.auth.getUserIdentity(), 'Not authorized');
			const clerkId = identity.subject;

			const user = assertFound(
				await ctx.db
					.query('users')
					.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkId))
					.unique(),
				'User not found'
			);
			const profile = assertFound(
				await ctx.db
					.query('profiles')
					.withIndex('by_id', (q) => q.eq('_id', args.profileId))
					.unique(),
				'Profile not found'
			);
			if (profile.userId !== user._id) {
				forbidden('Not authorized to delete this profile');
			}

			await ctx.db.delete('profiles', args.profileId);
			return ok(null, { message: 'Profile deleted successfully' });
		});
	}
});

export const updateProfile = mutation({
	args: {
		profileId: v.id('profiles'),
		name: v.string(),
		summary: v.optional(v.string()),
		primaryFocus: v.optional(v.string()),
		yearsOfExperience: v.optional(v.number()),
		seniorityLevel: v.optional(seniorityLevel),
		profileWriterPrompt: v.optional(v.string()),
		profileReaderPrompt: v.optional(v.string()),
		preferredTemplateId: v.optional(v.string()),
		isDefault: v.optional(v.boolean()),
		isArchived: v.optional(v.boolean())
	},
	handler: async (ctx, args) => {
		return withAppErrors(async () => {
			const identity = assertFound(await ctx.auth.getUserIdentity(), 'Not authorized');
			const clerkId = identity.subject;
			const user = assertFound(
				await ctx.db
					.query('users')
					.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkId))
					.unique(),
				'User not found'
			);
			const profile = assertFound(
				await ctx.db
					.query('profiles')
					.withIndex('by_id', (q) => q.eq('_id', args.profileId))
					.unique(),
				'Profile not found'
			);
			if (profile.userId !== user._id) {
				forbidden('Not authorized to update this profile');
			}

			const payload = {
				name: args.name,
				updatedAt: Date.now(),
				...(args.summary !== undefined ? { summary: args.summary } : {}),
				...(args.primaryFocus !== undefined ? { primaryFocus: args.primaryFocus } : {}),
				...(args.yearsOfExperience !== undefined
					? { yearsOfExperience: args.yearsOfExperience }
					: {}),
				...(args.seniorityLevel !== undefined ? { seniorityLevel: args.seniorityLevel } : {}),
				...(args.preferredTemplateId !== undefined
					? { preferredTemplateId: args.preferredTemplateId }
					: {}),
				...(args.isDefault !== undefined ? { isDefault: args.isDefault } : {}),
				...(args.isArchived !== undefined ? { isArchived: args.isArchived } : {}),
				...(args.profileReaderPrompt !== undefined
					? {
							profileReaderPrompt: args.profileReaderPrompt,
							profileReaderVersion: (profile.profileReaderVersion ?? 0) + 1
						}
					: {}),
				...(args.profileWriterPrompt !== undefined
					? {
							profileWriterPrompt: args.profileWriterPrompt,
							profileWriterVersion: (profile.profileWriterVersion ?? 0) + 1
						}
					: {})
			};

			const updatedProfile = await ctx.db.patch('profiles', args.profileId, payload);
			return ok(updatedProfile, { message: 'Profile updated successfully' });
		});
	}
});
