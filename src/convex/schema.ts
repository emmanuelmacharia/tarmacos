import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import {
	userStatus,
	defaultResumeLength,
	seniorityLevel,
	documentFormat,
	documentType,
	runStatus,
	runPhase,
	agentConfig,
	documentPurpose,
	authorType,
	authorRole,
	messageType,
	messageVisibility,
	messageBodyFormat
} from './lib/schemaTypes';

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
		.index('by_storage_id', ['storageId']),

	runs: defineTable({
		userId: v.id('users'),
		profileId: v.id('profiles'),
		title: v.string(),
		status: runStatus,
		phase: runPhase,
		currentArtifactId: v.optional(v.string()), // update when we define the artifacts table
		currentArtifactVersionId: v.optional(v.string()), // update when we define the artifacts versions table
		finalArtifactVersionId: v.optional(v.string()),
		parentRunId: v.optional(v.id('runs')),
		nextMessageSequenceNumber: v.number(),
		loopCount: v.number(),
		agentConfig: agentConfig,
		metadata: v.optional(v.any()),
		error: v.optional(v.any()),
		createdAt: v.number(),
		updatedAt: v.number(),
		completedAt: v.optional(v.number())
	})
		.index('by_user', ['userId'])
		.index('by_profile_id', ['profileId'])
		.index('by_user_updated', ['userId', 'updatedAt'])
		.index('by_profile_updated', ['profileId', 'updatedAt'])
		.index('by_parent', ['parentRunId']),

	runDocuments: defineTable({
		runid: v.id('runs'),
		documentId: v.id('documents'),
		purpose: documentPurpose,
		extractedText: v.optional(v.string()),
		createdAt: v.number()
	})
		.index('by_run', ['runid'])
		.index('by_document_id', ['documentId'])
		.index('by_purpose', ['purpose']),

	messages: defineTable({
		runid: v.id('runs'),
		sequenceNumber: v.number(),
		authorType: authorType,
		authorRole: authorRole,
		meessageType: messageType,
		visibility: messageVisibility,
		bodyFormat: messageBodyFormat,
		body: v.string(),
		relatedArtifactVersionId: v.optional(v.string()), // fix when you get the artifact version table
		relatedReviewid: v.optional(v.string()), // fix when we get the review table
		createdAt: v.number()
	})
		.index('by_run_seq', ['runid', 'sequenceNumber'])
		.index('by_run_visibility_seq', ['runid', 'visibility', 'sequenceNumber'])
});
