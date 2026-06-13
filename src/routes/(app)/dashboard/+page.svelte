<script lang="ts">
	import { browser } from '$app/environment';
	import MainPrompt from '$lib/components/main-prompt.svelte';
	import { getProfileState } from '$lib/context/profile-state';
	import { startRun, type PromptSubmission } from '$lib/utils/startRun';
	import { clearPromptDraft, loadPromptDraft } from '$lib/utils/promptDraft';

	const profileState = getProfileState();

	let activeUserProfile = $derived(profileState.activeUserProfile);

	// Restore anything the visitor typed before being sent through sign-in,
	// then clear it — the textarea owns the text from here on.
	const draft = browser ? loadPromptDraft() : null;
	if (draft) clearPromptDraft();

	async function handleSubmit(data: PromptSubmission) {
		await startRun(data, activeUserProfile?._id);
	}
</script>

<div class="flex min-h-full flex-col justify-center">
	<MainPrompt
		onsubmit={handleSubmit}
		initialJobDescription={draft?.jobDescription ?? ''}
		initialInstructions={draft?.jobInstructions ?? ''}
	/>
</div>
