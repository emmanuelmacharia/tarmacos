import type { Doc, Id } from '../../_generated/dataModel';
import type { QueryCtx, MutationCtx, ActionCtx } from '../../_generated/server';
import { assertFound, mapConvexError } from '../errorMapper';
import type { NextInstruction } from '../schemaTypes';

type Ctx = QueryCtx | MutationCtx;

const MAX_INLINE_EXTRACTED_TEXT_BY_BYTES = 180_000;

export async function buildExtractedTextSnapshot(
	ctx: ActionCtx,
	extractedText: string
): Promise<{
	extractedText?: string;
	extractedTextSource?: {
		kind: 'storage';
		storageId: Id<'_storage'>;
		mimeType: 'text/plain';
		byteLength: number;
	};
}> {
	const byteLength = new TextEncoder().encode(extractedText).length;
	if (byteLength <= MAX_INLINE_EXTRACTED_TEXT_BY_BYTES) return { extractedText };
	const storageId = await ctx.storage.store(new Blob([extractedText], { type: 'text/plain' }));
	return {
		extractedTextSource: {
			kind: 'storage',
			storageId,
			mimeType: 'text/plain',
			byteLength
		}
	};
}

export function artifactVersionToPromptText(artifactVersionData: Doc<'artifactVersions'>): string {
	if (artifactVersionData.markdown && artifactVersionData.markdown.trim().length > 0) {
		return artifactVersionData.markdown;
	}

	if (artifactVersionData.canonicalJson) {
		return JSON.stringify(artifactVersionData.canonicalJson, null, 2);
	}

	if (artifactVersionData.plainText && artifactVersionData.plainText?.trim().length > 0) {
		return artifactVersionData.plainText;
	}
	mapConvexError({
		status: 400,
		message: 'Artifact has no useable content',
		code: 'BAD_REQUEST',
		details: ''
	});
}

export async function deriveNextInstructionForRun(
	ctx: Ctx,
	run: Doc<'runs'>
): Promise<NextInstruction> {
	if (run.status === 'completed') {
		return { action: 'done' };
	}

	if (run.status === 'cancelled' || run.status === 'failed') {
		mapConvexError({
			message: `Run ${run._id} is ${run.status} and cannot be resumed directly`,
			status: 400,
			details: run.status,
			code: 'BAD_REQUEST'
		});
	}

	if (run.status === 'awaiting_user' || run.phase === 'user_review') {
		return { action: 'await_user' };
	}

	switch (run.phase) {
		case 'baseline_review': {
			if (!run.currentArtifactVersionId) {
				mapConvexError({
					message: `Run ${run._id} is missing currentArtifactVersionId`,
					status: 400,
					details: '',
					code: 'BAD_REQUEST'
				});
			}

			return {
				action: 'call_reviewer',
				artifactVersionId: run.currentArtifactVersionId,
				reviewKind: 'baseline_assessment'
			};
		}

		case 'drafting': {
			if (!run.currentArtifactVersionId) {
				mapConvexError({
					message: `Run ${run._id} is missing currentArtifactVersionId`,
					status: 400,
					details: '',
					code: 'BAD_REQUEST'
				});
			}

			const basedOnVersion = assertFound(await ctx.db.get(run.currentArtifactVersionId));

			const isInitialDraft =
				basedOnVersion.versionNumber === 1 && basedOnVersion.origin === 'imported_source';

			if (isInitialDraft) {
				return {
					action: 'call_writer',
					requestKind: 'initial_draft',
					reviewId: null,
					basedOnVersionId: basedOnVersion._id
				};
			}

			const messages = await ctx.db
				.query('messages')
				.withIndex('by_run', (q) => q.eq('runId', run._id))
				.collect();

			const userMessages = messages.filter((message) => message.authorType === 'user');

			const latestUserMessage = userMessages.reverse()[0];

			return {
				action: 'call_writer',
				requestKind: 'user_feedback_revision',
				reviewId: null,
				basedOnVersionId: basedOnVersion._id,
				...(latestUserMessage ? { userMessageId: latestUserMessage._id } : {})
			};
		}

		case 'revision': {
			if (!run.currentArtifactVersionId) {
				mapConvexError({
					message: `Run ${run._id} is missing currentArtifactVersionId`,
					status: 400,
					details: '',
					code: 'BAD_REQUEST'
				});
			}

			const reviews = await ctx.db
				.query('reviews')
				.withIndex('by_run_created_at', (q) => q.eq('runId', run._id))
				.collect();

			const latestReview = reviews.reverse()[0];

			return {
				action: 'call_writer',
				requestKind: 'review_revision',
				reviewId: latestReview._id,
				basedOnVersionId: run.currentArtifactVersionId
			};
		}

		case 'reviewing': {
			if (!run.currentArtifactVersionId) {
				mapConvexError({
					message: `Run ${run._id} is missing currentArtifactVersionId`,
					status: 400,
					details: '',
					code: 'BAD_REQUEST'
				});
			}

			return {
				action: 'call_reviewer',
				artifactVersionId: run.currentArtifactVersionId,
				reviewKind: 'draft_review'
			};
		}

		case 'finalizing': {
			if (!run.currentArtifactVersionId) {
				mapConvexError({
					message: `Run ${run._id} is missing currentArtifactVersionId`,
					status: 400,
					details: '',
					code: 'BAD_REQUEST'
				});
			}

			return {
				action: 'generate_export',
				artifactVersionId: run.currentArtifactVersionId
			};
		}

		default: {
			const exhaustive: never = run.phase;

			mapConvexError({
				message: `Unsupported run phase: ${exhaustive}`,
				status: 400,
				details: '',
				code: 'BAD_REQUEST'
			});
		}
	}
}

export function sameInstruction(a: NextInstruction, b: NextInstruction): boolean {
	if (a.action !== b.action) return false;

	switch (a.action) {
		case 'call_reviewer':
			return (
				b.action === 'call_reviewer' &&
				a.artifactVersionId === b.artifactVersionId &&
				a.reviewKind === b.reviewKind
			);

		case 'call_writer':
			return (
				b.action === 'call_writer' &&
				a.requestKind === b.requestKind &&
				a.reviewId === b.reviewId &&
				a.basedOnVersionId === b.basedOnVersionId &&
				a.userMessageId === b.userMessageId
			);

		case 'generate_export':
			return b.action === 'generate_export' && a.artifactVersionId === b.artifactVersionId;

		case 'await_user':
		case 'done':
			return true;
	}
}

export function getExecutionClaim(run: Doc<'runs'>):
	| {
			executionId: string;
			claimedAt: number;
			action?: string;
	  }
	| undefined {
	const metadata = getSafeMetadataObject(run.metadata);
	const claim = metadata.execution;

	if (!claim || typeof claim !== 'object') {
		return undefined;
	}

	const executionId =
		'executionId' in claim && typeof claim.executionId === 'string' ? claim.executionId : undefined;

	const claimedAt =
		'claimedAt' in claim && typeof claim.claimedAt === 'number' ? claim.claimedAt : undefined;

	if (!executionId || claimedAt === undefined) {
		return undefined;
	}

	const action = 'action' in claim && typeof claim.action === 'string' ? claim.action : undefined;

	return {
		executionId,
		claimedAt,
		action
	};
}

export function getSafeMetadataObject(metadata: unknown): Record<string, unknown> {
	if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
		return {};
	}
	return metadata as Record<string, unknown>;
}

export async function readRunDocumentExtractedText(
	ctx: ActionCtx,
	runDocument: Doc<'runDocuments'>
): Promise<string> {
	if (typeof runDocument.extractedText === 'string') {
		return runDocument.extractedText;
	}

	if (runDocument.extractedTextSource?.kind === 'storage') {
		const blob = await ctx.storage.get(runDocument.extractedTextSource.storageId);

		if (!blob) {
			throw new Error(`Missing extracted text blob for runDocument ${runDocument._id}`);
		}

		return await blob.text();
	}

	throw new Error(`Run document ${runDocument._id} has no extracted text snapshot`);
}
