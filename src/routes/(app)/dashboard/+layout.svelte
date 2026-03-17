<script lang="ts">
	import '../../layout.css';
	import Dashboardnav from '$lib/components/dashboardnav.svelte';
	let { children } = $props();
</script>

<main>
	<Dashboardnav />
	{@render children()}
</main>
