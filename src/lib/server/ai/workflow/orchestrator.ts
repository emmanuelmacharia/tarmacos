import { randomUUID } from 'node:crypto';
import { error as throwError } from '@sveltejs/kit';
import { api } from '../../../../convex/_generated/api';
import type { Id, Doc } from '../../../../convex/_generated/dataModel';
import { OPERATION_KIND, SCHEMA_VERSIONS } from './constants';
import {
	claimInstructionExecution,
	getNextInstructionForRun,
	getReviewerPlanContext,
	getReviewerReviewContext,
	getWriterContext,
	releaseInstructionExecution
} from './context';
import { callFreeform, callStructuredOutput } from './llm';
import {
	buildBaselineAssessmentMessage,
	buildDraftAnnouncementMessage,
	buildMaxIterationsMessage,
	buildReviewMessage
} from './messages';
import {
	normalizeCritiquePlan,
	normalizeDraft,
	normalizeReviewResult,
	type NormalizationResult,
	type NormalizedDraft
} from './normalization';
import { assertModelAllowedForRole } from '../models';
import { resolveCustomProfileInstructions } from '../profile-customization';
import {
	buildReviewerPlanTaskMessage,
	buildReviewerReviewTaskMessage,
	buildSystemPrompt,
	buildWriterTaskMessage,
	sanitizeUserText
} from '../prompt-builder';
import { CritiqueAndPlanSchema, ReviewSchema, type WorkflowRequest } from '../schemas';
import type {
	CanonicalBaselineReview,
	CanonicalDraft,
	CanonicalReview,
	operationKind
} from './types';
import { parseConvexMessage } from '$lib/utils/errorHandler';
import type { ConvexHttpClient } from 'convex/browser';
import type { NextInstruction } from '../../../../convex/lib/schemaTypes';

export interface StartWorkflowResult {
	runId: Id<'runs'>;
	terminalAction: 'done' | 'await_user';
}

async function persistRun(
	input: WorkflowRequest,
	convex: ConvexHttpClient
): Promise<Doc<'runs'> | null> {
	const [writerProfileInstructions, reviewerProfileInstructions] = await Promise.all([
		resolveCustomProfileInstructions(convex, {
			role: 'writer',
			profileId: input.profileId as Id<'profiles'>
		}),
		resolveCustomProfileInstructions(convex, {
			role: 'reviewer',
			profileId: input.profileId as Id<'profiles'>
		})
	]);

	// we need to think about this - jobDescription.extractedText

	const jobDescription = sanitizeUserText(input.jobDescription.extractedText, 40_000);
	const baselineCv = sanitizeUserText(input.baselineCv.extractedText, 40_000);
	const userInstructions = sanitizeUserText(input.jobInstructions ?? '', 5_000);

	const instructionSnapshot = {
		profile: {
			writer: writerProfileInstructions,
			reviewer: reviewerProfileInstructions
		},
		job: userInstructions
	};

	const payload = {
		profileId: input.profileId as Id<'profiles'>,
		title: '',
		instructionSnapshot,
		documents: [
			{
				extractedText: jobDescription,
				documentId: input.jobDescription.id as Id<'documents'>,
				purpose: input.jobDescription.purpose
			},
			{
				extractedText: baselineCv,
				documentId: input.baselineCv.id as Id<'documents'>,
				purpose: input.baselineCv.purpose
			}
		],
		agentConfig: {
			maxIterations: input.maxIterations,
			maxRetriesPerCall: 2,
			maxNormalizationRepairs: 2,
			writer: {
				modelSlug: input.writer.modelId,
				promptVersions: {
					system: 'system-v1',
					drafting: 'writer-draft-v1',
					revision: 'writer-revise-v1',
					rolePromptVersion: 'writer-role-v1'
				},
				defaultRequestParams: {
					temperature: 0,
					topP: 0.4,
					maxOutputTokens: 8000,
					responseFormat: 'text' as const
				}
			},
			reviewer: {
				modelSlug: input.reviewer.modelId,
				promptVersions: {
					system: 'system-v1',
					planning: 'reviewer-plan-v1',
					review: 'reviewer-review-v1',
					rolePromptVersion: 'reviewer-role-v1'
				},
				defaultRequestParams: {
					temperature: 0,
					topP: 0.4,
					maxOutputTokens: 8000,
					responseFormat: 'json' as const
				}
			}
		},
		artifact: {
			type: 'resume' as const,
			data: {
				previewText: '',
				plainText: `
						Job Description: \n
						${jobDescription},
						\n
						Resume: \n
						${baselineCv}
						UserInstructions: \n
						${userInstructions}
					`
			}
		}
	};

	try {
		const run = await convex.action(api.runs.actions.createRun, payload);
		return run.data as Doc<'runs'>;
	} catch (error) {
		if (error instanceof Error) {
			const errorobj = parseConvexMessage(error.message);
			if (errorobj?.code === 'UNAUTHORIZED') {
				throwError(401, errorobj.message);
			}
			if (errorobj?.code === 'FORBIDDEN') {
				throwError(403, errorobj.message);
			}
			throwError(400, errorobj?.message);
		}
		console.error(error);
		throwError(500, { message: 'Something went wrong' });
	}
}

export async function startWorkflow(
	convex: ConvexHttpClient,
	input: WorkflowRequest
): Promise<StartWorkflowResult | undefined> {
	assertModelAllowedForRole(input.writer.modelId, 'writer');
	assertModelAllowedForRole(input.reviewer.modelId, 'reviewer', {
		requiredStructuredOutput: true
	});

	const run: Doc<'runs'> | null = await persistRun(input, convex);

	if (run) {
		const next = await getNextInstructionForRun(convex, run._id);
		const { _id: runId } = run;

		const terminalAction = await executeLoop(convex, runId, next, input.signal);

		return {
			runId,
			terminalAction
		};
	}
	return;
}

export async function resumeWorkflow(
	convex: ConvexHttpClient,
	args: {
		runId: Id<'runs'>;
		instruction: NextInstruction;
		signal?: AbortSignal;
	}
): Promise<{ terminalAction: 'done' | 'await_user' }> {
	const terminalAction = await executeLoop(convex, args.runId, args.instruction, args.signal);

	return { terminalAction };
}

async function executeLoop(
	convex: ConvexHttpClient,
	runId: Id<'runs'>,
	initialInstruction: NextInstruction,
	signal?: AbortSignal
): Promise<'done' | 'await_user'> {
	let instruction = initialInstruction;

	while (instruction.action !== 'done' && instruction.action !== 'await_user') {
		const executionId = randomUUID();

		try {
			await claimInstructionExecution(convex, {
				runId,
				executionId,
				instruction
			});

			switch (instruction.action) {
				case 'call_reviewer':
					instruction = await handleReviewerInstruction(convex, runId, instruction, signal);
					break;

				case 'call_writer':
					instruction = await handleWriterInstruction(convex, runId, instruction, signal);
					break;

				case 'generate_export':
					instruction = await handleExportInstruction(convex, runId, instruction);
					break;

				default: {
					const exhaustive: never = instruction;
					throw new Error(`Unhandled instruction: ${JSON.stringify(exhaustive)}`);
				}
			}

			await releaseInstructionExecution(convex, {
				runId,
				executionId,
				outcome: 'completed'
			});
		} catch (error) {
			const resolved = toError(error);

			await releaseInstructionExecution(convex, {
				runId,
				executionId,
				outcome: isAbortError(error) || signal?.aborted ? 'cancelled' : 'failed'
			});

			if (isAbortError(error) || signal?.aborted) {
				await convex.mutation(api.runs.index.cancelRun, {
					runId,
					reason: resolved.message
				});
				throw resolved;
			}

			await convex.mutation(api.runs.index.failRun, {
				runId,
				error: resolved
			});

			throw resolved;
		}
	}

	return instruction.action;
}

async function handleReviewerInstruction(
	convex: ConvexHttpClient,
	runId: Id<'runs'>,
	instruction: Extract<NextInstruction, { action: 'call_reviewer' }>,
	signal?: AbortSignal
): Promise<NextInstruction> {
	if (instruction.reviewKind === 'baseline_assessment') {
		return handleBaselineAssessment(convex, runId, instruction, signal);
	}

	return handleDraftReview(convex, runId, instruction, signal);
}

async function handleBaselineAssessment(
	convex: ConvexHttpClient,
	runId: Id<'runs'>,
	instruction: Extract<NextInstruction, { action: 'call_reviewer' }>,
	signal?: AbortSignal
): Promise<NextInstruction> {
	const context = await getReviewerPlanContext(convex, runId, instruction.artifactVersionId);

	const system = buildSystemPrompt({
		role: 'reviewer',
		workflow: 'reviewerPlan'
	});

	const basePrompt = buildReviewerPlanTaskMessage({
		jobDescription: context.jobDescription,
		baselineCv: context.baselineCv,
		profileInstructions: context.profileInstructions,
		jobInstructions: context.jobInstructions
	});

	const normalized = await generateStructuredWithRepair({
		convex,
		runId,
		phase: 'baseline_review',
		role: 'reviewer',
		modelSlug: context.agent.modelSlug,
		gatewayProvider: context.agent.gatewayProvider,
		requestParams: context.agent.defaultRequestParameters,
		system,
		basePrompt,
		schema: CritiqueAndPlanSchema,
		loopNumber: context.loopNumber,
		operationKind: OPERATION_KIND.baselineReview,
		maxRetriesPerCall: context.agent.defaultRequestParameters.responseFormat === 'json' ? 1 : 3,
		maxNormalizationRepairs: 1,
		signal,
		normalize: normalizeCritiquePlan,
		repairPromptSuffix: (errorMessage) =>
			[
				'Your previous response could not be accepted.',
				`Problem: ${errorMessage}`,
				'Return corrected output that fully satisfies the required schema.',
				'Do not omit writerStrategy items.'
			].join('\n')
	});

	const canonical: CanonicalBaselineReview = {
		summary: normalized.data.candidateFitSummary,
		content: normalized.data,
		schemaVersion: SCHEMA_VERSIONS.critiquePlan
	};

	const messageSummary = buildBaselineAssessmentMessage(normalized.data);

	const { next } = await convex.mutation(api.runs.completeBaselineReview, {
		runId,
		llmCallId: normalized.llmCallId,
		canonical,
		messageSummary
	});

	return next;
}

async function handleDraftReview(
	convex: ConvexHttpClient,
	runId: Id<'runs'>,
	instruction: Extract<NextInstruction, { action: 'call_reviewer' }>,
	signal?: AbortSignal
): Promise<NextInstruction> {
	const context = await getReviewerReviewContext(convex, runId, instruction.artifactVersionId);

	const system = buildSystemPrompt({
		role: 'reviewer',
		workflow: 'reviewerReview'
	});

	const basePrompt = buildReviewerReviewTaskMessage({
		jobDescription: context.jobDescription,
		baselineCv: context.baselineCv,
		profileInstructions: context.profileInstructions,
		jobInstructions: context.jobInstructions,
		critiquePlan: context.critiquePlan,
		currentDraft: context.currentDraftMarkdown
	});

	const normalized = await generateStructuredWithRepair({
		convex,
		runId,
		phase: 'reviewing',
		role: 'reviewer',
		modelSlug: context.agent.modelSlug,
		gatewayProvider: context.agent.gatewayProvider,
		requestParams: context.agent.defaultRequestParameters,
		system,
		basePrompt,
		schema: ReviewSchema,
		loopNumber: context.loopNumber,
		operationKind:
			context.loopNumber === 1 ? OPERATION_KIND.draftReview : OPERATION_KIND.revisionReview,
		maxRetriesPerCall: 3,
		maxNormalizationRepairs: 1,
		signal,
		normalize: normalizeReviewResult,
		repairPromptSuffix: (errorMessage) =>
			[
				'Your previous review could not be accepted.',
				`Problem: ${errorMessage}`,
				'If verdict is "revise", you MUST provide at least one blocking issue',
				'and at least one handoff instruction.',
				'If high-severity problems exist, do not approve the draft.'
			].join('\n')
	});

	const canonical: CanonicalReview = {
		decision: normalized.data.verdict === 'approved' ? 'approve' : 'revise',
		summary: normalized.data.summary,
		content: normalized.data,
		schemaVersion: SCHEMA_VERSIONS.reviewResult
	};

	const messageSummary = buildReviewMessage(normalized.data, context.currentIteration);

	const maxIterationsMessage =
		normalized.data.verdict === 'revise'
			? buildMaxIterationsMessage(context.currentIteration)
			: undefined;

	const { next } = await convex.mutation(api.runs.completeReview, {
		runId,
		llmCallId: normalized.llmCallId,
		canonical,
		messageSummary,
		maxIterationsMessage
	});

	return next;
}

async function handleWriterInstruction(
	convex: ConvexHttpClient,
	runId: Id<'runs'>,
	instruction: Extract<NextInstruction, { action: 'call_writer' }>,
	signal?: AbortSignal
): Promise<NextInstruction> {
	const context = await getWriterContext(convex, {
		runId,
		basedOnVersionId: instruction.basedOnVersionId,
		reviewId: instruction.reviewId ?? undefined,
		requestKind: instruction.requestKind,
		userMessageId: instruction.userMessageId
	});

	const workflow = context.requestKind === 'initial_draft' ? 'writerDraft' : 'writerRevise';

	const system = buildSystemPrompt({
		role: 'writer',
		workflow
	});

	const basePrompt = buildWriterTaskMessage({
		jobDescription: context.jobDescription,
		baselineCv: context.baselineCv,
		profileInstructions: context.profileInstructions,
		jobInstructions: context.jobInstructions,
		critiquePlan: context.critiquePlan,
		previousDraft: context.previousDraftMarkdown,
		latestReview: context.latestReview,
		latestUserFeedback: context.latestUserFeedback
	});

	const normalized = await generateFreeformWithRepair({
		convex,
		runId,
		phase: context.requestKind === 'initial_draft' ? 'drafting' : 'revision',
		role: 'writer',
		modelSlug: context.agent.modelSlug,
		gatewayProvider: context.agent.gatewayProvider,
		requestParams: context.agent.defaultRequestParameters,
		system,
		basePrompt,
		loopNumber: context.loopNumber,
		operationKind:
			context.requestKind === 'initial_draft'
				? OPERATION_KIND.draftGeneration
				: context.requestKind === 'user_feedback_revision'
					? OPERATION_KIND.userFeedbackDraft
					: OPERATION_KIND.draftRevision,
		maxRetriesPerCall: 3,
		maxNormalizationRepairs: 1,
		signal,
		normalize: normalizeDraft,
		repairPromptSuffix: (errorMessage) =>
			[
				'Your previous draft could not be accepted.',
				`Problem: ${errorMessage}`,
				'Return only the resume content in markdown.',
				'Do not include explanations, apologies, or meta commentary.',
				'Include clear resume sections and substantive content.'
			].join('\n')
	});

	const canonical: CanonicalDraft = {
		canonicalJson: normalized.data.canonicalJson,
		markdown: normalized.data.markdown,
		plainText: normalized.data.plainText,
		previewText: normalized.data.previewText
	};

	const messageSummary = buildDraftAnnouncementMessage({
		iteration: context.currentIteration,
		isRevision: context.requestKind !== 'initial_draft',
		draft: normalized.data
	});

	const { next } = await convex.mutation(api.runs.index.completeDraft, {
		runId,
		llmCallId: normalized.llmCallId,
		canonical,
		messageSummary,
		basedOnVersionId: instruction.basedOnVersionId
	});

	return next;
}

async function handleExportInstruction(
	convex: ConvexHttpClient,
	runId: Id<'runs'>,
	instruction: Extract<NextInstruction, { action: 'generate_export' }>
): Promise<NextInstruction> {
	const { next } = await convex.mutation(api.runs.completeExport, {
		runId,
		artifactVersionId: instruction.artifactVersionId,
		format: 'pdf'
	});

	return next;
}

async function generateStructuredWithRepair<T>(args: {
	convex: ConvexHttpClient;
	runId: Id<'runs'>;
	phase: 'baseline_review' | 'reviewing';
	role: 'reviewer';
	modelSlug: string;
	gatewayProvider: string;
	requestParams: {
		temperature: number;
		topP: number;
		maxOutputTokens?: number;
		seed?: number;
		stopSequences?: string[];
		responseFormat?: 'text' | 'json';
		reasoning?: { effort: 'low' | 'medium' | 'high' } | null;
		routing?: { order?: string[]; requireParameters?: boolean };
	};
	system: string;
	basePrompt: string;
	schema: Parameters<typeof callStructuredOutput<T>>[0]['schema'];
	loopNumber: number;
	operationKind: operationKind;
	maxRetriesPerCall: number;
	maxNormalizationRepairs: number;
	signal?: AbortSignal;
	normalize: (
		raw: unknown,
		strategy: 'native_structured' | 'prompted_json' | 'freeform_text'
	) => NormalizationResult<T>;
	repairPromptSuffix: (errorMessage: string) => string;
}): Promise<{
	llmCallId: Id<'llmCalls'>;
	data: T;
}> {
	let prompt = args.basePrompt;
	let lastError = 'Unknown normalization error';

	for (let repairAttempt = 0; repairAttempt <= args.maxNormalizationRepairs; repairAttempt += 1) {
		const result = await callStructuredOutput({
			convex: args.convex,
			runId: args.runId,
			phase: args.phase,
			role: args.role,
			modelSlug: args.modelSlug,
			gatewayProvider: args.gatewayProvider,
			requestParams: args.requestParams,
			system: args.system,
			prompt,
			schema: args.schema,
			loopNumber: args.loopNumber,
			operationKind: args.operationKind,
			maxRetries: args.maxRetriesPerCall,
			signal: args.signal
		});

		const normalized = args.normalize(result.output, result.strategy);

		if (normalized.ok) {
			await finalizeNormalization(args.convex, {
				llmCallId: result.llmCallId,
				normalizationStatus: 'succeeded'
			});

			return {
				llmCallId: result.llmCallId,
				data: normalized.data
			};
		}

		lastError = normalized.error;

		await finalizeNormalization(args.convex, {
			llmCallId: result.llmCallId,
			normalizationStatus: 'failed',
			normalizationError: normalized.error
		});

		if (!normalized.repairable || repairAttempt === args.maxNormalizationRepairs) {
			throw new Error(normalized.error);
		}

		prompt = `${args.basePrompt}

${args.repairPromptSuffix(normalized.error)}`;
	}

	throw new Error(lastError);
}

async function generateFreeformWithRepair(args: {
	convex: ConvexHttpClient;
	runId: Id<'runs'>;
	phase: 'drafting' | 'revision';
	role: 'writer';
	modelSlug: string;
	gatewayProvider: string;
	requestParams: {
		temperature: number;
		topP: number;
		maxOutputTokens?: number;
		seed?: number;
		stopSequences?: string[];
		responseFormat?: 'text' | 'json';
		reasoning?: { effort: 'low' | 'medium' | 'high' } | null;
		routing?: { order?: string[]; requireParameters?: boolean };
	};
	system: string;
	basePrompt: string;
	loopNumber: number;
	operationKind: operationKind;
	maxRetriesPerCall: number;
	maxNormalizationRepairs: number;
	signal?: AbortSignal;
	normalize: (raw: string) => NormalizationResult<NormalizedDraft>;
	repairPromptSuffix: (errorMessage: string) => string;
}): Promise<{
	llmCallId: Id<'llmCalls'>;
	data: NormalizedDraft;
}> {
	let prompt = args.basePrompt;
	let lastError = 'Unknown draft normalization error';

	for (let repairAttempt = 0; repairAttempt <= args.maxNormalizationRepairs; repairAttempt += 1) {
		const result = await callFreeform({
			convex: args.convex,
			runId: args.runId,
			phase: args.phase,
			role: args.role,
			modelSlug: args.modelSlug,
			gatewayProvider: args.gatewayProvider,
			requestParams: args.requestParams,
			system: args.system,
			prompt,
			loopNumber: args.loopNumber,
			operationKind: args.operationKind,
			maxRetries: args.maxRetriesPerCall,
			signal: args.signal
		});

		const normalized = args.normalize(result.output);

		if (normalized.ok) {
			await finalizeNormalization(args.convex, {
				llmCallId: result.llmCallId,
				normalizationStatus: 'succeeded'
			});

			return {
				llmCallId: result.llmCallId,
				data: normalized.data
			};
		}

		lastError = normalized.error;

		await finalizeNormalization(args.convex, {
			llmCallId: result.llmCallId,
			normalizationStatus: 'failed',
			normalizationError: normalized.error
		});

		if (!normalized.repairable || repairAttempt === args.maxNormalizationRepairs) {
			throw new Error(normalized.error);
		}

		prompt = `${args.basePrompt}

${args.repairPromptSuffix(normalized.error)}`;
	}

	throw new Error(lastError);
}

async function finalizeNormalization(
	convex: ConvexHttpClient,
	args: {
		llmCallId: Id<'llmCalls'>;
		normalizationStatus: 'succeeded' | 'failed';
		normalizationError?: string;
	}
): Promise<void> {
	await convex.mutation(api.ai.index.updateNormalization, args);
}

function isAbortError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	return error.name === 'AbortError' || error.message.toLowerCase().includes('aborted');
}

function toError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}
