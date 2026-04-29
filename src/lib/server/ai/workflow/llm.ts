import type { ConvexHttpClient } from 'convex/browser';
import type { Id } from '../../../../convex/_generated/dataModel';
import type {
	CompleteLLMCallParams,
	LLMCallPhase,
	LLMCallRole,
	ModelRequestParameters,
	operationKind,
	OutputStrategy
} from './types';
import type z from 'zod';
import { api } from '../../../../convex/_generated/api';
import { getChatModel } from '../openrouter';
import { generateText, Output } from 'ai';

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

			if (result.kind === 'success') {
				const validated = args.schema.safeParse(result.outcome.output);
				if (!validated.success) {
					// treat as failure - record and continue the retry chain
					/**
					 * This is a validation failure; meaning we have the tokens already -
					 * 	Can't we use normalization to try and get the malformed response into the valid schema?
					 * 	e.g one of the errors we saw, was that the count of block reasons was higher than what was in the zod schema. I don't think that should cause another retry
					 */
					await completeCall(args.convex, {
						llmCallId,
						openRouterRequestid: result.outcome.openRouterRequestId ?? '',
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
						normalizationStatus: 'succeeded',
						normalizationError: validated.success ? undefined : 'Output did not match schema',
						gatewayProvider: args.gatewayProvider ?? 'openrouter',
						strategyUsed: strategy,
						loopNumber: args.loopNumber,
						retryOfCallId: previousCallId,
						attemptNumber
					});

					lastError = new Error(validated.error.message);
					previousCallId = llmCallId;
					attemptNumber++;
					if (retry < args.maxRetries - 1) await sleep(backOffMs(retry));
				}

				await completeCall(args.convex, {
					llmCallId,
					openRouterRequestid: result.outcome.openRouterRequestId ?? '',
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
					attemptNumber
				});

				return {
					llmCallId,
					output: validated.data!,
					strategy,
					rawText: result.outcome.rawText,
					nextAttemptNumber: attemptNumber + 1
				};
			}
			if (result.kind === 'cancelled') {
				// if cancelled, end the chain immediately - we don't want to keep retrying if the user has cancelled
				await completeCall(args.convex, {
					llmCallId,
					status: 'cancelled',
					loopNumber: retry,
					retryOfCallId: previousCallId,
					attemptNumber
				});
				throw result.error;
			}
			await completeCall(args.convex, {
				llmCallId,
				status: 'failed',
				strategyUsed: strategy,
				loopNumber: retry,
				retryOfCallId: previousCallId,
				latencyMs: result.latencyMs,
				attemptNumber
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

export async function callFreeform(args: BaseCallArgs): Promise<LLMCallResult<string>> {
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

		if (result.kind === 'success') {
			const rawText = result.outcome.rawText.trim();
			await completeCall(args.convex, {
				llmCallId,
				status: 'completed',
				openRouterRequestid: result.outcome.openRouterRequestId ?? '',
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
				attemptNumber
			});

			return {
				llmCallId,
				output: rawText,
				strategy: 'freeform_text',
				rawText,
				nextAttemptNumber: attemptNumber + 1
			};
		}

		if (result.kind === 'cancelled') {
			await completeCall(args.convex, {
				llmCallId,
				status: 'cancelled',
				strategyUsed: 'freeform_text',
				loopNumber: retry,
				retryOfCallId: previousCallId,
				attemptNumber
			});
			throw result.error;
		}

		await completeCall(args.convex, {
			llmCallId,
			status: 'failed',
			strategyUsed: 'freeform_text',
			loopNumber: retry,
			retryOfCallId: previousCallId,
			latencyMs: result.latencyMs,
			attemptNumber
		});

		lastError = result.error;
		previousCallId = llmCallId;
		attemptNumber += 1;

		if (retry < args.maxRetries - 1) await sleep(backOffMs(retry));
	}

	throw new Error(
		`Writer call failed after ${args.maxRetries} attempts. Last error: ${lastError?.message}`
	);
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
			providerOptions: buildProviderOptions(args.requestParams)
		});

		console.log('raw response result', result);

		return {
			latencyMs: Date.now() - startedAt,
			inputTokens: result.usage?.inputTokens,
			outputTokens: result.usage?.outputTokens,
			reasoningTokens: result.usage?.reasoningTokens,
			cachedTokens: result.usage?.cachedInputTokens,
			finishReason: result.finishReason,
			rawText: JSON.stringify(result.output),
			output: result.output,
			reasoning: normalizeReasoning(result.reasoning),
			openRouterRequestId: result.response.id,
			routedProvider: result.providerMetadata?.provider.id?.toString(),
			strategyUsed: 'native_structured',
			status: 'completed',
			completedAt: Date.now(),
			costUsd: result.usage.totalTokens // calculate cost from result response - I think it's there
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
		providerOptions: buildProviderOptions(args.requestParams)
	});

	const parsed = parseJSONResponse(result.text);

	return {
		latencyMs: Date.now() - startedAt,
		inputTokens: result.usage?.inputTokens,
		outputTokens: result.usage?.outputTokens,
		reasoningTokens: result.usage?.reasoningTokens,
		cachedTokens: result.usage?.cachedInputTokens,
		finishReason: result.finishReason,
		rawText: JSON.stringify(parsed),
		output: parsed,
		status: 'completed',
		completedAt: Date.now(),
		reasoning: normalizeReasoning(result.reasoning)
	};
}

async function executeFreeformCall(args: BaseCallArgs): Promise<AttemptOutcome> {
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
		providerOptions: buildProviderOptions(args.requestParams)
	});

	return {
		latencyMs: Date.now() - startedAt,
		inputTokens: result.usage?.inputTokens,
		outputTokens: result.usage?.outputTokens,
		reasoningTokens: result.usage?.reasoningTokens,
		cachedTokens: result.usage?.cachedInputTokens,
		finishReason: normalizeFinishReason(result.finishReason),
		rawText: result.text,
		output: result.text,
		reasoning: normalizeReasoning(result.reasoning),
		status: 'completed',
		completedAt: Date.now()
	};
}

async function completeCall(convex: ConvexHttpClient, args: CompleteLLMCallParams): Promise<void> {
	try {
		await convex.mutation(api.ai.index.modifyAiCall, args);
	} catch (error) {
		console.log('Error completing LLM call:', error);
		throw error;
	}
}

function buildProviderOptions(requestParams: ModelRequestParameters) {
	return {
		openRouter: {
			provider: {
				require_parameters: requestParams.routing?.requireParameters ?? true,
				order: requestParams.routing?.order
			}
		}
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
	return Math.min(1000 & (2 ** attempt), 8000);
}
