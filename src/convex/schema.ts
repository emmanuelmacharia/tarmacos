import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

// enums
export const userStatus = v.union(v.literal('active'), v.literal('disabled'));
const defaultResumeLength = v.union(
	v.literal('one_page'),
	v.literal('two_page'),
	v.literal('auto')
);

// tables
export default defineSchema({
	// USERS
	users: defineTable({
		clerkUserId: v.string(),
		email: v.string(),
		fullName: v.optional(v.string()),
		imageUrl: v.optional(v.string()),
		status: v.optional(userStatus),
		lastSeenAt: v.optional(v.number()),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_clerkUserId', ['clerkUserId'])
		.index('by_email', ['email']),

	// USER PREFERENCE
	userPreferences: defineTable({
		userId: v.id('users'),
		// defaultProfileId: v.optional(v.id('profiles')),
		defaultWriterModel: v.optional(v.string()),
		defaultScorerModel: v.optional(v.string()),
		defaultTemplateId: v.optional(v.string()),
		defaultResumeLength: v.optional(defaultResumeLength),
		theme: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number()
	}).index('by_userId', ['userId'])
});
