<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { ClerkProvider } from 'svelte-clerk';
	import Homepagenav from '$lib/components/homepagenav.svelte';
	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<ClerkProvider>
	<main>
		<Homepagenav />
		{@render children()}
	</main>
</ClerkProvider>
