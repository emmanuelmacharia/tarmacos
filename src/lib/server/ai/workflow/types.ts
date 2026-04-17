import type { Id } from '../../../../convex/_generated/dataModel';

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
	| 'draft_generation'
	| 'reviewing'
	| 'revision'
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
