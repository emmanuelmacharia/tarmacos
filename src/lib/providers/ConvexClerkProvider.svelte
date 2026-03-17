<script lang="ts">
	import { useConvexClient } from 'convex-svelte';
	import { useClerkContext } from 'svelte-clerk';

	const convex = useConvexClient();
	const clerk = useClerkContext();

	const session = $derived(clerk.session);

	async function getConvexToken() {
		return (await session?.getToken({ template: 'convex' })) ?? null;
	}

	$effect(() => {
		if (!convex) return;
		convex.setAuth(async () => {
			return await getConvexToken();
		});
	});
</script>
