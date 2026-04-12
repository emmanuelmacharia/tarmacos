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
	messageBodyFormat,
	artifactType,
	artifactStatus,
	artifactVersionOrigin,
	artifactVersionStatus,
	reviewType,
	reviewDecision,
	LlmCallStatus,
	normalizationStatus,
	operationKind,
	llmContentKind,
	llmContentFormat,
	exportFormat,
	exportStatus
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
		currentArtifactId: v.optional(v.id('artifacts')),
		currentArtifactVersionId: v.optional(v.id('artifactVersions')),
		finalArtifactVersionId: v.optional(v.id('artifactVersions')),
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
		runId: v.id('runs'),
		documentId: v.id('documents'),
		purpose: documentPurpose,
		extractedText: v.optional(v.string()),
		createdAt: v.number()
	})
		.index('by_run', ['runId'])
		.index('by_document_id', ['documentId'])
		.index('by_purpose', ['purpose']),

	messages: defineTable({
		runId: v.id('runs'),
		sequenceNumber: v.number(),
		authorType: authorType,
		authorRole: authorRole,
		messageType: messageType,
		visibility: messageVisibility,
		bodyFormat: messageBodyFormat,
		body: v.string(),
		relatedArtifactVersionId: v.optional(v.id('artifactVersions')), // fix when you get the artifact version table
		relatedReviewId: v.optional(v.id('reviews')),
		createdAt: v.number()
	})
		.index('by_run_seq', ['runId', 'sequenceNumber'])
		.index('by_run_visibility_seq', ['runId', 'visibility', 'sequenceNumber']),

	artifacts: defineTable({
		runId: v.id('runs'),
		artifactType: artifactType,
		status: artifactStatus,
		currentVersionId: v.optional(v.id('artifactVersions')),
		finalVersionId: v.optional(v.id('artifactVersions')),
		nextVersionNumber: v.number(),
		createdAt: v.number(),
		updatedAt: v.number()
	}).index('by_run', ['runId']),

	artifactVersions: defineTable({
		artifactId: v.id('artifacts'),
		runId: v.id('runs'),
		versionNumber: v.number(),
		basedOnVersionId: v.optional(v.id('artifactVersions')),
		origin: artifactVersionOrigin,
		status: artifactVersionStatus,
		previewText: v.string(),
		canonicalJson: v.optional(v.string()),
		markdown: v.optional(v.string()),
		plainText: v.optional(v.string()),
		contentHash: v.optional(v.string()),
		sourceLlmCallId: v.optional(v.id('llmCalls')),
		createdAt: v.number()
	})
		.index('by_artifact_version', ['artifactId', 'versionNumber'])
		.index('by_artifact_created_at', ['artifactId', 'createdAt'])
		.index('by_base_version', ['basedOnVersionId'])
		.index('by_run', ['runId']),

	reviews: defineTable({
		runId: v.id('runs'),
		artifactVersionId: v.id('artifactVersions'),
		reviewKind: reviewType,
		decision: reviewDecision,
		summary: v.string(),
		content: v.string(),
		schemaVersion: v.string(),
		sourceLlmCallId: v.optional(v.id('llmCalls')), // reviews can come from users
		createdAt: v.number()
	})
		.index('by_run_created_at', ['runId', 'createdAt'])
		.index('by_artifact_version', ['artifactVersionId', 'createdAt']),

	llmCalls: defineTable({
		runId: v.id('runs'),
		openRouterRequestid: v.string(),
		phase: runPhase,
		role: authorRole,
		attemptNumber: v.number(),
		retryOfCallId: v.optional(v.id('llmCalls')),
		gatewayProvider: v.string(), // not sure where to get this one
		modelSlug: v.string(),
		routedProvider: v.optional(v.string()), // this can be appended on the response from OpenRouter
		requestParams: v.any(), // we need to type the params we can set here
		requestedStrategy: v.string(),
		strategyUsed: v.optional(v.string()),
		status: LlmCallStatus,
		latencyMs: v.optional(v.number()),
		inputTokens: v.optional(v.number()),
		outputToken: v.optional(v.number()),
		reasoningToken: v.optional(v.number()),
		cachedTokens: v.optional(v.number()),
		costUsd: v.optional(v.number()),
		finishReason: v.optional(v.string()),
		normalizationStatus: normalizationStatus,
		normalizationError: v.string(),
		createdAt: v.number(),
		completedAt: v.number(),
		loopNumber: v.number(),
		operationKind: operationKind
	})
		.index('by_run_created_at', ['runId', 'createdAt'])
		.index('by_run_phase', ['runId', 'phase'])
		.index('by_open_router_requestid', ['openRouterRequestid'])
		.index('by_loop_and_operation', ['runId', 'loopNumber', 'operationKind']),

	llmCallContents: defineTable({
		llmCallId: v.id('llmCalls'),
		kind: llmContentKind,
		format: llmContentFormat,
		text: v.optional(v.string()),
		json: v.optional(v.string()),
		storageKey: v.optional(v.string()),
		contentBytes: v.optional(v.number()),
		createdAt: v.number()
	}).index('by_call_kind', ['llmCallId', 'kind']),

	exports: defineTable({
		runId: v.id('runs'),
		artifactVersionId: v.id('artifactVersions'),
		format: exportFormat,
		exporterVersion: v.string(),
		renderOptionHash: v.string(),
		status: exportStatus,
		documentId: v.optional(v.id('documents')),
		contentHash: v.optional(v.string()),
		fileSizeBytes: v.number(),
		mimeType: v.string(),
		createdAt: v.number(),
		completedAt: v.optional(v.number())
	})
		.index('by_run_createdat', ['runId', 'createdAt'])
		.index('by_render_key', ['artifactVersionId', 'format', 'renderOptionHash'])
});
