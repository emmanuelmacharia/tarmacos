<script lang="ts">
	import Button from '$lib/components/ui/button/button.svelte';
	import Paperclip from '$lib/icons/Paperclip.svelte';
	import Sparkles from '$lib/icons/Sparkles.svelte';
	import { useConvexClient } from 'convex-svelte';
	import { api } from '../convex/_generated/api.js';
	import { useClerkContext } from 'svelte-clerk';

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
			await convex.mutation(api.user.createUser.createUser, payload);
		})();
		syncedUser = user.id;
	});
</script>

<div
	class="relative flex min-h-screen flex-col items-center justify-center p-6 font-sans text-foreground"
>
	<div class="mx-auto flex w-full max-w-3xl flex-col items-center">
		<h1 class="mb-10 text-center text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
			What role are we targetting today?
		</h1>
		<div
			class="relative w-full rounded-2xl border border-primary/30 bg-background shadow-lg transition-colors focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 hover:border-border"
		>
			<textarea
				rows="2"
				class="w-full resize-none bg-transparent p-4 text-lg leading-relaxed outline-none placeholder:text-muted-foreground/50 md:text-xl"
				placeholder="Paste a Job description of the role..."
			></textarea>
			<div class="mt-2 flex items-center justify-between p-2">
				<div
					class="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted/50 hover:text-foreground"
				>
					<Paperclip size={18} />
					<span>Attach Baseline Resume</span>
				</div>
				<Button class="flex gap-4">
					<Sparkles size={18} />
					Tailor resume
				</Button>
			</div>
		</div>
		<div class="mt-10 items-center justify-center sm:gap-2 md:gap-4">
			<button
				class="my-2 cursor-pointer rounded-full border border-primary/30 bg-background px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-muted/50"
				>Frontend Engineer at Stripe</button
			>
			<button
				class="my-2 cursor-pointer rounded-full border border-primary/30 bg-background px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-muted/50"
				>Product Designer at Apple</button
			>
			<button
				class="my-2 cursor-pointer rounded-full border border-primary/30 bg-background px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-muted/50"
				>Project Manager at Microsoft</button
			>
			<button
				class="my-2 cursor-pointer rounded-full border border-primary/30 bg-background px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-muted/50 md:hidden"
				>Data analyst at Amazon</button
			>
		</div>
	</div>
</div>
