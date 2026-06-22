import type { ConvexHttpClient } from 'convex/browser';
import type { Id } from '../../../../../convex/_generated/dataModel';
import type {
	CompleteLLMCallParams,
	LLMCallPhase,
	LLMCallRole,
	llmCallStatus,
	ModelRequestParameters,
	operationKind,
	OutputStrategy
} from './types';
import type z from 'zod';
import { api } from '../../../../../convex/_generated/api';
import { getChatModel } from '../../openrouter';
import { generateText, Output } from 'ai';
import type { OpenRouterUsageAccounting } from '@openrouter/ai-sdk-provider';
import type { NormalizationResult } from './normalization';
import { buildFreeformRepairPrompt, buildStructuredRepairPrompt } from '../../prompt-builder';
import { DEFAULT_MAX_RETRIES } from '../../models';

export interface BaseCallArgs {
	convex: ConvexHttpClient;
	runId: Id<'runs'>;
	phase: LLMCallPhase;
	role: LLMCallRole;
	modelSlug: string;
	gatewayProvider?: string;
	requestParams: ModelRequestParameters;
	system: string;
	prompt: string;
	loopNumber: number;
	operationKind: operationKind;
	maxRetries: number;
	signal?: AbortSignal;
	startingAttemptNumber?: number;
	initialRetryOfCallId?: Id<'llmCalls'>;
}

export interface StructuredCallArgs<T> extends BaseCallArgs {
	schema: z.ZodType<T>;
	normalize?: (
		raw: unknown,
		strategy: 'native_structured' | 'prompted_json' | 'freeform_text'
	) => NormalizationResult<T>;
	repairPromptSuffix?: (validationErrorMessage: string) => string;
	maxRepairAttempts?: number;
}

export interface FreeFormCallArgs<T> extends BaseCallArgs {
	normalize: (raw: string) => NormalizationResult<T>;
	repairPromptSuffix?: (errorMessage: string) => string;
}

export interface LLMCallResult<T> {
	llmCallId: Id<'llmCalls'>;
	output: T;
	strategy: OutputStrategy;
	rawText: string;
	// next attempt number to pass if caller wants to continue chain
	nextAttemptNumber: number;
}

interface AttemptOutcome {
	latencyMs: number;
	inputTokens?: number;
	outputTokens?: number;
	reasoningTokens?: number;
	cachedTokens?: number;
	finishReason?: string;
	rawText: string;
	output: unknown;
	reasoning?: string;
	openRouterRequestId?: string;
	routedProvider?: string;
	strategyUsed?: OutputStrategy;
	status: 'completed' | 'failed' | 'cancelled';
	completedAt: number;
	costUsd?: number;
}

type AttemptResult =
	| { kind: 'success'; outcome: AttemptOutcome }
	| { kind: 'failure'; error: Error; latencyMs: number }
	| { kind: 'cancelled'; error: Error; latencyMs: number };

interface RunSingleAttemptArgs extends BaseCallArgs {
	strategy: OutputStrategy;
	attemptNumber: number;
	retryOfCallId?: Id<'llmCalls'>;
	executor: () => Promise<AttemptOutcome>;
}

type StructuredValidationResult<T> =
	| {
			success: true;
			data: T;
			wasNormalized: boolean;
			normalizationError?: undefined;
			normalizationStatus?: 'succeeded';
	  }
	| {
			success: false;
			error: Error;
			normalizedOutput?: unknown;
			normalizationError?: string;
			normalizationStatus?: 'failed';
	  };

type UnstructuredValidationResult<T> =
	| {
			success: true;
			data: T;
			wasNormalized: boolean;
			normalizationError?: undefined;
			normalizationStatus?: 'succeeded';
	  }
	| {
			success: false;
			error: Error;
			normalizedOutput?: unknown;
			normalizationError?: string;
			normalizationStatus?: 'failed';
	  };

export async function callStructuredOutput<T>(
	args: StructuredCallArgs<T>
): Promise<LLMCallResult<T>> {
	const strategies: OutputStrategy[] = ['native_structured', 'prompted_json'];
	let attemptNumber = args.startingAttemptNumber ?? 1;
	let previousCallId = args.initialRetryOfCallId;
	let lastError: Error | null = null;

	for (const strategy of strategies) {
		for (let retry = 0; retry < args.maxRetries; retry++) {
			const { llmCallId, result } = await runSingleAttempt({
				...args,
				strategy,
				attemptNumber,
				retryOfCallId: previousCallId,
				executor: () => executeStructuredCall(args, strategy)
			});

			console.debug(
				`Attempt ${attemptNumber} for structured call completed with status: ${result.kind}`
			);

			if (result.kind === 'success') {
				/**
				 * we validate and normalize the output here
				 * this allows us to inspect the output - ensure that normalization can happen instead of another loop being retried
				 * */

				// we try to normalize
				const validated = await validateOrNormalizeStructuredOutput(
					args,
					result.outcome.output,
					strategy
				);
				if (validated.success) {
					console.log('Structured call successful, marking call as completed.');
					await completeCall(args.convex, {
						llmCallId,
						openRouterRequestId: result.outcome.openRouterRequestId ?? '',
						routedProvider: result.outcome.routedProvider,
						status: 'completed',
						completedAt: result.outcome.completedAt,
						costUsd: result.outcome.costUsd ?? 0,
						latencyMs: result.outcome.latencyMs,
						inputTokens: result.outcome.inputTokens ?? 0,
						outputTokens: result.outcome.outputTokens ?? 0,
						reasoningTokens: result.outcome.reasoningTokens ?? 0,
						cachedTokens: result.outcome.cachedTokens ?? 0,
						finishReason: result.outcome.finishReason ?? '',
						normalizationStatus: 'succeeded',
						normalizationError: validated.success ? undefined : 'Output did not match schema',
						gatewayProvider: args.gatewayProvider ?? 'openrouter',
						strategyUsed: strategy,
						loopNumber: args.loopNumber,
						retryOfCallId: previousCallId,
						attemptNumber,
						content: {
							systemPrompt: args.system,
							userPrompt: args.prompt,
							rawResponse: result.outcome.output,
							structuredOutput: validated.data
						}
					});

					await finalizeNormalization(args.convex, {
						llmCallId,
						normalizationStatus: validated.wasNormalized
							? (validated.normalizationStatus ?? 'succeeded')
							: 'succeeded',
						normalizationError: validated.wasNormalized ? validated.normalizationError : undefined
					});

					return {
						llmCallId,
						output: validated.data!,
						strategy,
						rawText: result.outcome.rawText,
						nextAttemptNumber: attemptNumber + 1
					};
				}
				console.log(
					'Validation or normalization failed for structured output, marking call as failed and retrying if possible. Error: ',
					validated.error
				);
				// normalization has failed - we'll attempt a small repair
				await completeCall(args.convex, {
					llmCallId,
					openRouterRequestId: result.outcome.openRouterRequestId ?? '',
					routedProvider: result.outcome.routedProvider,
					status: 'failed',
					completedAt: result.outcome.completedAt,
					costUsd: result.outcome.costUsd ?? 0,
					latencyMs: result.outcome.latencyMs,
					inputTokens: result.outcome.inputTokens ?? 0,
					outputTokens: result.outcome.outputTokens ?? 0,
					reasoningTokens: result.outcome.reasoningTokens ?? 0,
					cachedTokens: result.outcome.cachedTokens ?? 0,
					finishReason: result.outcome.finishReason ?? '',
					normalizationStatus: 'failed',
					normalizationError: 'Output did not match schema',
					gatewayProvider: args.gatewayProvider ?? 'openrouter',
					strategyUsed: strategy,
					loopNumber: args.loopNumber,
					retryOfCallId: previousCallId,
					attemptNumber,
					content: {
						systemPrompt: args.system,
						userPrompt: args.prompt,
						rawResponse: result.outcome.output,
						error: validated.error
					}
				});

				lastError = new Error(validated.error.message);
				previousCallId = llmCallId;
				attemptNumber++;

				await finalizeNormalization(args.convex, {
					llmCallId,
					normalizationStatus: validated.normalizationStatus ?? 'failed',
					normalizationError: validated.normalizationError ?? 'Output did not match schema'
				});

				const maxLlmRepairAttempts = DEFAULT_MAX_RETRIES ?? 1;

				if (maxLlmRepairAttempts > 0) {
					// repairing the output with a small focused prompt that includes the validation error - this is more cost effective than retrying the entire call, and can often fix simple issues like formatting problems
					const repairResult = await attemptSmallStructuredRepair({
						callArgs: args,
						rawOutput: result.outcome.output,
						validationError: validated.error,
						previousCallId,
						attemptNumber,
						strategy
					});

					attemptNumber = repairResult.nextAttemptNumber;
					previousCallId = repairResult.llmCallId;

					if (repairResult.success) {
						return {
							llmCallId: repairResult.llmCallId,
							output: repairResult.output,
							strategy,
							rawText: repairResult.rawText,
							nextAttemptNumber: repairResult.nextAttemptNumber
						};
					}
					lastError = repairResult.error;
				} else {
					lastError = validated.error;
				}

				if (retry < args.maxRetries - 1) {
					await sleep(backOffMs(retry));
				}

				continue;
			}
			if (result.kind === 'cancelled') {
				// if cancelled, end the chain immediately - we don't want to keep retrying if the user has cancelled
				await completeCall(args.convex, {
					llmCallId,
					status: 'cancelled',
					loopNumber: args.loopNumber,
					retryOfCallId: previousCallId,
					attemptNumber,
					content: {
						systemPrompt: args.system,
						userPrompt: args.prompt,
						error: result.error
					}
				});
				throw result.error;
			}
			await completeCall(args.convex, {
				llmCallId,
				status: 'failed',
				strategyUsed: strategy,
				loopNumber: args.loopNumber,
				retryOfCallId: previousCallId,
				latencyMs: result.latencyMs,
				attemptNumber,
				content: {
					systemPrompt: args.system,
					userPrompt: args.prompt,
					error: result.error
				}
			});
			lastError = result.error;
			previousCallId = llmCallId;
			attemptNumber++;
			if (retry < args.maxRetries - 1) await sleep(backOffMs(retry));
		}
	}
	throw new Error(
		`All attempts to call LLM failed. Last error: ${lastError?.message ?? 'unknown error'}`
	);
}

export async function callFreeform<T>(args: FreeFormCallArgs<T>): Promise<LLMCallResult<T>> {
	let attemptNumber = args.startingAttemptNumber ?? 1;
	let previousCallId = args.initialRetryOfCallId;
	let lastError: Error | null = null;

	for (let retry = 0; retry < args.maxRetries; retry += 1) {
		const { llmCallId, result } = await runSingleAttempt({
			...args,
			strategy: 'freeform_text',
			attemptNumber,
			retryOfCallId: previousCallId,
			executor: () => executeFreeformCall(args)
		});

		console.debug(
			`Attempt ${attemptNumber} for freeform call completed with status: ${result.kind}`
		);

		if (result.kind === 'success') {
			const rawText = result.outcome.rawText.trim();
			const validatedOutput = await validateOrNormalizeFreeformOutput(args, rawText);
			console.log('Freeform call successful');
			if (validatedOutput.success) {
				// everything okay
				await completeCall(args.convex, {
					llmCallId,
					status: 'completed',
					openRouterRequestId: result.outcome.openRouterRequestId ?? '',
					routedProvider: result.outcome.routedProvider,
					strategyUsed: 'freeform_text',
					latencyMs: result.outcome.latencyMs,
					inputTokens: result.outcome.inputTokens,
					outputTokens: result.outcome.outputTokens,
					reasoningTokens: result.outcome.reasoningTokens,
					cachedTokens: result.outcome.cachedTokens,
					finishReason: result.outcome.finishReason,
					normalizationStatus: 'pending',
					gatewayProvider: args.gatewayProvider ?? 'openrouter',
					completedAt: result.outcome.completedAt,
					costUsd: result.outcome.costUsd ?? 0,
					loopNumber: args.loopNumber,
					retryOfCallId: previousCallId,
					attemptNumber,
					content: {
						systemPrompt: args.system,
						userPrompt: args.prompt,
						rawResponse: result.outcome.rawText
					}
				});

				await finalizeNormalization(args.convex, {
					llmCallId,
					normalizationStatus: validatedOutput.wasNormalized ? 'succeeded' : 'succeeded'
				});

				return {
					llmCallId,
					output: validatedOutput.data,
					strategy: 'freeform_text',
					rawText,
					nextAttemptNumber: attemptNumber + 1
				};
			}
			// if normalization fails, we consider the attempt a failure and try a repair
			await completeCall(args.convex, {
				llmCallId,
				openRouterRequestId: result.outcome.openRouterRequestId ?? '',
				routedProvider: result.outcome.routedProvider,
				status: 'failed',
				completedAt: result.outcome.completedAt,
				costUsd: result.outcome.costUsd ?? 0,
				latencyMs: result.outcome.latencyMs,
				inputTokens: result.outcome.inputTokens ?? 0,
				outputTokens: result.outcome.outputTokens ?? 0,
				reasoningTokens: result.outcome.reasoningTokens ?? 0,
				cachedTokens: result.outcome.cachedTokens ?? 0,
				finishReason: result.outcome.finishReason ?? '',
				normalizationStatus: 'failed',
				normalizationError: 'Output did not match schema',
				gatewayProvider: args.gatewayProvider ?? 'openrouter',
				loopNumber: args.loopNumber,
				retryOfCallId: previousCallId,
				attemptNumber,
				content: {
					systemPrompt: args.system,
					userPrompt: args.prompt,
					rawResponse: result.outcome.output,
					error: validatedOutput.error
				}
			});

			await finalizeNormalization(args.convex, {
				llmCallId,
				normalizationStatus: validatedOutput.normalizationStatus ?? 'failed',
				normalizationError:
					validatedOutput.normalizationError ?? 'Output did not match resume format'
			});

			// we need to attempt to repair the resume

			const maxRepairRetries = DEFAULT_MAX_RETRIES ?? 1;

			if (maxRepairRetries > 0) {
				const repairResult = await attemptSmallFreeformRepair({
					callArgs: args,
					rawOutput: result.outcome.output,
					validationError: validatedOutput.error,
					previousCallId: llmCallId,
					attemptNumber
				});

				attemptNumber = repairResult.nextAttemptNumber;
				previousCallId = repairResult.llmCallId;

				if (repairResult.success) {
					return {
						llmCallId: repairResult.llmCallId,
						output: repairResult.output,
						strategy: 'freeform_text',
						rawText: repairResult.rawText,
						nextAttemptNumber: repairResult.nextAttemptNumber
					};
				}
				lastError = repairResult.error;
			} else {
				lastError = validatedOutput.error;
				previousCallId = llmCallId;
				attemptNumber += 1;
			}

			// a failed normalization/repair is just another failed attempt: honor
			// the configured retry policy instead of bailing out immediately
			if (retry < args.maxRetries - 1) {
				await sleep(backOffMs(retry));
				continue;
			}

			throw lastError;
		}

		if (result.kind === 'cancelled') {
			await completeCall(args.convex, {
				llmCallId,
				status: 'cancelled',
				strategyUsed: 'freeform_text',
				loopNumber: args.loopNumber,
				retryOfCallId: previousCallId,
				attemptNumber,
				content: {
					systemPrompt: args.system,
					userPrompt: args.prompt,
					error: result.error
				}
			});
			throw result.error;
		}

		console.log('Are we falling through to this failure block? and therefore retrying?');

		await completeCall(args.convex, {
			llmCallId,
			status: 'failed',
			strategyUsed: 'freeform_text',
			loopNumber: args.loopNumber,
			retryOfCallId: previousCallId,
			latencyMs: result.latencyMs,
			attemptNumber,
			content: {
				systemPrompt: args.system,
				userPrompt: args.prompt,
				error: result.error
			}
		});

		console.log(`Attempt ${attemptNumber} for freeform call failed.`);
		lastError = result.error;
		previousCallId = llmCallId;
		attemptNumber += 1;

		if (retry < args.maxRetries - 1) await sleep(backOffMs(retry));
	}

	throw new Error(
		`Writer call failed after ${args.maxRetries} attempts. Last error: ${lastError?.message}`
	);
}

export async function profileCreationInference<T>(input: {
	systemPrompt: string;
	profileCreationPrompt: string;
	strategy: OutputStrategy;
	schema: z.ZodType<T>;
	modelSlug: string;
}) {
	const result = await generateText({
		model: getChatModel(input.modelSlug),
		system: input.systemPrompt,
		prompt: input.profileCreationPrompt,
		temperature: 0.1,
		topP: 0.4,
		maxOutputTokens: 5000,
		output: Output.object({
			schema: input.schema
		}),
		providerOptions: {
			openrouter: {
				provider: {
					require_parameters: true,
					order: ['deepinfra/bf16']
				}
			}
		},
		experimental_telemetry: {
			isEnabled: true,
			functionId: 'resume-tailor/profile/inference'
		}
	});

	return result.output;
}

async function runSingleAttempt(
	args: RunSingleAttemptArgs
): Promise<{ llmCallId: Id<'llmCalls'>; result: AttemptResult }> {
	let callId: Id<'llmCalls'>;
	try {
		const { data } = await args.convex.mutation(api.ai.index.aiCall, {
			runId: args.runId,
			openRouterRequestId: undefined, // because we don't have this yet - it should be included in the patch
			phase: args.phase,
			role: args.role,
			attemptNumber: args.attemptNumber,
			retryOfCallId: args.retryOfCallId,
			gatewayProvider: args.gatewayProvider ?? undefined, // unless we explicitly set a provider, openrouter should route out request every which way
			modelSlug: args.modelSlug,
			routedProvider: undefined, // we don't know this yet - it will be included in the patch after we get the response from openrouter
			requestParams: args.requestParams,
			requestedStrategy: args.strategy,
			strategyUsed: undefined, // we don't know this yet - it will be included in the patch after we get the response from openrouter
			status: 'queued',
			latencyMs: undefined,
			normalizationStatus: 'pending',
			loopNumber: args.loopNumber,
			operationKind: args.operationKind,
			completedAt: undefined,
			content: {
				kind: 'prompt',
				format: 'text',
				text: args.prompt
			}
		});
		callId = data as Id<'llmCalls'>;
	} catch (error) {
		// if we fail to create the llm call record, we should fail the attempt and not retry
		console.log(error);
		throw error;
	}

	const startedAt = Date.now();

	try {
		await updateCallStatus(args.convex, 'running', callId);
		console.log(
			'Attempt',
			args.attemptNumber,
			'for call',
			callId,
			'is starting execution.',
			'Strategy: ',
			args.strategy
		);
		const outcome = await args.executor();
		return { llmCallId: callId, result: { kind: 'success', outcome } };
	} catch (error) {
		const latencyMs = Date.now() - startedAt;
		const resolved = toError(error);

		if (isAbortError(error) || args.signal?.aborted) {
			return {
				llmCallId: callId,
				result: { kind: 'cancelled', error: resolved, latencyMs }
			};
		}

		return { llmCallId: callId, result: { kind: 'failure', error: resolved, latencyMs } };
	}
}

async function executeStructuredCall<T>(
	args: StructuredCallArgs<T>,
	strategy: OutputStrategy
): Promise<AttemptOutcome> {
	const startedAt = Date.now();
	if (strategy === 'native_structured') {
		const result = await generateText({
			model: getChatModel(args.modelSlug),
			system: args.system,
			prompt: args.prompt,
			temperature: args.requestParams.temperature,
			topP: args.requestParams.topP,
			maxOutputTokens: args.requestParams.maxOutputTokens,
			abortSignal: args.signal,
			stopSequences: args.requestParams.stopSequences,
			seed: args.requestParams.seed,
			output: Output.object({
				schema: args.schema
			}),
			providerOptions: buildProviderOptions(args.requestParams),
			experimental_telemetry: {
				isEnabled: true,
				functionId: `resume-tailor/${args.role}/structured`,
				metadata: { run_id: args.runId, phase: args.phase, loop: args.loopNumber }
			}
		});
		const usageCost = extractUsageCost(result);
		return {
			latencyMs: Date.now() - startedAt,
			inputTokens: usageCost.inputTokens,
			outputTokens: usageCost.outputTokens,
			reasoningTokens: usageCost.reasoningTokens,
			cachedTokens: usageCost.cachedTokens,
			finishReason: result.finishReason,
			rawText: JSON.stringify(result.output),
			output: result.output,
			reasoning: normalizeReasoning(result.reasoning),
			openRouterRequestId: usageCost.openRouterRequestId,
			routedProvider: usageCost.routedProvider,
			strategyUsed: 'native_structured',
			status: 'completed',
			completedAt: Date.now(),
			costUsd: usageCost.costUsd
		};
	}

	const result = await generateText({
		model: getChatModel(args.modelSlug),
		system: args.system,
		prompt: `${args.prompt}
			You must respond with ONLY valid JSON matching the required schema.
			No markdown fenses, no explanations. Raw JSON only.`,
		temperature: args.requestParams.temperature,
		topP: args.requestParams.topP,
		maxOutputTokens: args.requestParams.maxOutputTokens,
		abortSignal: args.signal,
		stopSequences: args.requestParams.stopSequences,
		seed: args.requestParams.seed,
		providerOptions: buildProviderOptions(args.requestParams),
		experimental_telemetry: {
			isEnabled: true,
			functionId: `resume-tailor/${args.role}/structured-prompted`,
			metadata: { run_id: args.runId, phase: args.phase, loop: args.loopNumber }
		}
	});

	const parsed = parseJSONResponse(result.text);
	const usageCost = extractUsageCost(result);
	return {
		latencyMs: Date.now() - startedAt,
		inputTokens: usageCost.inputTokens,
		outputTokens: usageCost.outputTokens,
		reasoningTokens: usageCost.reasoningTokens,
		cachedTokens: usageCost.cachedTokens,
		finishReason: result.finishReason,
		rawText: JSON.stringify(parsed),
		output: parsed,
		openRouterRequestId: usageCost.openRouterRequestId,
		routedProvider: usageCost.routedProvider,
		strategyUsed: 'prompted_json',
		status: 'completed',
		completedAt: Date.now(),
		costUsd: usageCost.costUsd,
		reasoning: normalizeReasoning(result.reasoning)
	};
}

async function executeFreeformCall<T>(args: FreeFormCallArgs<T>): Promise<AttemptOutcome> {
	const startedAt = Date.now();

	const result = await generateText({
		model: getChatModel(args.modelSlug),
		system: args.system,
		prompt: args.prompt,
		temperature: args.requestParams.temperature,
		topP: args.requestParams.topP,
		maxOutputTokens: args.requestParams.maxOutputTokens,
		abortSignal: args.signal,
		stopSequences: args.requestParams.stopSequences,
		seed: args.requestParams.seed,
		providerOptions: buildProviderOptions(args.requestParams),
		experimental_telemetry: {
			isEnabled: true,
			functionId: `resume-tailor/${args.role}/freeform`,
			metadata: { run_id: args.runId, phase: args.phase, loop: args.loopNumber }
		}
	});

	console.debug('Freeform call completed');

	const usageCost = extractUsageCost(result);
	return {
		latencyMs: Date.now() - startedAt,
		inputTokens: usageCost.inputTokens,
		outputTokens: usageCost.outputTokens,
		reasoningTokens: usageCost.reasoningTokens,
		cachedTokens: usageCost.cachedTokens,
		finishReason: normalizeFinishReason(result.finishReason),
		rawText: result.text,
		output: result.text,
		reasoning: normalizeReasoning(result.reasoning),
		openRouterRequestId: usageCost.openRouterRequestId,
		routedProvider: usageCost.routedProvider,
		strategyUsed: 'freeform_text',
		status: 'completed',
		completedAt: Date.now(),
		costUsd: usageCost.costUsd
	};
}

async function executeStructuredRepairCall<T>(
	args: StructuredCallArgs<T>,
	repairPrompt: string
): Promise<AttemptOutcome> {
	const startedAt = Date.now();
	const result = await generateText({
		model: getChatModel(args.modelSlug),
		system: 'You repair malformed structured JSON. You do not perform the original task again.',
		prompt: repairPrompt,
		temperature: 0,
		topP: 1,
		maxOutputTokens: Math.min(args.requestParams.maxOutputTokens ?? 1000, 1000),
		abortSignal: args.signal,
		output: Output.object({
			schema: args.schema
		}),
		providerOptions: buildProviderOptions(args.requestParams),
		experimental_telemetry: {
			isEnabled: true,
			functionId: `resume-tailor/${args.role}/repair-structured`,
			metadata: { run_id: args.runId, phase: args.phase, loop: args.loopNumber }
		}
	});

	const usageCost = extractUsageCost(result);
	return {
		latencyMs: Date.now() - startedAt,
		inputTokens: usageCost.inputTokens,
		outputTokens: usageCost.outputTokens,
		reasoningTokens: usageCost.reasoningTokens,
		cachedTokens: usageCost.cachedTokens,
		finishReason: result.finishReason,
		rawText: JSON.stringify(result.output),
		output: result.output,
		reasoning: normalizeReasoning(result.reasoning),
		openRouterRequestId: usageCost.openRouterRequestId,
		routedProvider: usageCost.routedProvider,
		strategyUsed: 'native_structured',
		status: 'completed',
		completedAt: Date.now(),
		costUsd: usageCost.costUsd
	};
}

async function executeFreeformRepairCall<T>(
	args: FreeFormCallArgs<T>,
	repairPrompt: string
): Promise<AttemptOutcome> {
	const startedAt = Date.now();
	const result = await generateText({
		model: getChatModel(args.modelSlug),
		system: 'You repair malformed text. You do not perform the original task again.',
		prompt: repairPrompt,
		temperature: 0,
		topP: 1,
		maxOutputTokens: Math.min(args.requestParams.maxOutputTokens ?? 1000, 1000),
		abortSignal: args.signal,
		providerOptions: buildProviderOptions(args.requestParams),
		experimental_telemetry: {
			isEnabled: true,
			functionId: `resume-tailor/${args.role}/repair-freeform`,
			metadata: { run_id: args.runId, phase: args.phase, loop: args.loopNumber }
		}
	});

	const usageCost = extractUsageCost(result);
	return {
		latencyMs: Date.now() - startedAt,
		inputTokens: usageCost.inputTokens,
		outputTokens: usageCost.outputTokens,
		reasoningTokens: usageCost.reasoningTokens,
		cachedTokens: usageCost.cachedTokens,
		finishReason: result.finishReason,
		rawText: result.text,
		output: result.text,
		reasoning: normalizeReasoning(result.reasoning),
		openRouterRequestId: usageCost.openRouterRequestId,
		routedProvider: usageCost.routedProvider,
		strategyUsed: 'freeform_text',
		status: 'completed',
		completedAt: Date.now(),
		costUsd: usageCost.costUsd
	};
}

async function validateOrNormalizeStructuredOutput<T>(
	args: StructuredCallArgs<T>,
	rawOutput: unknown,
	strategy: OutputStrategy = 'native_structured'
): Promise<StructuredValidationResult<T>> {
	const direct = args.schema.safeParse(rawOutput);

	if (direct.success) {
		return {
			success: true,
			data: direct.data,
			wasNormalized: false
		};
	}

	if (!args.normalize) {
		return {
			success: false,
			error: direct.error
		};
	}

	let normalizedOutput: NormalizationResult<T>;

	try {
		normalizedOutput = await args.normalize(rawOutput, strategy);
	} catch (error) {
		return {
			success: false,
			error: direct.error,
			normalizationError: toError(error).message
		};
	}

	if (normalizedOutput.ok) {
		const normalized = args.schema.safeParse(normalizedOutput.data);

		if (normalized.success) {
			return {
				success: true,
				data: normalized.data,
				wasNormalized: true,
				normalizationStatus: 'succeeded'
			};
		}
		return {
			success: false,
			error: new Error('Normalized output did not match schema'),
			normalizedOutput: normalizedOutput.data,
			normalizationError: 'Normalized output did not match schema'
		};
	}
	// get all errors from zod and include them in the error message
	const errors = 'Zod validation errors: ' + JSON.stringify(normalizedOutput.zodErrors, null, 2);

	return {
		success: false,
		error: new Error(`${normalizedOutput.error}\n${errors}`),
		normalizedOutput,
		normalizationError: normalizedOutput.error,
		normalizationStatus: 'failed'
	};
}

async function validateOrNormalizeFreeformOutput<T>(
	args: FreeFormCallArgs<T>,
	rawText: string
): Promise<UnstructuredValidationResult<T>> {
	const normalizedOutput = args.normalize(rawText);
	if (normalizedOutput.ok) {
		return {
			success: true,
			data: normalizedOutput.data,
			wasNormalized: true
		};
	}

	return {
		success: false,
		error: new Error(normalizedOutput.error),
		normalizationError: normalizedOutput.error
	};
}

async function attemptSmallStructuredRepair<T>(args: {
	callArgs: StructuredCallArgs<T>;
	rawOutput: unknown;
	validationError: Error;
	previousCallId: Id<'llmCalls'>;
	attemptNumber: number;
	strategy: OutputStrategy;
}): Promise<
	| {
			success: true;
			llmCallId: Id<'llmCalls'>;
			output: T;
			rawText: string;
			nextAttemptNumber: number;
	  }
	| { success: false; llmCallId: Id<'llmCalls'>; error: Error; nextAttemptNumber: number }
> {
	const repairPrompt = buildStructuredRepairPrompt({
		rawOutput: args.rawOutput,
		validationError: args.validationError,
		repairPromptSuffix: args.callArgs.repairPromptSuffix?.(args.validationError.message)
	});
	const { llmCallId, result } = await runSingleAttempt({
		...args.callArgs,
		prompt: repairPrompt,
		system: 'You repair malformed JSON. You do not perform the original task again.',
		strategy: 'native_structured',
		attemptNumber: args.attemptNumber,
		retryOfCallId: args.previousCallId,
		executor: () => executeStructuredRepairCall(args.callArgs, repairPrompt)
	});

	if (result.kind === 'cancelled') {
		await completeCall(args.callArgs.convex, {
			llmCallId,
			status: 'cancelled',
			loopNumber: args.callArgs.loopNumber,
			retryOfCallId: args.previousCallId,
			attemptNumber: args.attemptNumber,
			content: {
				systemPrompt:
					'You repair malformed structured JSON. You do not perform the original task again.',
				userPrompt: repairPrompt,
				error: result.error
			}
		});

		throw result.error;
	}

	if (result.kind === 'failure') {
		await completeCall(args.callArgs.convex, {
			llmCallId,
			status: 'failed',
			strategyUsed: 'native_structured',
			loopNumber: args.callArgs.loopNumber,
			retryOfCallId: args.previousCallId,
			latencyMs: result.latencyMs,
			attemptNumber: args.attemptNumber,
			content: {
				systemPrompt:
					'You repair malformed structured JSON. You do not perform the original task again.',
				userPrompt: repairPrompt,
				error: result.error
			}
		});

		return {
			success: false,
			llmCallId,
			error: result.error,
			nextAttemptNumber: args.attemptNumber + 1
		};
	}

	const repaired = await validateOrNormalizeStructuredOutput(
		args.callArgs,
		result.outcome.output,
		args.strategy
	);

	if (!repaired.success) {
		await completeCall(args.callArgs.convex, {
			llmCallId,
			openRouterRequestId: result.outcome.openRouterRequestId ?? '',
			routedProvider: result.outcome.routedProvider,
			status: 'failed',
			completedAt: result.outcome.completedAt,
			costUsd: result.outcome.costUsd ?? 0,
			latencyMs: result.outcome.latencyMs,
			inputTokens: result.outcome.inputTokens ?? 0,
			outputTokens: result.outcome.outputTokens ?? 0,
			reasoningTokens: result.outcome.reasoningTokens ?? 0,
			cachedTokens: result.outcome.cachedTokens ?? 0,
			finishReason: result.outcome.finishReason ?? '',
			normalizationStatus: 'failed',
			normalizationError: repaired.normalizationError ?? 'AI repair did not match schema',
			gatewayProvider: args.callArgs.gatewayProvider ?? 'openrouter',
			strategyUsed: 'native_structured',
			loopNumber: args.callArgs.loopNumber,
			retryOfCallId: args.previousCallId,
			attemptNumber: args.attemptNumber,
			content: {
				systemPrompt:
					'You repair malformed structured JSON. You do not perform the original task again.',
				userPrompt: repairPrompt,
				rawResponse: result.outcome.output,
				error: repaired.error
			}
		});

		await finalizeNormalization(args.callArgs.convex, {
			llmCallId,
			normalizationStatus: 'failed' as const,
			normalizationError: repaired.normalizationError ?? 'Output did not match schema'
		});

		return {
			success: false,
			llmCallId,
			error: repaired.error,
			nextAttemptNumber: args.attemptNumber + 1
		};
	}

	await completeCall(args.callArgs.convex, {
		llmCallId,
		openRouterRequestId: result.outcome.openRouterRequestId ?? '',
		routedProvider: result.outcome.routedProvider,
		status: 'completed',
		completedAt: result.outcome.completedAt,
		costUsd: result.outcome.costUsd ?? 0,
		latencyMs: result.outcome.latencyMs,
		inputTokens: result.outcome.inputTokens ?? 0,
		outputTokens: result.outcome.outputTokens ?? 0,
		reasoningTokens: result.outcome.reasoningTokens ?? 0,
		cachedTokens: result.outcome.cachedTokens ?? 0,
		finishReason: result.outcome.finishReason ?? '',
		normalizationStatus: 'succeeded',
		gatewayProvider: args.callArgs.gatewayProvider ?? 'openrouter',
		strategyUsed: 'native_structured',
		loopNumber: args.callArgs.loopNumber,
		retryOfCallId: args.previousCallId,
		attemptNumber: args.attemptNumber,
		content: {
			systemPrompt:
				'You repair malformed structured JSON. You do not perform the original task again.',
			userPrompt: repairPrompt,
			rawResponse: result.outcome.output,
			structuredOutput: repaired.data
			// wasAIRepaired: true
			// wasLocallyNormalizedAfterRepair: repaired.wasNormalized
		}
	});

	await finalizeNormalization(args.callArgs.convex, {
		llmCallId,
		normalizationStatus: 'succeeded' as const
	});

	return {
		success: true,
		llmCallId,
		output: repaired.data,
		rawText: result.outcome.rawText,
		nextAttemptNumber: args.attemptNumber + 1
	};
}

async function attemptSmallFreeformRepair<T>(args: {
	callArgs: FreeFormCallArgs<T>;
	rawOutput: unknown;
	validationError: Error;
	previousCallId: Id<'llmCalls'>;
	attemptNumber: number;
}): Promise<
	| {
			success: true;
			llmCallId: Id<'llmCalls'>;
			output: T;
			rawText: string;
			nextAttemptNumber: number;
	  }
	| { success: false; llmCallId: Id<'llmCalls'>; error: Error; nextAttemptNumber: number }
> {
	const repairPrompt = buildFreeformRepairPrompt({
		rawOutput: typeof args.rawOutput === 'string' ? args.rawOutput : String(args.rawOutput),
		validationError: args.validationError,
		repairPromptSuffix: args.callArgs.repairPromptSuffix?.(args.validationError.message)
	});

	const { llmCallId, result } = await runSingleAttempt({
		...args.callArgs,
		prompt: repairPrompt,
		system: 'You repair malformed freeform text. You do not perform the original task again.',
		strategy: 'freeform_text',
		attemptNumber: args.attemptNumber,
		retryOfCallId: args.previousCallId,
		executor: () => executeFreeformRepairCall(args.callArgs, repairPrompt)
	});

	if (result.kind === 'cancelled') {
		await completeCall(args.callArgs.convex, {
			llmCallId,
			status: 'cancelled',
			strategyUsed: 'freeform_text',
			retryOfCallId: args.previousCallId,
			attemptNumber: args.attemptNumber,
			content: {
				systemPrompt:
					'You repair malformed freeform text. You do not perform the original task again.',
				userPrompt: repairPrompt,
				error: result.error
			}
		});

		throw result.error;
	}

	if (result.kind === 'failure') {
		await completeCall(args.callArgs.convex, {
			llmCallId,
			status: 'failed',
			retryOfCallId: args.previousCallId,
			attemptNumber: args.attemptNumber,
			content: {
				systemPrompt:
					'You repair malformed freeform text. You do not perform the original task again.',
				userPrompt: repairPrompt,
				error: result.error
			}
		});

		return {
			success: false,
			llmCallId,
			error: result.error,
			nextAttemptNumber: args.attemptNumber + 1
		};
	}

	const repaired = await validateOrNormalizeFreeformOutput(args.callArgs, result.outcome.rawText);

	if (!repaired.success) {
		await completeCall(args.callArgs.convex, {
			llmCallId,
			openRouterRequestId: result.outcome.openRouterRequestId ?? '',
			routedProvider: result.outcome.routedProvider,
			status: 'failed',
			completedAt: result.outcome.completedAt,
			costUsd: result.outcome.costUsd ?? 0,
			latencyMs: result.outcome.latencyMs,
			inputTokens: result.outcome.inputTokens ?? 0,
			outputTokens: result.outcome.outputTokens ?? 0,
			reasoningTokens: result.outcome.reasoningTokens ?? 0,
			cachedTokens: result.outcome.cachedTokens ?? 0,
			finishReason: result.outcome.finishReason ?? '',
			normalizationStatus: 'failed',
			normalizationError: repaired.normalizationError ?? 'AI repair did not match format',
			gatewayProvider: args.callArgs.gatewayProvider ?? 'openrouter',
			strategyUsed: 'freeform_text',
			loopNumber: args.callArgs.loopNumber,
			retryOfCallId: args.previousCallId,
			attemptNumber: args.attemptNumber,
			content: {
				systemPrompt:
					'You repair malformed freeform text. You do not perform the original task again.',
				userPrompt: repairPrompt,
				rawResponse: result.outcome.output,
				error: repaired.error
			}
		});

		await finalizeNormalization(args.callArgs.convex, {
			llmCallId,
			normalizationStatus: 'failed' as const,
			normalizationError: repaired.normalizationError ?? 'Output did not match resume format'
		});

		return {
			success: false,
			llmCallId,
			error: repaired.error,
			nextAttemptNumber: args.attemptNumber + 1
		};
	}

	await completeCall(args.callArgs.convex, {
		llmCallId,
		openRouterRequestId: result.outcome.openRouterRequestId ?? '',
		routedProvider: result.outcome.routedProvider,
		status: 'completed',
		completedAt: result.outcome.completedAt,
		costUsd: result.outcome.costUsd ?? 0,
		latencyMs: result.outcome.latencyMs,
		inputTokens: result.outcome.inputTokens ?? 0,
		outputTokens: result.outcome.outputTokens ?? 0,
		reasoningTokens: result.outcome.reasoningTokens ?? 0,
		cachedTokens: result.outcome.cachedTokens ?? 0,
		finishReason: result.outcome.finishReason ?? '',
		normalizationStatus: 'succeeded',
		gatewayProvider: args.callArgs.gatewayProvider ?? 'openrouter',
		strategyUsed: 'freeform_text',
		loopNumber: args.callArgs.loopNumber,
		retryOfCallId: args.previousCallId,
		attemptNumber: args.attemptNumber,
		content: {
			systemPrompt:
				'You repair malformed freeform text. You do not perform the original task again.',
			userPrompt: repairPrompt,
			rawResponse: result.outcome.rawText
			// wasAIRepaired: true,
			// wasLocallyNormalizedAfterRepair: repaired.wasNormalized
		}
	});

	await finalizeNormalization(args.callArgs.convex, {
		llmCallId,
		normalizationStatus: 'succeeded' as const
	});

	return {
		success: true,
		llmCallId,
		rawText: result.outcome.rawText,
		nextAttemptNumber: args.attemptNumber + 1,
		output: repaired.data
	};
}

async function updateCallStatus(
	convex: ConvexHttpClient,
	status: llmCallStatus,
	llmCallId: Id<'llmCalls'>
): Promise<void> {
	await convex.mutation(api.ai.index.updateAICall, { id: llmCallId, status });
}

async function completeCall(convex: ConvexHttpClient, args: CompleteLLMCallParams): Promise<void> {
	try {
		const { content } = args;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const error = content.error as any;
		let err;
		if (error instanceof Error) {
			err = error.toString();
		}
		const completeCallContent = {
			...content,
			structuredOutput: content.structuredOutput
				? typeof content.structuredOutput === 'string'
					? content.structuredOutput
					: JSON.stringify(content.structuredOutput)
				: '',
			rawResponse:
				content.rawResponse === undefined
					? ''
					: typeof content.rawResponse === 'string'
						? content.rawResponse
						: JSON.stringify(content.rawResponse),
			error: err ?? content.error
		};

		await convex.mutation(api.ai.index.completeAiCall, { ...args, content: completeCallContent });
	} catch (error) {
		console.log('Error completing LLM call:', error);
		throw error;
	}
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

function buildProviderOptions(requestParams: ModelRequestParameters) {
	// NOTE: the provider key must be lowercase `openrouter` - the AI SDK provider
	// only reads `providerOptions.openrouter`. `usage.include` turns on OpenRouter
	// usage accounting so the response carries the authoritative per-call cost.
	return {
		openrouter: {
			usage: { include: true },
			provider: {
				require_parameters: requestParams.routing?.requireParameters ?? true,
				order: requestParams.routing?.order
			}
		}
	};
}

interface OpenRouterCallMetadata {
	openrouter?: {
		provider?: string;
		usage?: OpenRouterUsageAccounting;
	};
	// some SDK builds surface the routed provider here instead
	provider?: { id?: string | number };
}

interface UsageCostExtract {
	inputTokens?: number;
	outputTokens?: number;
	reasoningTokens?: number;
	cachedTokens?: number;
	costUsd?: number;
	routedProvider?: string;
	openRouterRequestId?: string;
}

/**
 * Pulls accurate token usage and the real USD cost from an AI SDK result.
 *
 * Prefers OpenRouter's usage accounting (`providerMetadata.openrouter.usage`),
 * which reports the exact credits charged for the call (reflecting the routed
 * provider's real pricing and any cache discounts). Falls back to the generic
 * `result.usage` token counts when accounting is unavailable. `costUsd` is left
 * undefined when OpenRouter does not return a cost, so we never persist a guess.
 */
function extractUsageCost(result: {
	usage?: {
		inputTokens?: number;
		outputTokens?: number;
		reasoningTokens?: number;
		cachedInputTokens?: number;
	};
	providerMetadata?: unknown;
	response?: { id?: string };
}): UsageCostExtract {
	const metadata = result.providerMetadata as OpenRouterCallMetadata | undefined;
	const orUsage = metadata?.openrouter?.usage;

	const routedProvider =
		typeof metadata?.openrouter?.provider === 'string'
			? metadata.openrouter.provider
			: metadata?.provider?.id?.toString();

	return {
		inputTokens: orUsage?.promptTokens ?? result.usage?.inputTokens,
		outputTokens: orUsage?.completionTokens ?? result.usage?.outputTokens,
		reasoningTokens:
			orUsage?.completionTokensDetails?.reasoningTokens ?? result.usage?.reasoningTokens,
		cachedTokens: orUsage?.promptTokensDetails?.cachedTokens ?? result.usage?.cachedInputTokens,
		costUsd: typeof orUsage?.cost === 'number' ? orUsage.cost : undefined,
		routedProvider,
		openRouterRequestId: result.response?.id
	};
}

function isAbortError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	return error.name === 'AbortError' || error.message.toLowerCase().includes('aborted');
}

function parseJSONResponse(text: string): unknown {
	const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
	const source = fenceMatch?.[1] ?? text;
	try {
		return JSON.parse(source.trim());
	} catch {
		throw new Error(`Response is not valid JSON. first 200 chars: ${text.slice(0, 200)}`);
	}
}

function normalizeFinishReason(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

function normalizeReasoning(reasoning: unknown): string | undefined {
	if (typeof reasoning === 'string' && reasoning.length > 0) return reasoning;
	return undefined;
}

function toError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function backOffMs(attempt: number): number {
	return Math.min(1000 * 2 ** attempt, 8000);
}
