import { randomUUID } from 'node:crypto';
import { generateText, Output } from 'ai';
import { getChatModel } from './openrouter';
import {
	CritiqueAndPlanSchema,
	ReviewSchema,
	type CritiquePlan,
	type ReviewResult,
	type WorkflowEvent,
	type WorkflowRequest,
	type WorkflowResult
} from './schemas';
import { assertModelAllowedForRole } from './models';
import { resolveCustomProfileInstructions } from './profile-customization';
import {
	buildReviewerPlanTaskMessage,
	buildReviewerReviewTaskMessage,
	buildSystemPrompt,
	buildWriterTaskMessage,
	sanitizeUserText
} from './prompt-builder';

type RunWorkflowArgs = {
	userId: string;
	input: WorkflowRequest;
	emit?: (event: WorkflowEvent) => void | Promise<void>;
	signal?: AbortSignal;
};

async function emitEvent(emit: RunWorkflowArgs['emit'], event: WorkflowEvent): Promise<void> {
	if (!emit) return;
	await emit(event);
}

async function generateCritiquePlan(args: {
	modelId: string;
	system: string;
	prompt: string;
	signal?: AbortSignal;
}): Promise<CritiquePlan | string> {
	try {
		console.log('Generating critique plan with Prompt:', args.system, args.prompt);
		const response = await generateText({
			model: getChatModel(args.modelId),
			system: args.system,
			prompt: args.prompt,
			temperature: 0,
			abortSignal: args.signal,
			output: Output.object({
				schema: CritiqueAndPlanSchema
			}),
			providerOptions: {
				openrouter: {
					provider: {
						require_parameters: true,
						order: ['deepinfra/bf16'] // fireworks
					}
				}
			}
		});

		console.log('Raw output from model for critique plan:', response.output);

		return response.output;
	} catch (error) {
		console.error('Error generating critique plan:', error);
		throw error;
	}
}

async function generateWriterDraft(args: {
	modelId: string;
	system: string;
	prompt: string;
	signal?: AbortSignal;
}): Promise<string> {
	try {
		const { text } = await generateText({
			model: getChatModel(args.modelId),
			system: args.system,
			prompt: args.prompt,
			temperature: 0.4,
			abortSignal: args.signal
		});

		return text.trim();
	} catch (error) {
		console.error('Error generating writer draft:', error);
		throw error;
	}
}

async function generateReviewerResult(args: {
	modelId: string;
	system: string;
	prompt: string;
	signal?: AbortSignal;
}): Promise<ReviewResult | string> {
	try {
		const response = await generateText({
			model: getChatModel(args.modelId),
			system: args.system,
			prompt: args.prompt,
			temperature: 0,
			abortSignal: args.signal,
			output: Output.object({
				schema: ReviewSchema
			}),
			providerOptions: {
				openrouter: {
					provider: {
						require_parameters: true
					}
				}
			}
		});

		console.log('Raw output from model for reviewer result:', response.output);
		return response.output;
	} catch (error) {
		console.error('Error generating reviewer result:', error);
		throw error;
	}
}

/**
 * Main orchestration function.
 *
 * Final workflow:
 *
 * 1. reviewerPlan
 * 2. writerDraft
 * 3. reviewerReview
 * 4. if revise:
 *      writerRevise
 *      reviewerReview
 *    repeat...
 * 5. Approved or max iterations reached
 *
 * Notes:
 * - the server owns all branching
 * - the reviewer never directly invokes the writer
 * - handoff is always server-mediated
 */
export async function runWriterReviewerWorkflow({
	userId,
	input,
	emit,
	signal
}: RunWorkflowArgs): Promise<WorkflowResult> {
	// enforce model policy before sending tokens; reviewer must support structured output tokens for the plan and review phases

	console.log('Asserting model permissions for workflow run:', userId, input, emit, signal);

	assertModelAllowedForRole(input.writer.modelId, 'writer');
	assertModelAllowedForRole(input.reviewer.modelId, 'reviewer', { requiredStructuredOutput: true });

	const runid = randomUUID();

	await emitEvent(emit, {
		type: 'run-started',
		runId: runid,
		startedAt: new Date().toISOString(),
		writerModelId: input.writer.modelId,
		reviewerModelId: input.reviewer.modelId,
		maxIterations: input.maxIterations
	});

	/**
	 * Load role-specific profile instructions.
	 *
	 * Writer and reviewer may have different customization for the same profile.
	 */
	const writerProfileInstructions = await resolveCustomProfileInstructions({
		userId,
		role: 'writer',
		profileId: input.profileId
	});
	const reviewerProfileInstructions = await resolveCustomProfileInstructions({
		userId,
		role: 'reviewer',
		profileId: input.profileId
	});

	// sanitize user controlled content
	const safeJD = sanitizeUserText(input.jobDescription, 40000);
	const safeCV = sanitizeUserText(input.baselineCv, 40000);
	const safeUserInstructions = sanitizeUserText(input.jobInstructions ?? '', 5000);

	/**
	 * ------------------------------------------------------------
	 * PHASE 1: Reviewer critique & plan
	 * ------------------------------------------------------------
	 *
	 * This is the preflight phase.
	 * We do not count it as a drafting iteration.
	 *
	 * Its output is a structured planning artifact that will guide:
	 * - the first draft
	 * - all later revisions
	 */
	await emitEvent(emit, {
		type: 'agent-started',
		role: 'reviewer',
		phase: 'reviewerPlan',
		iteration: 0,
		modelId: input.reviewer.modelId
	});

	const reviewerPlanSystemPrompt = buildSystemPrompt({
		role: 'reviewer',
		workflow: 'reviewerPlan'
	});

	const reviewerPlanPrompt = buildReviewerPlanTaskMessage({
		jobDescription: safeJD,
		baselineCv: safeCV,
		profileInstructions: reviewerProfileInstructions ?? '',
		// runInstructions: safeReviewerRunInstructions,
		jobInstructions: safeUserInstructions
	});

	console.log('Planning');

	const critiquePlan = await generateCritiquePlan({
		modelId: input.reviewer.modelId,
		system: reviewerPlanSystemPrompt,
		prompt: reviewerPlanPrompt,
		signal
	});

	console.log('Generated critique plan:', critiquePlan);

	await emitEvent(emit, {
		type: 'plan-produced',
		plan: critiquePlan
	});

	/**
	 * ------------------------------------------------------------
	 * PHASE 2: Writer creates the first draft
	 * ------------------------------------------------------------
	 *
	 * This is iteration 1.
	 * The writer gets:
	 * - original source inputs
	 * - role/profile/run instructions
	 * - critique plan
	 *
	 * It does NOT yet receive previous draft / review because none exist.
	 */
	await emitEvent(emit, {
		type: 'agent-started',
		role: 'writer',
		phase: 'writerDraft',
		iteration: 0,
		modelId: input.writer.modelId
	});

	const writerDraftSystemPrompt = buildSystemPrompt({
		role: 'writer',
		workflow: 'writerDraft'
	});

	const writerDraftPrompt = buildWriterTaskMessage({
		jobDescription: safeJD,
		baselineCv: safeCV,
		critiquePlan: critiquePlan,
		profileInstructions: writerProfileInstructions ?? '',
		jobInstructions: safeUserInstructions
	});

	let currentDraft = await generateWriterDraft({
		modelId: input.writer.modelId,
		system: writerDraftSystemPrompt,
		prompt: writerDraftPrompt,
		signal
	});

	await emitEvent(emit, {
		type: 'draft-produced',
		iteration: 1,
		draft: currentDraft
	});

	console.log('Generated current draft:', currentDraft);

	/**
	 * ------------------------------------------------------------
	 * PHASE 3+: Review loop
	 * ------------------------------------------------------------
	 *
	 * For each drafting iteration:
	 * - reviewer evaluates the current draft
	 * - if approved -> stop
	 * - if revise and we still have budget -> writer revises
	 * - the next draft becomes the new current draft
	 */

	let latestReview: ReviewResult | string | null = null;

	for (let iteration = 1; iteration <= input.maxIterations; iteration += 1) {
		// break if we have reached max iterations

		console.log(`Starting iteration ${iteration} of review loop`);

		if (iteration > input.maxIterations) break;

		// core loop
		await emitEvent(emit, {
			type: 'agent-started',
			role: 'reviewer',
			phase: 'reviewerReview',
			iteration,
			modelId: input.reviewer.modelId
		});

		const reviewerReviewSystemPrompt = buildSystemPrompt({
			role: 'reviewer',
			workflow: 'reviewerReview'
		});

		latestReview = await generateReviewerResult({
			modelId: input.reviewer.modelId,
			system: reviewerReviewSystemPrompt,
			prompt: buildReviewerReviewTaskMessage({
				jobDescription: safeJD,
				baselineCv: safeCV,
				profileInstructions: reviewerProfileInstructions ?? '',
				jobInstructions: safeUserInstructions,
				critiquePlan,
				currentDraft
			}),
			signal
		});

		console.log('Generated review for iteration', iteration, ':', latestReview);

		await emitEvent(emit, {
			type: 'review-produced',
			iteration,
			review: latestReview!
		});

		// check if approved
		if (typeof latestReview !== 'string' && latestReview && latestReview.verdict === 'approved') {
			await emitEvent(emit, {
				type: 'approved',
				iteration,
				finalResume: currentDraft,
				review: latestReview
			});

			return {
				status: 'approved',
				iterations: iteration,
				finalResume: currentDraft,
				review: latestReview,
				plan: critiquePlan
			};
		}

		/**
		 * Otherwise, generate the next revision.
		 *
		 * The writer receives:
		 * - original critique plan
		 * - previous draft
		 * - latest reviewer feedback
		 *
		 * This is the key handoff loop.
		 */

		const nextIteration = iteration + 1;

		await emitEvent(emit, {
			type: 'agent-started',
			role: 'writer',
			phase: 'writerRevise',
			iteration: nextIteration,
			modelId: input.writer.modelId
		});

		const writerReviseSystemPrompt = buildSystemPrompt({
			role: 'writer',
			workflow: 'writerRevise'
		});

		currentDraft = await generateWriterDraft({
			modelId: input.writer.modelId,
			system: writerReviseSystemPrompt,
			prompt: buildWriterTaskMessage({
				jobDescription: safeJD,
				baselineCv: safeCV,
				profileInstructions: writerProfileInstructions ?? '',
				jobInstructions: safeUserInstructions,
				critiquePlan,
				previousDraft: currentDraft,
				latestReview
			}),
			signal
		});

		console.log('Generated next draft for iteration', iteration, ':', currentDraft);
		await emitEvent(emit, {
			type: 'draft-produced',
			iteration: nextIteration,
			draft: currentDraft
		});
	}

	// if we exit the loop without approval, we are either at max iterations or have been aborted. In both cases we return the latest draft and review for potential human review.

	await emitEvent(emit, {
		type: 'max-iterations-reached',
		iteration: input.maxIterations,
		finalResume: currentDraft,
		review: latestReview
	});

	return {
		status: 'needs-human-review',
		iterations: input.maxIterations,
		finalResume: currentDraft,
		review: latestReview,
		plan: critiquePlan
	};
}
