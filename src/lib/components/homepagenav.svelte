<script lang="ts">
	import { Show, SignInButton, UserButton } from 'svelte-clerk';
	import { buttonVariants } from '$lib/components/ui/button';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { LayoutDashboard } from '@lucide/svelte';

	// The dashboard has its own navigation; only offer the link outside it.
	const onLanding = $derived(page.url.pathname === '/');
</script>

<header class="pointer-events-auto absolute top-0 right-0 z-50 flex items-center gap-3 p-6">
	<Show when="signed-out">
		<SignInButton mode="modal" class={buttonVariants({ variant: 'default' }) + ' cursor-pointer'}
		></SignInButton>
	</Show>
	<Show when="signed-in">
		{#if onLanding}
			<a
				href={resolve('/dashboard')}
				class="{buttonVariants({ variant: 'outline' })} flex items-center gap-2"
			>
				<LayoutDashboard size={15} />
				Dashboard
			</a>
		{/if}
		<UserButton />
	</Show>
</header>
