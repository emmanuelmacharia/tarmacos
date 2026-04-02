import type { Role } from '$lib/data/models';

type ModelPolicy = {
	enabled: boolean;
	roles: Role[];
	supportsStructuredOutput: boolean;
};

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
	}
};

export function assertModelAllowedForRole(
	modelId: string,
	role: Role,
	options?: { requiredStructuredOutput?: boolean }
): void {
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
