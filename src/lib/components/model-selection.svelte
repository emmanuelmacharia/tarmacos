<script lang="ts">
	import {
		Box,
		Eye,
		Funnel,
		Globe,
		Ellipsis,
		Pen,
		Search,
		Star,
		ChevronLeft,
		Brain
	} from '@lucide/svelte';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import PopoverContent from './ui/popover/popover-content.svelte';
	import Badge from './ui/badge/badge.svelte';
	import Switch from './ui/switch/switch.svelte';
	import Label from './ui/label/label.svelte';
	import * as Select from './ui/select/index';
	import { SvelteMap } from 'svelte/reactivity';
	import type {
		Role,
		ModelConfig,
		SelectedModel,
		AIModel,
		ModelsAndProviders,
		Props
	} from '$lib/data/models';

	// consts
	const DEFAULT_MODEL_CONFIG: ModelConfig = {
		config: {
			reasoning: false,
			reasoningEffort: 'None',
			search: false
		}
	};

	const REASONING_EFFORT = ['None', 'Low', 'Medium', 'High'] as const;

	// methods
	function handleOpenChange(isOpen: boolean) {
		if (!isOpen) {
			activeTab = 'writer';
			openModelSettings = false;
		}
	}

	function setCategory(categoryId: string) {
		activeCategory = activeCategory === categoryId ? 'all' : categoryId;
	}

	function onOpenSettings() {
		openModelSettings = !openModelSettings;
	}

	function getModelById(id: string | null) {
		if (!id) return null;
		return modelById.get(id) ?? null;
	}

	function supportsReasoning(details: AIModel | null) {
		return !!details?.supported_parameters?.some((features) =>
			features.toLowerCase().includes('reasoning')
		);
	}

	function supportsSearch(details: AIModel | null) {
		return !!details?.pricing?.web_search;
	}

	function normalizeModelConfig(
		details: AIModel | null,
		current: Partial<ModelConfig['config']> = {}
	): ModelConfig {
		/**
		 * Takes:
		 *
		 * 	modelDetails: the full details of that selected model
		 * 	current calibrations entered
		 *
		 * sets the modelConfig and always returns a fully typesafe config
		 */
		if (!details) return DEFAULT_MODEL_CONFIG;
		const reasoningSupported = supportsReasoning(details);
		const searchSupported = supportsSearch(details);

		const currentConfig: Partial<ModelConfig['config']> = current ?? {};

		const reasoning = reasoningSupported ? (currentConfig.reasoning ?? false) : false;

		return {
			config: {
				search: searchSupported ? (currentConfig.search ?? false) : false,
				reasoning,
				reasoningEffort: reasoningSupported
					? reasoning
						? (currentConfig.reasoningEffort ?? 'None')
						: 'None'
					: 'None'
			}
		};
	}

	function selectModel(role: Role, modelId: string, modelDetails: AIModel, activeCategory: string) {
		/**
		 * Takes:
		 * 	role - 'writer' | 'reviewer', modelId: 'the selected model id (e.g. openai/gpt-5.4-nano)'
		 * 	modelDetails: the full details of that selected model
		 * 	activeCategory: the provider from which that model is created from
		 *
		 * sets the modelConfig and maintains it on `selections`
		 */

		selections[role].id = modelId;
		selections[role].name = modelDetails.name;
		selections[role].provider = activeCategory;
		selections[role].config = normalizeModelConfig(modelDetails, selections[role].config).config;
	}

	function setReasoning(role: Role, enabled: boolean) {
		const modelDetails = getModelById(selections[role].id);
		if (!supportsReasoning(modelDetails)) return;
		selections[role].config.reasoning = enabled;
	}

	function setSearch(role: Role, enabled: boolean) {
		const modelDetails = getModelById(selections[role].id);
		if (!supportsSearch(modelDetails)) return;
		selections[role].config.search = enabled;
	}

	function setReasoningEffort(role: Role, effort: 'High' | 'Medium' | 'Low' | 'None') {
		const modelDetails = getModelById(selections[role].id);
		if (!supportsReasoning(modelDetails)) return;
		selections[role].config.reasoningEffort = effort;
	}

	// state
	let activeTab: Role = $state('writer');
	let openModelSettings = $state(false);
	let searchModel = $state('');

	let { providers, models, modelSelections = $bindable() }: Props = $props();

	let modelAndProvidersFullList = $derived.by(() => {
		const aiModels = models;
		const aiProviders = providers;
		/**
		 * iterate through providers
		 * find models using the slug for each provider
		 * create a new array of models and providers grouped correctly; where each provider, has multiple models the provider has released
		 * We should also enhance this to make sure that we also find the provider icons for each provider.
		 * i think you can use reduce for this
		 */
		return aiProviders.map((provider) => {
			const providerModels: ModelsAndProviders = {
				...provider,
				models: aiModels.filter((model) => {
					const slug = provider.slug;
					const id = model.id;
					return id.split('/')[0] === slug;
				})
			};
			return providerModels;
		});
	});

	let curatedModelsAndProviders = $derived.by(() => {
		const fullSearchList = modelAndProvidersFullList.filter((p) => p.models.length > 0);

		if (!searchModel) {
			return fullSearchList;
		}

		const term = searchModel.toLowerCase();

		const searchFilter = fullSearchList
			.map((provider) => ({
				...provider,
				models: provider.models.filter(
					(model) =>
						model.name.toLowerCase().includes(term) || model.id.toLowerCase().includes(term)
				)
			}))
			.filter((provider) => provider.models.length > 0);
		return searchFilter;
	});

	let activeCategory = $derived(curatedModelsAndProviders[0]?.slug ?? null);

	$effect(() => handleOpenChange(isOpen));

	let isOpen = $state(false);

	let selections = $state<Record<Role, SelectedModel>>({
		writer: {
			name: null,
			provider: null,
			id: null,
			config: { ...DEFAULT_MODEL_CONFIG.config }
		},
		reviewer: {
			name: null,
			provider: null,
			id: null,
			config: { ...DEFAULT_MODEL_CONFIG.config }
		}
	});

	let modelById = $derived.by(() => {
		const lookup = new SvelteMap<string, AIModel>();
		for (const model of models) {
			lookup.set(model.id, model);
		}
		return lookup;
	});

	let activeSelection = $derived(selections[activeTab]);
	let activeModel = $derived(getModelById(activeSelection.id));
</script>

<Popover.Root bind:open={isOpen}>
	<Popover.Trigger
		class="{buttonVariants({
			variant: 'outline'
		})} flex cursor-pointer items-center bg-background text-xs transition-all hover:bg-background/80 hover:text-foreground"
	>
		<div class="flex items-center gap-1.5 opacity-80 transition-opacity group-hover:opacity-100">
			<Pen size={14} class={activeTab === 'writer' ? 'text-blue-500' : 'text-primary'} />
			{#if !selections.writer.id}
				<span class="text-xs text-muted-foreground">Writer</span>
			{/if}
			<div class="flex items-center gap-1">
				<span class="max-w-22.5 truncate font-semibold text-foreground"
					>{selections.writer.name}</span
				>
				<div class="ml-1 flex space-x-1 opacity-70">
					{#if selections.writer.config.search}
						<div
							class="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-background bg-blue-500/20 text-blue-500"
						>
							<Globe size={8} />
						</div>
					{/if}
					{#if selections.writer.config.reasoning}
						<div
							class="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-background bg-amber-500/20 text-amber-500"
						>
							<Brain size={8} />
						</div>
					{/if}
				</div>
			</div>
		</div>
		<div class="hidden h-4 w-px bg-border/50 md:block"></div>
		<div class="flex items-center gap-1.5 opacity-80 transition-opacity group-hover:opacity-100">
			<Eye size={14} class={activeTab === 'reviewer' ? 'text-purple-500' : 'text-primary'} />
			{#if !selections.reviewer.id}
				<span class="text-xs text-muted-foreground">Reviewer</span>
			{/if}
			<div class="flex items-center gap-1">
				<span class="max-w-22.5 truncate font-semibold text-foreground"
					>{selections.reviewer.name}</span
				>
				<div class="ml-1 flex space-x-1 opacity-70">
					{#if selections.reviewer.config.search}
						<div
							class="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-background bg-blue-500/20 text-blue-500"
						>
							<Globe size={8} />
						</div>
					{/if}
					{#if selections.reviewer.config.reasoning}
						<div
							class="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-background bg-amber-500/20 text-amber-500"
						>
							<Brain size={8} />
						</div>
					{/if}
				</div>
			</div>
		</div>
	</Popover.Trigger>
	<PopoverContent side="top" class="xs:w-70 w-85 bg-background md:w-125">
		{#if openModelSettings && activeModel}
			{@const searchSupport = supportsSearch(activeModel)}
			{@const reasoningSupport = supportsReasoning(activeModel)}
			<div class="flex h-100 flex-col bg-background">
				<div class="flex items-center gap-2 border-b border-border/40">
					<button
						type="button"
						onclick={() => {
							openModelSettings = false;
						}}
						title="Back to models"
						class="cursor-pointer rounded-lg p-1.5 transition-colors hover:bg-background-secondary/20 hover:text-foreground"
					>
						<ChevronLeft size={18} />
					</button>
					<p class="flex-1 text-sm font-semibold">{activeModel.name} Capabilities</p>
				</div>
				<div class="custom-scrollbar flex flex-col gap-6 overflow-y-auto p-4">
					<div class="flex flex-col gap-3">
						<span class="text-sm font-bold tracking-wider text-muted-foreground">Description</span>
						<p class="text-sm leading-relaxed text-muted-foreground">
							{activeModel.description}
						</p>
						<span class="text-sm font-bold tracking-wider text-muted-foreground">Features</span>
						<div class="flex flex-wrap gap-4 pb-2">
							{#if reasoningSupport}
								<Badge class="flex gap-2 bg-background-secondary/20 p-4 text-muted-foreground">
									<Brain size={14} />
									<span class="text-semibold text-xs">Reasoning</span>
								</Badge>
							{/if}
							{#if searchSupport}
								<Badge class="flex gap-2 bg-background-secondary/20 p-4 text-muted-foreground">
									<Globe size={14} />
									<span class="text-semibold text-xs">Search</span>
								</Badge>
							{/if}
						</div>
						<span class="text-sm font-bold tracking-wider text-muted-foreground">Calibrate</span>
						<div class="flex gap-4">
							{#if reasoningSupport}
								<div class="flex flex-col gap-4 pt-3">
									<div class="flex items-center space-x-2">
										<Switch
											id="{activeTab}-reasoning"
											name="{activeTab}-reasoning"
											checked={activeSelection.config.reasoning}
											onCheckedChange={(checked) => setReasoning(activeTab, checked)}
											class="data-[state=checked]:bg-background-secondary/90 data-[state=unchecked]:bg-background-secondary/30"
										/>
										<Label for="{activeTab}-reasoning" class="text-muted-foreground"
											>Reasoning</Label
										>
									</div>
								</div>
								{#if reasoningSupport && activeSelection.config.reasoning}
									<!-- show only if the user selected reasoning -->
									<div class="flex items-center space-x-2">
										<Select.Root
											type="single"
											name="{activeTab}-reasoning-effort"
											value={activeSelection.config.reasoningEffort}
											onValueChange={(value) => {
												const effort = value as ModelConfig['config']['reasoningEffort'];
												setReasoningEffort(activeTab, effort);
											}}
										>
											<Select.Trigger class="w-45" id="{activeTab}-reasoning-effort">
												{activeSelection.config.reasoningEffort}
											</Select.Trigger>
											<Select.Content class="bg-background">
												{#each REASONING_EFFORT as effort (effort)}
													<Select.Item value={effort} class="hover:bg-background-secondary/50 "
														>{effort}</Select.Item
													>
												{/each}
											</Select.Content>
										</Select.Root>
										<Label for="reasoning" class="text-muted-foreground">Reasoning Effort</Label>
									</div>
								{/if}
							{/if}
						</div>
						<div>
							{#if searchSupport}
								<div class="flex flex-col gap-4 pt-3">
									<div class="flex items-center space-x-2">
										<Switch
											id="{activeTab}-search"
											name="{activeTab}-search"
											checked={activeSelection.config.search}
											onCheckedChange={(checked) => setSearch(activeTab, checked)}
											class="data-[state=checked]:bg-background-secondary/90 data-[state=unchecked]:bg-background-secondary/30"
										/>
										<Label for="searchMode" class="text-muted-foreground">Use search</Label>
									</div>
								</div>
							{/if}
						</div>
					</div>
				</div>
			</div>
		{:else}
			<div class="flex items-center gap-4 border-b border-border/40 bg-background/80 p-1">
				<button
					title="writer"
					onclick={() => (activeTab = 'writer')}
					class="trasition-all flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium {activeTab ===
					'writer'
						? 'bg-background-secondary/20 text-foreground shadow-sm'
						: 'text-muted-foreground hover:bg-background-secondary/20 hover:text-foreground'}"
				>
					<Pen size={14} class={activeTab === 'writer' ? 'text-blue-500' : ''} />
					Writer Mode
				</button>
				<button
					title="reviewer"
					onclick={() => (activeTab = 'reviewer')}
					class="trasition-all flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium {activeTab ===
					'reviewer'
						? 'bg-background-secondary/20 text-foreground shadow-sm'
						: 'text-muted-foreground hover:bg-background-secondary/20 hover:text-foreground'}"
				>
					<Eye size={14} class={activeTab === 'reviewer' ? 'text-blue-500' : ''} />
					Reviewer Mode
				</button>
			</div>
			<div class="flex items-center gap-2 border-b border-border/40 bg-background/50 p-3">
				<Search size={16} class="ml-1 text-muted-foreground" />
				<input
					bind:value={searchModel}
					type="text"
					placeholder="search models..."
					class="w-full border-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
				/>
				<button
					class="p-1 text-muted-foreground transition-colors hover:text-foreground"
					title="filter models"
				>
					<Funnel size={16} />
				</button>
			</div>
			<div class="flex h-85 bg-background">
				<div
					class="w-12 flex-col items-center gap-3 overflow-auto rounded-sm border-r-2 border-border/40 bg-background-secondary/10 py-3"
				>
					<button
						type="button"
						class="mx-auto flex h-8 w-8 items-center justify-center rounded-lg border-b-2 border-border transition-colors {activeCategory ===
						'favourites'
							? 'bg-primary/10'
							: ''}"
						title="favourites"
						onclick={() => setCategory('favourites')}
					>
						<Star
							size={16}
							class={activeCategory === 'favourites' ? 'fill-yellow-500 text-yellow-500' : ''}
						/>
					</button>
					{#each curatedModelsAndProviders.filter((c) => c.slug !== 'favourites') as cat (cat.slug)}
						<button
							onclick={() => setCategory(cat.slug)}
							type="button"
							class="mx-auto flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold transition-colors {activeCategory ===
							cat.slug
								? 'bg-primary/10 text-primary'
								: 'text-muted-foreground hover:bg-background-secondary/10 hover:text-foreground'}"
							title={cat.slug}
						>
							{cat.name.slice(0, 1)}
						</button>
					{/each}
				</div>
				<div class="custom-scrollbar w-full flex-1 overflow-y-auto">
					<div class="flex flex-col gap-1 p-2">
						{#each curatedModelsAndProviders.find((c) => c.slug === activeCategory)?.models ?? [] as model (model)}
							<div
								class="group relative flex w-full items-center gap-3 rounded-xl p-3 transition-colors focus-within:ring-2 focus-within:ring-primary/30 hover:bg-background-secondary/10 {(activeTab ===
								'writer'
									? selections.writer.id
									: selections.reviewer.id) === model.id
									? 'border border-primary/20 bg-primary/5'
									: 'border border-transparent'} "
							>
								<button
									type="button"
									class="absolute inset-0 z-0 cursor-pointer rounded-xl"
									aria-label="Select {model.name}"
									onclick={() => selectModel(activeTab, model.id, model, activeCategory)}
								></button>
								<div
									class="text-2.5 mt-0 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border/30 bg-background-secondary/10 font-bold text-foreground/60"
								>
									<Box size={12} />
								</div>
								<div class="pointer-events-none relative z-10 min-w-0 flex-1">
									<div class="mb-0.5 flex items-center justify-between">
										<div class="flex min-w-0 items-center gap-2">
											<span class="truncate font-semibold text-foreground/90">{model.name}</span>
											{#if model.pricing?.request}
												<span class="shrink-0 font-mono text-xs tracking-tighter text-emerald-400"
													>{model.pricing.request}</span
												>
											{/if}
										</div>
										<div
											class="pointer-events-auto flex items-center gap-1.5 opacity-70 transition-opacity group-hover:opacity-100"
										>
											<button
												type="button"
												onclick={(event) => {
													event.stopPropagation();
													selectModel(activeTab, model.id, model, activeCategory);
													onOpenSettings();
												}}
												class="relative z-20 flex cursor-pointer items-center justify-center gap-1 rounded-lg border border-transparent bg-background-secondary/20 p-1 text-muted transition-colors hover:border-border hover:bg-background-secondary/30"
												title="Model capabilities"
												aria-label={`Open capabilites and settings for ${model.name}`}
											>
												<Ellipsis size={14} />
											</button>
										</div>
									</div>
								</div>
							</div>
						{/each}
					</div>
				</div>
			</div>
		{/if}
	</PopoverContent>
</Popover.Root>

<style>
	.custom-scrollbar::-webkit-scrollbar {
		width: 6px;
	}
	.custom-scrollbar::-webkit-scrollbar-track {
		background: transparent;
	}
	.custom-scrollbar::-webkit-scrollbar-thumb {
		background-color: rgb(var(--color-background) / 0.2);
		border-radius: 10px;
	}
	.custom-scrollbar::-webkit-scrollbar-thumb:hover {
		background-color: rgb(var(--color-background) / 0.4);
	}
</style>
