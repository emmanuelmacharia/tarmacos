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
		const payload = {
			email: user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress,
			imageUrl: user.imageUrl ?? undefined,
			fullName: user.fullName ?? `${user.firstName} ${user.lastName}`
		};

		void (async () => {
			try {
				await convex.mutation(api.user.createUser.createUser, payload);
				syncedUser = user.id;
			} catch (err) {
				// we'll add helers for user management
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
