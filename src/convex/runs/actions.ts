import { v } from 'convex/values';
import { internal } from '../_generated/api';
import { action } from '../_generated/server';
import { withAppErrors, assertFound, forbiddenCheck } from '../lib/errorMapper';
import {
	artifactVersionToPromptText,
	buildExtractedTextSnapshot,
	readRunDocumentExtractedText
} from '../lib/run/utils';
import {
	runStatus,
	runPhase,
	agentConfig,
	documentPurpose,
	artifactType,
	llmRequestKind
} from '../lib/schemaTypes';
import { ok } from '../lib/responseMapper';

export const createRun = action({
	args: {
		profileId: v.id('profiles'),
		title: v.string(),
		status: v.optional(runStatus),
		phase: v.optional(runPhase),
		parentRunId: v.optional(v.id('runs')),
		agentConfig: agentConfig,
		metadata: v.optional(v.any()),
		instructionSnapshot: v.optional(
			v.object({
				profile: v.optional(
					v.object({
						writer: v.optional(v.string()),
						reviewer: v.optional(v.string())
					})
				),
				job: v.optional(v.string())
			})
		),
		documents: v.array(
			v.object({
				documentId: v.id('documents'),
				purpose: documentPurpose,
				extractedText: v.optional(v.string())
			})
		),
		artifact: v.object({
			type: artifactType,
			data: v.object({
				previewText: v.string(),
				canonicalJson: v.optional(v.string()),
				markdown: v.optional(v.string()),
				plainText: v.string(),
				contentHash: v.optional(v.string())
			})
		})
	},
	handler: async (ctx, args): Promise<ReturnType<typeof ok>> => {
		return withAppErrors(async () => {
			const identity = assertFound(
				await ctx.auth.getUserIdentity(),
				'Please log in to continue',
				true
			);

			const clerkId = identity.subject;
			// get the user and profile

			const { user, profile } = await ctx.runQuery(
				internal.runs.internals.getCreateRunAuthContext,
				{
					clerkId,
					profileId: args.profileId
				}
			);

			forbiddenCheck(() => profile.userId === user._id);

			const documentsWithSnapshots = await Promise.all(
				args.documents.map(async (document) => {
					const snapshot =
						document.extractedText === undefined
							? undefined
							: await buildExtractedTextSnapshot(ctx, document.extractedText);

					return {
						documentId: document.documentId,
						purpose: document.purpose,
						extractedText: snapshot?.extractedText,
						extractedTextSource: snapshot?.extractedTextSource
					};
				})
			);
			const result = await ctx.runMutation(
				internal.runs.internals.createRunWithDocumentsAndArtifact,
				{
					userId: user._id,
					profileId: profile._id,
					title: args.title,
					parentRunId: args.parentRunId,
					metadata: args.metadata,
					agentConfig: args.agentConfig,
					instructionSnapshot: args.instructionSnapshot,
					documents: documentsWithSnapshots,
					artifact: args.artifact
				}
			);

			return ok(result, { message: 'Run created', status: 201 });
		});
	}
});

export const getReviewerPlanContext = action({
	args: {
		runId: v.id('runs'),
		artifactVersionId: v.id('artifactVersions')
	},
	handler: async (ctx, args): Promise<ReturnType<typeof ok>> => {
		return withAppErrors(async () => {
			const identity = assertFound(
				await ctx.auth.getUserIdentity(),
				'Please log in or sign up to continue',
				true
			);
			const clerkId = identity.subject;

			const { user, run } = await ctx.runQuery(internal.runs.internals.getRunAndUser, {
				clerkId,
				runId: args.runId
			});

			forbiddenCheck(() => run.userId === user._id);

			const artifactVersion = await ctx.runQuery(internal.runs.internals.getArtifacts, {
				artifactVersionId: args.artifactVersionId
			});

			forbiddenCheck(() => run._id === artifactVersion.runId);

			// extracted text may be an issue - we have an upper limit on size
			const runDocuments = await ctx.runQuery(internal.runs.internals.getRunDocuments, {
				runId: args.runId
			});

			const jobDescriptionSource = runDocuments.find((doc) => doc.purpose === 'job_description');
			const extractedJobDescription = jobDescriptionSource
				? await readRunDocumentExtractedText(ctx, jobDescriptionSource)
				: '';
			const baselineCvSource = runDocuments.find((doc) => doc.purpose === 'baseline_resume');
			const extractedBaselineResume = baselineCvSource
				? await readRunDocumentExtractedText(ctx, baselineCvSource)
				: '';
			const supportingDocsSource = runDocuments.filter(
				(doc) => doc.purpose === 'supporting_documents'
			);
			const supportingDocuments = await Promise.all(
				supportingDocsSource.map(async (doc) => ({
					extractedText: await readRunDocumentExtractedText(ctx, doc),
					purpose: doc.purpose
				}))
			);

			/**
			 * we only want to do one extraction;
			 * During upload or creating the run, we could either:
			 * 	1. extract the text from the documents, maintain them in runDocuments - I vote for this one; ==== DONE
			 *  2. Extract the text from here (within the run), and keep the snapshot in llmCallContent (not artifacts; artifacts are the logical results of what we are creating - eg a resume) === OOPTED AWAY FROM THIS
			 *
			 * We have an issue though: if the extracted text is too long, we will have to still retain it as a doc ==== DONE
			 * This is why we introduced the concept of the extractedTextSource in the runDocuments table. === DONE
			 *
			 * So when returning the reviewer or writer contexts, we need:
			 *
			 * 1. fetch the runDocument === DONE
			 * 2. get the extracted text from run documents if it does exist. === DONE
			 * 	2.1. if it doesn't exist, check for the run documents source ==== DONE
			 * 	2.2. Download that document from the file storage and return that extracted text. === DONE
			 * 3. We already have that mapping for the purpose, so use that. === DONE
			 *
			 *  */

			const result = {
				agent: run.agentConfig.reviewer,
				profileInstructions: run.instructionSnapshot?.profile?.reviewer,
				jobInstructions: run.instructionSnapshot?.job,
				loopNumber: run.agentConfig.maxIterations,
				baselineCv: extractedBaselineResume,
				jobDescription: extractedJobDescription,
				supportingDocuments: supportingDocuments,
				artifactVersionId: artifactVersion._id
			};
			return ok(result, { message: 'Initial review context retrieved', statusCode: 200 });
		});
	}
});

export const getReviewerReviewContext = action({
	args: {
		runId: v.id('runs'),
		artifactVersionId: v.id('artifactVersions')
	},
	handler: async (ctx, args): Promise<ReturnType<typeof ok>> => {
		return withAppErrors(async () => {
			const identity = assertFound(
				await ctx.auth.getUserIdentity(),
				'Please log in or sign up to continue',
				true
			);
			const clerkId = identity.subject;

			const { user, run } = await ctx.runQuery(internal.runs.internals.getRunAndUser, {
				clerkId,
				runId: args.runId
			});

			forbiddenCheck(() => run.userId === user._id);

			const artifactVersion = await ctx.runQuery(internal.runs.internals.getArtifacts, {
				artifactVersionId: args.artifactVersionId
			});

			forbiddenCheck(() => run._id === artifactVersion.runId);

			const runDocuments = await ctx.runQuery(internal.runs.internals.getRunDocuments, {
				runId: args.runId
			});

			const jobDescriptionSource = runDocuments.find((doc) => doc.purpose === 'job_description');
			const extractedJobDescription = jobDescriptionSource
				? await readRunDocumentExtractedText(ctx, jobDescriptionSource)
				: '';

			const baselineCvSource = runDocuments.find((doc) => doc.purpose === 'baseline_resume');
			const extractedBaselineResume = baselineCvSource
				? await readRunDocumentExtractedText(ctx, baselineCvSource)
				: '';

			const supportingDocsSource = runDocuments.filter(
				(doc) => doc.purpose === 'supporting_documents'
			);
			const supportingDocuments = await Promise.all(
				supportingDocsSource.map(async (doc) => ({
					extractedText: await readRunDocumentExtractedText(ctx, doc),
					purpose: doc.purpose
				}))
			);

			const reviews = await ctx.runQuery(internal.runs.internals.getRunReviews, {
				runId: args.runId
			});

			const latestAssessment = reviews
				.filter((review) => review.reviewKind === 'baseline_assessment')
				.at(-1);

			const currentDraftMarkdown = artifactVersionToPromptText(artifactVersion);

			const critiquePlan = latestAssessment ? JSON.parse(latestAssessment.content) : '';

			return ok(
				{
					agent: run.agentConfig.reviewer,
					jobDescription: extractedJobDescription,
					baselineCv: extractedBaselineResume,
					profileInstructions: run.instructionSnapshot?.profile?.reviewer,
					jobInstructions: run.instructionSnapshot?.job,
					critiquePlan,
					currentDraftMarkdown,
					currentIteration: run.loopCount,
					loopNumber: run.agentConfig.maxIterations,
					supportingDocuments
				},
				{ message: 'Review context found' }
			);
		});
	}
});

export const getWriterContext = action({
	args: {
		runId: v.id('runs'),
		basedOnVersionId: v.id('artifactVersions'),
		reviewId: v.optional(v.id('reviews')),
		requestKind: llmRequestKind,
		userMessageId: v.optional(v.id('messages'))
	},
	handler: async (ctx, args): Promise<ReturnType<typeof ok>> => {
		return withAppErrors(async () => {
			const identity = assertFound(
				await ctx.auth.getUserIdentity(),
				'Please log in or sign up to continue',
				true
			);
			const clerkId = identity.subject;

			const { user, run } = await ctx.runQuery(internal.runs.internals.getRunAndUser, {
				clerkId,
				runId: args.runId
			});

			forbiddenCheck(() => run.userId === user._id);

			const artifactVersion = await ctx.runQuery(internal.runs.internals.getArtifacts, {
				artifactVersionId: args.basedOnVersionId
			});

			forbiddenCheck(() => run._id === artifactVersion.runId);

			const runDocuments = await ctx.runQuery(internal.runs.internals.getRunDocuments, {
				runId: args.runId
			});

			const jobDescriptionSource = runDocuments.find((doc) => doc.purpose === 'job_description');
			const extractedJobDescription = jobDescriptionSource
				? await readRunDocumentExtractedText(ctx, jobDescriptionSource)
				: '';

			const baselineCvSource = runDocuments.find((doc) => doc.purpose === 'baseline_resume');
			const extractedBaselineResume = baselineCvSource
				? await readRunDocumentExtractedText(ctx, baselineCvSource)
				: '';

			const supportingDocsSource = runDocuments.filter(
				(doc) => doc.purpose === 'supporting_documents'
			);
			const supportingDocuments = await Promise.all(
				supportingDocsSource.map(async (doc) => ({
					extractedText: await readRunDocumentExtractedText(ctx, doc),
					purpose: doc.purpose
				}))
			);

			const reviews = await ctx.runQuery(internal.runs.internals.getRunReviews, {
				runId: args.runId
			});

			const baselineAssessment = reviews
				.filter((review) => review.reviewKind === 'baseline_assessment')
				.at(-1);

			const latestAssessment = reviews
				.filter((review) => review.reviewKind === 'draft_review')
				.at(-1);

			return ok(
				{
					runId: run._id,
					artifactVersionId: artifactVersion._id,
					artifactVersion: artifactVersion._id,
					agent: run.agentConfig.writer,
					writer: run.agentConfig.writer,
					loopCount: run.loopCount,
					baselineCv: extractedBaselineResume,
					jobDescription: extractedJobDescription,
					supportingDocuments,
					baselineAssessment: baselineAssessment?.content,
					profileInstructions: run.instructionSnapshot?.profile?.writer,
					jobInstructions: run.instructionSnapshot?.job,
					latestAssessment:
						latestAssessment?._id !== baselineAssessment?._id ? latestAssessment?.content : ''
				},
				{ message: 'Writer context found' }
			);
		});
	}
});
