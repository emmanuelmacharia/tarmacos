<script lang="ts">
	import { ArrowLeft, Network } from '@lucide/svelte';
	let { children } = $props();
	let showPreview = $state(false);
	let activeMobileTab = $state('chat');
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
		<div class="flex flex-1 flex-col overflow-y-auto p-3 pt-6 md:p-8 md:pt-10"></div>
		{@render children()}
	</div>
</div>
