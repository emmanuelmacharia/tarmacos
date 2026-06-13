// Holds the visitor's prompt while they round-trip through Clerk's sign-in flow,
// so we can restore it when they land on the dashboard.

const DRAFT_KEY = 'tarmac:prompt-draft';
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export type PromptDraft = {
	jobDescription: string;
	jobInstructions: string;
	savedAt: number;
};

export function savePromptDraft(draft: Omit<PromptDraft, 'savedAt'>) {
	if (!draft.jobDescription.trim() && !draft.jobInstructions.trim()) return;
	try {
		localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, savedAt: Date.now() }));
	} catch (error) {
		console.error('failed to save prompt draft', error);
	}
}

export function loadPromptDraft(): PromptDraft | null {
	try {
		const raw = localStorage.getItem(DRAFT_KEY);
		if (!raw) return null;

		const draft = JSON.parse(raw) as PromptDraft;
		if (
			typeof draft?.jobDescription !== 'string' ||
			typeof draft?.savedAt !== 'number' ||
			Date.now() - draft.savedAt > DRAFT_TTL_MS
		) {
			clearPromptDraft();
			return null;
		}
		return { ...draft, jobInstructions: draft.jobInstructions ?? '' };
	} catch (error) {
		console.error('failed to load prompt draft', error);
		return null;
	}
}

export function clearPromptDraft() {
	try {
		localStorage.removeItem(DRAFT_KEY);
	} catch {
		// storage unavailable; nothing to clear
	}
}
