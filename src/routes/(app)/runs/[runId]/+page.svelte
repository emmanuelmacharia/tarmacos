<script lang="ts">
	import { onMount } from 'svelte';
	import { useQuery } from 'convex-svelte';
	import type { PageProps } from './$types';
	let { params }: PageProps = $props();

	onMount(() => {
		resumeRun();
	});

	async function resumeRun() {
		// takes the run id and calls resume workflow
		const url = `/api/ai/runs/${params.runId}/resumeRun`;
		console.log(url);

		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ runId: params.runId })
		});

		const data = await response.json();

		console.log(data);
	}
</script>
