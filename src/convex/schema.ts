import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

// enums
const userStatus = v.union(v.literal('active'), v.literal('disabled'));
export const defaultResumeLength = v.union(
	v.literal('one_page'),
	v.literal('two_page'),
	v.literal('auto')
);

export const seniorityLevel = v.union(
	v.literal('intern'),
	v.literal('junior'),
	v.literal('mid'),
	v.literal('senior'),
	v.literal('staff'),
	v.literal('principal'),
	v.literal('lead'),
	v.literal('manager')
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
		defaultProfileId: v.optional(v.id('profiles')),
		defaultWriterModel: v.optional(v.string()),
		defaultScorerModel: v.optional(v.string()),
		defaultTemplateId: v.optional(v.string()),
		defaultResumeLength: v.optional(defaultResumeLength),
		theme: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number()
	}).index('by_userId', ['userId']),

	// Canonical profiles
	profiles: defineTable({
		userId: v.id('users'),
		name: v.string(),
		summary: v.optional(v.string()),
		primaryFocus: v.optional(v.string()),
		yearsOfExperience: v.optional(v.number()),
		seniorityLevel: v.optional(seniorityLevel),
		profileWriterPrompt: v.optional(v.string()),
		profileReaderPrompt: v.optional(v.string()),
		profileWriterVersion: v.optional(v.number()),
		profileReaderVersion: v.optional(v.number()),
		preferredTemplateId: v.optional(v.string()),
		isDefault: v.optional(v.boolean()),
		isArchived: v.optional(v.boolean()),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_userId', ['userId'])
		.index('by_userId_isDefault', ['userId', 'isDefault'])
		.index('by_userId_isArchived', ['userId', 'isArchived'])
});
