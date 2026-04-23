import type { Id } from '../../../../convex/_generated/dataModel';
import type { NormalizedCritiquePlan, NormalizedReviewResult } from './normalization';

export type NextInstruction =
	| {
			action: 'call_reviewer';
			artifactVersionId: Id<'artifactVersions'>;
			reviewKind: 'baseline_review' | 'draft_review';
	  }
	| {
			ation: 'call_writer';
			requestKind: 'initial_draft' | 'review_revision' | 'user_feedback_revision';
			reviewId: Id<'reviews'>;
			basedOnVersionId: Id<'artifactVersions'>;
			userMessageId?: Id<'messages'>;
	  }
	| {
			action: 'await_user';
	  }
	| {
			action: 'generate_export';
			artifactVersionId: Id<'artifactVersions'>;
	  }
	| { action: 'done' };

export type LLMCallRole = 'writer' | 'reviewer';

export type LLMCallPhase =
	| 'baseline_review'
	| 'drafting'
	| 'reviewing'
	| 'revision'
	| 'user_review'
	| 'finalizing';

export type OutputStrategy = 'native_structured' | 'prompted_json' | 'freeform_text';

export interface ModelRequestParameters {
	temperature: number;
	topP: number;
	maxOutputTokens?: number;
	seed?: number;
	stopSequences?: string[];
	responseFormat?: 'text' | 'json';
	reasoning?: {
		effort: 'low' | 'medium' | 'high';
	} | null;
	routing?: {
		order?: string[];
		requireParameters?: boolean;
	};
}

export interface AgentRoleConfig {
	modelSlug: string;
	gatewayProvider: string;
	systemPromptVersion: string;
	defaultRequestParameters: ModelRequestParameters;
}

export interface AgentConfig {
	reivewer: AgentRoleConfig;
	writer: AgentRoleConfig;
	maxIterations: number;
	maxRetriesPerCall: number;
	maxNormalizationRepairs: number;
}

export type operationKind =
	| 'baseline_review'
	| 'draft_generation'
	| 'draft_review'
	| 'draft_revision'
	| 'revision_review'
	| 'user_feedback_draft';

export type llmContentKind =
	| 'prompt'
	| 'raw_request'
	| 'response'
	| 'raw_response'
	| 'reasoning'
	| 'structured_output';

export type llmContentFormat = 'json' | 'text';

/**
 * Payload passed to convex for create llm call mutation ; we'll add llmContents to this
 */
export interface StartLLMCallParams {
	runId: Id<'runs'>;
	phase: LLMCallPhase;
	role: LLMCallRole;
	modelSlug: string;
	requestParams: ModelRequestParameters;
	requestedStrategy: OutputStrategy;
	attemptNumber: number;
	retryOfCallId?: Id<'llmCalls'>;
	loopNumber: number;
	operationKind: operationKind;
}

/**
 * Payload passed to modify llm call mutation after llm response
 */

export interface CompleteLLMCallParams {
	llmCallId: Id<'llmCalls'>;
	openRouterRequestid?: string;
	routedProvider?: string;
	status: 'completed' | 'failed' | 'cancelled';
	latencyMs?: number;
	inputTokens?: number;
	outputTokens?: number;
	reasoningTokens?: number;
	cachedTokens?: number;
	costUsd?: number;
	finishReason?: string;
	normalizationStatus?: 'pending' | 'succeeded' | 'failed';
	normalizationError?: string;
	completedAt?: number;
	attemptNumber: number;
	loopNumber?: number;
	retryOfCallId?: Id<'llmCalls'>;
	gatewayProvider?: string;
	strategyUsed?: OutputStrategy;
}

// content to be maintained in the llm call content table
export interface LLMCallContent {
	kind: llmContentKind;
	format: llmContentFormat;
	text?: string;
	json?: string;
	contentBytes?: number;
}

export interface ConvexClient {
	mutation<Args, Result>(fn: unknown, args: Args): Promise<Result>;
	query<Args, Result>(fn: unknown, args: Args): Promise<Result>;
}

export interface InstructionExecutionClaim {
	runId: Id<'runs'>;
	executionId: string;
	instruction: NextInstruction;
}

export interface ReviewerPlanContext {
	agent: AgentRoleConfig;
	jobDescription: string;
	baselineCv: string;
	jobInstructions: string;
	profileInstructions: string;
	loopNumber: number;
}

export interface ReviewerReviewContext {
	agent: AgentRoleConfig;
	jobDescription: string;
	baselineCv: string;
	jobInstructions: string;
	profileInstructions: string;
	critiquePlan: NormalizedCritiquePlan;
	currentDraftMarkdown: string;
	currentIteration: number;
	loopNumber: number;
}

export interface WriterContext {
	agent: AgentRoleConfig;
	jobDescription: string;
	baselineCv: string;
	jobInstructions: string;
	profileInstructions: string;
	critiquePlan: NormalizedCritiquePlan;
	requestKind: 'initial_draft' | 'review_revision' | 'user_feedback_revision';
	previousDraftMarkdown?: string;
	latestReview?: NormalizedReviewResult;
	latestUserFeedback?: string;
	currentIteration: number;
	loopNumber: number;
}
