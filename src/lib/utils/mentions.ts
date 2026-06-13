/**
 * Agents the user can address directly from the run chat composer. Must stay in
 * sync with the mention routing in `routes/api/ai/runs/[runId]/messages/+server.ts`:
 * '@reviewer' requests a review, everything else routes to the writer.
 */
export type MentionAgent = {
	id: 'writer' | 'reviewer';
	label: string;
	description: string;
};

export const MENTION_AGENTS: MentionAgent[] = [
	{ id: 'writer', label: '@writer', description: 'Revises the draft with your feedback' },
	{ id: 'reviewer', label: '@reviewer', description: 'Reviews the latest draft' }
];

const agentAlternation = MENTION_AGENTS.map((agent) => agent.id).join('|');

/** Matches supported mentions only when they start a word, mirroring the API's routing regex. */
export const MENTION_PATTERN = new RegExp(`(^|\\s)(@(?:${agentAlternation}))\\b`, 'gi');

export type MentionSegment = { text: string; isMention: boolean };

/** Splits text into plain and mention segments for rendering highlights. */
export function tokenizeMentions(text: string): MentionSegment[] {
	const segments: MentionSegment[] = [];
	let lastIndex = 0;
	for (const match of text.matchAll(MENTION_PATTERN)) {
		const mentionStart = match.index + match[1].length;
		if (mentionStart > lastIndex) {
			segments.push({ text: text.slice(lastIndex, mentionStart), isMention: false });
		}
		segments.push({ text: match[2], isMention: true });
		lastIndex = mentionStart + match[2].length;
	}
	if (lastIndex < text.length) {
		segments.push({ text: text.slice(lastIndex), isMention: false });
	}
	return segments;
}

/**
 * Returns the in-progress mention the caret is sitting in (e.g. '@wri|'), or
 * null when the caret isn't inside one. `start` is the index of the '@'.
 */
export function getActiveMentionQuery(
	text: string,
	caret: number
): { query: string; start: number } | null {
	const upToCaret = text.slice(0, caret);
	const match = /(^|\s)@([a-zA-Z]*)$/.exec(upToCaret);
	if (!match) return null;
	return { query: match[2], start: upToCaret.length - match[2].length - 1 };
}

export function filterMentionAgents(query: string): MentionAgent[] {
	const lowered = query.toLowerCase();
	return MENTION_AGENTS.filter((agent) => agent.id.startsWith(lowered));
}
