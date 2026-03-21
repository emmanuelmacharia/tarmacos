<script lang="ts">
	import { Eye, Globe, Lightbulb, Pen } from '@lucide/svelte';

	type Model = {
		provider: string;
		name: string;
		properties: string[];
		tools: string[];
	};

	type ModelConfig = {
		search: {
			available: boolean;
			use: boolean;
			calibration: string;
		};
		thinking: {
			available: boolean;
			use: boolean;
			calibration: 'High' | 'Medium' | 'Low';
		};
	};

	type SelectedModel = Model & ModelConfig;

	let isOpen = $state(false);
	let triggerRef: HTMLButtonElement | null = null;
	let activeTab: 'writer' | 'reviewer' | null = $state(null);
	let selectedWriterModel = $state<SelectedModel | null>(null);
	let selectedReviewermodel = $state<SelectedModel | null>(null);

	function toggleOpen() {
		isOpen = !isOpen;
	}
</script>

<div class="relative flex items-center">
	<button
		class="hover:ng-background/90 group flex cursor-pointer items-center gap-2 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-xs font-medium transition hover:border-border sm:py-2 sm:text-sm {isOpen &&
			'bg-background-secondary/90'}"
		type="button"
		title="select mdoel"
		onclick={toggleOpen}
		bind:this={triggerRef}
	>
		<div class="flex items-center gap-1.5 opacity-80 transition-opacity group-hover:opacity-100">
			<Pen size={14} class={isOpen && activeTab === 'writer' ? 'text-primary' : 'text-blue-500'} />
			<span class="hidden font-normal text-muted-foreground md:inline">Writer:</span>
			<div class="flex items-center gap-1">
				<span class="max-w-22.5 truncate font-semibold text-foreground"
					>{selectedWriterModel?.name}</span
				>
				{#if selectedWriterModel?.search}
					<div class="ml-1 flex -space-x-1 opacity-70">
						{#if selectedWriterModel.search.use}
							<div
								class="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-background bg-blue-500/20 text-blue-500"
							>
								<Globe size={8} />
							</div>
						{/if}
						{#if selectedWriterModel.thinking.use}
							<div
								class="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-background bg-amber-500/20 text-amber-500"
							>
								<Lightbulb size={8} />
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>
		<div class="hidden h-4 w-px bg-border/50 md:block"></div>
		<div class="flex items-center gap-1.5 opacity-80 transition-opacity group-hover:opacity-100">
			<Eye
				size={14}
				class={isOpen && activeTab === 'reviewer' ? 'text-primary' : 'text-purple-500'}
			/>
			<span class="hidden font-normal text-muted-foreground md:inline">Reviewer:</span>
			<div class="flex items-center gap-1">
				<span class="max-w-22.5 truncate font-semibold text-foreground"
					>{selectedReviewermodel?.name}</span
				>
				{#if selectedReviewermodel?.search}
					<div class="ml-1 flex -space-x-1 opacity-70">
						{#if selectedReviewermodel.search.use}
							<div
								class="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-background bg-blue-500/20 text-blue-500"
							>
								<Globe size={8} />
							</div>
						{/if}
						{#if selectedReviewermodel.thinking.use}
							<div
								class="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-background bg-amber-500/20 text-amber-500"
							>
								<Lightbulb size={8} />
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	</button>
</div>
