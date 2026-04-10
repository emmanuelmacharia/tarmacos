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

export const documentType = v.union(
	v.literal('uploaded_resume'),
	v.literal('promoted_generated_resume'),
	v.literal('uploaded_coverletter'),
	v.literal('promoted_generated_coverletter')
);

export const documentFormat = v.union(
	v.literal('pdf'),
	v.literal('docx'),
	v.literal('markdown'),
	v.literal('txt'),
	v.literal('json')
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
		.index('by_userId_isArchived', ['userId', 'isArchived']),

	documents: defineTable({
		userId: v.id('users'),
		profileId: v.optional(v.id('profiles')),
		name: v.string(),
		fileSize: v.number(), // in MB
		version: v.number(),
		createdAt: v.number(),
		updatedAt: v.number(),
		publicURL: v.optional(v.string()),
		storageId: v.id('_storage'),
		documentFormat: documentFormat, // eg pdf, docx etc
		mimeType: v.optional(v.string()),
		documentType: documentType, // 'original_baseline', 'promoted_baseline'
		// we need to add a run id - we'll expire documents and clean them up if we dont have a run attached
		// runId: v.optional(v.id('runs'))  ----> NO, A document could conceivably be used for multiple runs, we need a join table to allow us to have M2M relationships between documents and runs
		expiresAt: v.number() // for abandoned uploads to be cleaned up
	})
		.index('by_userId', ['userId'])
		.index('by_profileId', ['profileId'])
		.index('by_storage_id', ['storageId'])
	// .index('by_runid', ['runId'])
});
