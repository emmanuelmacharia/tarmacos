<script lang="ts">
	import '../../layout.css';
	import Dashboardnav from '$lib/components/dashboardnav.svelte';
	let { children } = $props();
</script>

<main class="min-h-screen bg-transparent font-sans text-foreground">
	<div class="flex min-h-screen flex-col md:flex-row">
		<Dashboardnav />
		<div class="flex flex-1">
			<div class="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-10">
				{@render children()}
			</div>
		</div>
	</div>
</main>
