<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { ClerkProvider } from 'svelte-clerk';
	import Homepagenav from '$lib/components/homepagenav.svelte';
	import { PUBLIC_CONVEX_URL } from '$env/static/public';
	import { setupConvex } from 'convex-svelte';
	import ConvexClerkProvider from '$lib/providers/ConvexClerkProvider.svelte';
	import { Toaster } from '$lib/components/ui/sonner/index.js';

	setupConvex(PUBLIC_CONVEX_URL);
	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<Toaster />
<ClerkProvider>
	<ConvexClerkProvider />
	<main>
		<Homepagenav />
		{@render children()}
	</main>
</ClerkProvider>
