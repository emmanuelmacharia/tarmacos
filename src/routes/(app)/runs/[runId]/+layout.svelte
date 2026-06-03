<script lang="ts">
	import MesssageBubble from '$lib/components/messsage-bubble.svelte';
	import { ArrowLeft, LoaderCircle, Network } from '@lucide/svelte';
	import { useQuery } from 'convex-svelte';
	// import { fade, fly, slide } from 'svelte/transition';
	import { api } from '../../../../convex/_generated/api';
	import type { Doc, Id } from '../../../../convex/_generated/dataModel';
	import { fade } from 'svelte/transition';
	let chatContainer;
	let showPreview = $state(false);
	let activeMobileTab = $state('chat');
	let { children, params } = $props();

	const runId = $state<Id<'runs'>>(params.runId as Id<'runs'>);

	const messageFetch = useQuery(api.messages.index.getMessagesByRunId, { runId });

	const runFetch = useQuery(api.runs.index.getRun, { runId });

	const messages: Doc<'messages'>[] | undefined = $derived(messageFetch.data);

	const run: Doc<'runs'> = $derived(runFetch.data?.data.run);

	const modelAuthor = $derived.by(() => {
		const modelConfig = run.agentConfig;
		return {
			writer: {
				model: modelConfig.writer.modelSlug,
				role: 'writer' as const
			},
			reviewer: {
				model: modelConfig.reviewer.modelSlug,
				role: 'reviewer' as const
			}
		};
	});
</script>

<div
	class="relative flex h-dvh w-full flex-col overflow-hidden bg-transparent font-sans text-foreground md:flex-row"
>
	<div
		class="flex shrink-0 flex-col bg-transparent transition-all duration-700 ease-out {showPreview
			? `z-10 border-border/80 md:w-[40vw] md:max-w-md md:border-r lg:w-[35vw] ${activeMobileTab === 'chat' ? 'flex w-full' : 'hidden md:flex'}`
			: 'mx-auto flex w-full max-w-4xl shadow-[0_0_100px_rgba(0,0,0,0.02)]'} relative"
	>
		<div
			class="z-10 flex h-14 shrink-0 items-center border-b border-border bg-transparent px-4 md:h-16 md:px-6"
		>
			<div
				class="flex items-center gap-2 rounded px-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
			>
				<ArrowLeft size={16} aria-hidden="true" /> Dashboard
			</div>
			{#if !showPreview}
				<div class="flex flex-1 justify-center gap-2 text-center text-sm font-medium text-primary">
					<Network size={16} aria-hidden="true" /> Workflow execution
				</div>
			{/if}
		</div>

		{#if showPreview}
			<!-- Mobile tab bar view -->
			<div
				class="z-30 flex w-full shrink-0 border-b border-border/60 bg-background p-2 shadow-sm md:hidden"
			>
				<div class="flex w-full gap-2 rounded-lg border border-border/40 bg-background/20 p-1">
					<button
						onclick={() => (activeMobileTab = 'chat')}
						class="flex-1 rounded-md border border-transparent py-1.5 text-xs font-semibold shadow-sm transition-all {activeMobileTab ===
						'chat'
							? 'border-border/50 bg-primary text-background'
							: 'text-muted-foreground shadow-none hover:text-foreground'}"
						aria-pressed={activeMobileTab === 'chat'}>Workflow</button
					>
					<button
						onclick={() => (activeMobileTab = 'preview')}
						class="flex-1 rounded-md border border-transparent py-1.5 text-xs font-semibold shadow-sm transition-all {activeMobileTab ===
						'preview'
							? 'border-border/50 bg-primary text-background'
							: 'text-muted-foreground shadow-none hover:text-foreground'}"
						aria-pressed={activeMobileTab === 'preview'}>Artifact</button
					>
				</div>
			</div>
		{/if}

		<!-- chat -->
		<div
			class="flex flex-1 flex-col overflow-y-auto p-3 pt-6 md:p-8 md:pt-10"
			bind:this={chatContainer}
		>
			<div class="relative mx-auto w-full space-y-6 md:max-w-2xl md:space-y-8">
				{#each messages as message (message._id)}
					<MesssageBubble
						{message}
						authors={message.authorRole === 'writer'
							? { model: modelAuthor.writer.model, role: modelAuthor.writer.role }
							: { model: modelAuthor.reviewer.model, role: modelAuthor.reviewer.role }}
					/>
				{/each}
				<!-- loader -->
				<div class="flex w-full justify-start" in:fade={{ duration: 200 }}>
					<div
						class="z-10 mr-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-[3px] border-border bg-background md:h-8 md:w-8"
					>
						<LoaderCircle size={12} class="animate-spin text-muted-foreground" aria-hidden="true" />
					</div>
					<div class="flex h-7 items-center md:h-8">
						<div
							class="animate-pulse text-[10px] font-medium tracking-widest text-muted-foreground uppercase md:text-xs"
						>
							Running process...
						</div>
					</div>
				</div>
			</div>
		</div>
		{@render children()}
	</div>
</div>
