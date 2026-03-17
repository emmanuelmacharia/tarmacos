<script lang="ts">
	import { useConvexClient } from 'convex-svelte';
	import { api } from '../convex/_generated/api.js';
	import { useClerkContext } from 'svelte-clerk';
	import MainPrompt from '$lib/components/main-prompt.svelte';

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
				await convex.mutation(api.user.createUser.createUser, {});
				syncedUser = user.id;
			} catch (err) {
				// we'll add helpers for error handling
				console.log(err)
			}
		})();
	});
</script>

<div
	class="relative flex min-h-screen flex-col items-center justify-center p-6 font-sans text-foreground"
>
	<MainPrompt />
</div>
