import type { Role } from '$lib/data/models';

type ModelPolicy = {
	enabled: boolean;
	roles: Role[];
	supportsStructuredOutput: boolean;
};

export const PROFILE_INFERENCE_MODEL = {
	slug: 'openai/gpt-oss-120b'
};

export const DEFAULT_MAX_ITERATIONS = 3;

export const DEFAULT_ALLOW_ALL_MODELS = true;

export const DEFAULT_MODELS = {
	writer: 'openai/gpt-oss-120b',
	reviewer: 'openai/gpt-oss-120b'
};

export const DEFAULT_MAX_RETRIES = 1;

export const MODEL_POLICY: Record<string, ModelPolicy> = {
	'minimax/minimax-m2.5:free': {
		enabled: true,
		roles: ['writer', 'reviewer'],
		supportsStructuredOutput: true
	},
	'qwen/qwen3.6-plus-preview:free': {
		enabled: true,
		roles: ['writer', 'reviewer'],
		supportsStructuredOutput: true
	},
	'openai/gpt-oss-120b': {
		enabled: true,
		roles: ['writer', 'reviewer'],
		supportsStructuredOutput: true
	},
	'minimax/minimax-m2.5': {
		enabled: true,
		roles: ['writer', 'reviewer'],
		supportsStructuredOutput: true
	},
	'Anthropic/Claude Sonnet 4.6': {
		enabled: true,
		roles: ['writer', 'reviewer'],
		supportsStructuredOutput: true
	},
	'openai/gpt-5.4-mini': {
		enabled: true,
		roles: ['writer', 'reviewer'],
		supportsStructuredOutput: true
	},
	'moonshotai/kimi-k2.5': {
		enabled: true,
		roles: ['writer', 'reviewer'],
		supportsStructuredOutput: true
	}
};

export function assertModelAllowedForRole(
	modelId: string,
	role: Role,
	options?: { requiredStructuredOutput?: boolean }
): void {
	// TODO: REMOVE BYPASS
	if (DEFAULT_ALLOW_ALL_MODELS) {
		console.warn('Model policy checks are bypassed due to DEFAULT_ALLOW_ALL_MODELS being true');
		return;
	}
	const policy = MODEL_POLICY[modelId];

	if (!policy || !policy.enabled) {
		throw new Error(`Model not allowed ${modelId}`);
	}

	if (!policy.roles.includes(role)) {
		throw new Error(`Model ${modelId} is not allowed for role: ${role}`);
	}

	if (options?.requiredStructuredOutput && policy.supportsStructuredOutput == false) {
		throw new Error(`Model ${modelId} is not allowed for structured output workflows`);
	}
}
