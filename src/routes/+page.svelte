<script lang="ts">
	import { useConvexClient } from 'convex-svelte';
	import { api } from '../convex/_generated/api.js';
	import { useClerkContext } from 'svelte-clerk';
	import MainPrompt, { type AttachedFile } from '$lib/components/main-prompt.svelte';
	import type { Role, SelectedModel } from '$lib/data/models.js';

	const clerk = useClerkContext();
	const convex = useConvexClient();

	const session = $derived(clerk.session);
	const user = $derived(clerk.user);
	let syncedUser = $state<string | null>(null);

	$effect(() => {
		if (!session || !user?.id) return;
		if (syncedUser === user.id) return;
		void (async () => {
			try {
				await convex.mutation(api.user.user.createUser, {});
				syncedUser = user.id;
			} catch (err) {
				// we'll add helpers for error handling
				console.log(err);
			}
		})();
	});

	function handleSubmit(data: {
		jobDescription: string;
		jobInstructions: string;
		models: Record<Role, SelectedModel>;
		resume: AttachedFile;
		supportingDocuments: AttachedFile[];
	}) {
		console.log('in the parent ===>', data);

		/**
		 * check user is logged in first
		 * If they arent - store this data in session storage
		 * Once they log in - take them to the dashboard
		 * Retrieve the data from the dashboard, and call the endpoint from /dashboard
		 * */
	}
</script>

<div
	class="relative flex min-h-screen flex-col items-center justify-center p-6 font-sans text-foreground"
>
	<MainPrompt onsubmit={handleSubmit} />
</div>
