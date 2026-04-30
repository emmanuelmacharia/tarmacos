export function buildPromptText(systemPrompt?: string, userPrompt?: string): string | undefined {
	const parts = [
		systemPrompt ? `SYSTEM:\n${systemPrompt}` : '',
		userPrompt ? `USER:\n${userPrompt}` : ''
	].filter(Boolean);

	return parts.length > 0 ? parts.join('\n\n') : undefined;
}

export function byteLength(value: string): number {
	return new TextEncoder().encode(value).length;
}
