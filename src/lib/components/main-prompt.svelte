<script lang="ts">
	import Button from '$lib/components/ui/button/button.svelte';
	import Paperclip from '$lib/icons/Paperclip.svelte';
	import {
		ArrowRight,
		ClipboardPen,
		FileIcon,
		Info,
		Maximize,
		Minimize,
		SendHorizontal,
		Settings,
		Settings2,
		X
	} from '@lucide/svelte';
	import ModelSelection from './model-selection.svelte';
	import * as aiProviders from '$lib/data/ai_providers.json';
	import * as aiModels from '$lib/data/models.json';
	import type { SelectedModel, Role } from '$lib/data/models';
	import * as Popover from './ui/popover/index';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import { Switch } from './ui/switch';
	import { Label } from './ui/label';
	import * as Tooltip from './ui/tooltip';

	// 0 = Normal, 1 = Slightly Expanded, 2 = Fully Expanded
	let expansionState = $state(0);

	let promptText = $state('');
	let attachedFiles = $state<File[]>([]);
	let showInstructions = $state(false);
	let additionalInstructions = $state('');
	let modelSelections = $state<Record<Role, SelectedModel>>({
		writer: {
			provider: null,
			name: null,
			id: null,
			config: { search: false, reasoning: false, reasoningEffort: 'None' }
		},
		reviewer: {
			provider: null,
			name: null,
			id: null,
			config: { search: false, reasoning: false, reasoningEffort: 'None' }
		}
	});
	let textareaRef: HTMLTextAreaElement | null = null;
	let fileInput: HTMLInputElement;
	let showExpandedIcon = $derived.by(() => {
		return expansionState > 0 || (textareaRef?.scrollHeight ?? 0) > 100;
	});
	let promptMode = $state<'Advanced' | 'Basic'>('Basic');

	const models = $state(aiModels.data);
	const providers = $state(aiProviders.data);

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
	}

	function removeFile(index: number) {
		attachedFiles = attachedFiles.filter((_, i) => i !== index);
		return null;
	}

	function toggleExpand() {
		if (!textareaRef) return;

		if (expansionState === 2) {
			expansionState = textareaRef.scrollHeight > 100 ? 1 : 0;
		} else {
			expansionState = 2;
		}
	}

	function submitPrompt() {
		if (!promptText.trim() && !attachedFiles.length) return;
		// begin a run
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			submitPrompt();
		}
	}

	function handleInput() {
		if (!textareaRef) return;

		// Auto-promote to slightly expanded if height grows past normal view
		if (expansionState === 0 && textareaRef.scrollHeight > 100) {
			expansionState = 1;
		}
		// Auto-demote to normal if they delete text and it shrinks
		else if (expansionState === 1 && textareaRef.value.trim() === '') {
			expansionState = 0;
		}
	}

	function handlePaste(event: ClipboardEvent) {
		if (event.clipboardData && event.clipboardData.files.length > 0) {
			event.preventDefault();
			attachedFiles = [...attachedFiles, ...Array.from(event.clipboardData.files)];
		} else if (event.clipboardData && event.clipboardData.getData('text')) {
			// Normal text paste, allow it but trigger resize
			setTimeout(handleInput, 0);
			return;
		}
	}

	function handleFileSelect(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const files = input.files;
		if (files) {
			attachedFiles = [...attachedFiles, ...(Array.from(files) as File[])];
			input.value = '';
		}
	}

	function promptHeight() {
		switch (expansionState) {
			case 1:
				return 4;
			case 2:
				return 6;
			default:
				return 2;
		}
	}

	function setAdvancedMode(checked: boolean) {
		if (checked) {
			promptMode = 'Advanced';
			return;
		}
		promptMode = 'Basic';
		return;
	}
</script>

<div class="mx-auto flex w-full max-w-3xl flex-col items-center">
	<h1
		class="text-center {expansionState < 2
			? 'text-3xl md:text-4xl'
			: 'text-xl md:text-2xl'} font-semibold tracking-tight text-foreground transition-all"
	>
		What role are we targeting today?
	</h1>
	<ul
		class="my-6 flex shrink list-none flex-col items-center justify-center align-middle text-muted-foreground transition-all {expansionState <
		2
			? 'text-base'
			: 'text-sm'}"
	>
		<li>Upload your resume</li>
		<li>Paste in the target job description</li>
		<li>Generate your tailored, ATS-ready resume</li>
	</ul>

	<form
		action=""
		onsubmit={handleSubmit}
		class="relative flex w-full flex-col rounded-2xl border border-primary/30 bg-background shadow-lg transition-all duration-500 ease-out focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 hover:border-border
		{expansionState === 2 ? 'z-40 h-[75vh]' : expansionState === 1 ? 'z-10 h-80' : 'z-0 min-h-18'}"
	>
		{#if attachedFiles.length > 0}
			<div class="flex shrink-0 flex-wrap gap-2 p-3 pb-0">
				{#each attachedFiles as file, index (index)}
					<div
						class="group relative flex items-center gap-2 overflow-hidden rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm"
					>
						<FileIcon size={16} class="shrink-0 text-primary" />
						<span class="max-w-37.5 truncate font-medium">{file.name}</span>
						<button
							type="button"
							onclick={() => removeFile(index)}
							class="ml-1 rounded-full bg-card/80 p-0.5 opacity-60 transition-colors hover:text-destructive hover:opacity-100"
							title="remove attachment"
						>
							<X size={14} />
						</button>
					</div>
				{/each}
			</div>
		{/if}
		{#if showExpandedIcon || expansionState > 0}
			<button
				type="button"
				class="absolute top-3 right-4 z-10 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
				title={expansionState === 2 ? 'Minimize' : 'Expand'}
				onclick={toggleExpand}
			>
				{#if expansionState === 2}
					<Minimize size={16} />
				{:else}
					<Maximize size={16} />
				{/if}
			</button>
		{/if}
		<div class="mt-4 flex min-h-0 w-full flex-1 flex-col">
			<textarea
				rows={promptHeight()}
				bind:this={textareaRef}
				bind:value={promptText}
				oninput={handleInput}
				onpaste={handlePaste}
				onkeydown={handleKeyDown}
				class="min-h-0 w-full flex-1 resize-none bg-transparent p-4 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/50 md:text-base"
				placeholder="Paste a Job description of the role..."
			></textarea>
		</div>

		{#if showInstructions}
			<div class="animate-in px-3 pb-2 duration-200 fade-in slide-in-from-top-2">
				<div
					class="flex items-center rounded-xl border border-border/50 bg-background-secondary/5 p-1 transition-all focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20"
				>
					<div class="pl-3 text-muted-foreground">
						<Settings size={14} />
					</div>
					<textarea
						rows="2"
						bind:value={additionalInstructions}
						onkeydown={handleKeyDown}
						placeholder="Optional: add specific tailoring instructions (e.g. focus on React experience)..."
						name="instructions"
						id="instructions"
						class="h-9 w-full resize-none bg-transparent p-2 text-sm outline-none placeholder:text-muted-foreground/50"
					></textarea>
					<button
						onclick={() => {
							showInstructions = false;
							additionalInstructions = '';
						}}
						class="p-2 text-muted-foreground opacity-60 transition-opacity hover:text-destructive hover:opacity-100"
						title="cancel"
					>
						<X size={14} />
					</button>
				</div>
			</div>
		{/if}
		<div
			class="z-10 mt-auto flex w-full shrink-0 flex-wrap items-center justify-between gap-2 rounded-b-xl border-t border-border/30 bg-background p-2 pt-3"
		>
			<div class="flex flex-row gap-1 border-r border-border/50 md:gap-2">
				<button
					class="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-background/50 hover:text-foreground"
					onclick={() => fileInput.click()}
					title="Attach files"
				>
					<Paperclip size={18} />
					<span>Attach Resume</span>
				</button>
				<input
					type="file"
					bind:this={fileInput}
					onchange={handleFileSelect}
					multiple
					class="hidden"
					accept=".pdf,.docx,.md,.txt"
				/>
				<Popover.Root>
					<Popover.Trigger
						class="{buttonVariants({
							variant: 'ghost'
						})} flex cursor-pointer items-center bg-background p-0 text-xs transition-all hover:bg-background/80 hover:text-foreground"
					>
						<span
							class="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-transparent text-muted-foreground transition hover:border-border hover:bg-muted/50 hover:text-foreground sm:h-10 sm:w-10"
						>
							<Settings2 size={18} />
						</span>
					</Popover.Trigger>
					<Popover.Content side="top" class="w-80 bg-background">
						<div class="flex flex-col">
							<div class="flex-items-center gap-2 border border-border/40">
								<button
									type="button"
									onclick={() => (showInstructions = true)}
									class="flex w-full shrink-0 cursor-pointer items-center justify-between gap-4 rounded-lg border border-transparent px-2 py-4 text-muted-foreground transition hover:border-border hover:bg-background-secondary/10 hover:text-foreground"
									title="Add instructions"
								>
									<ClipboardPen size={14} />
									<span class="text-sm text-muted-foreground">Add instructions</span>
									<ArrowRight size={14} />
								</button>
							</div>
							<div class="flex-items-center gap-2 border border-border/40">
								<div
									class="flex w-full shrink-0 items-center justify-between gap-4 space-x-2 rounded-lg border border-transparent py-3 pl-2 text-muted-foreground transition hover:border-border hover:bg-background-secondary/10 hover:text-foreground"
								>
									<Tooltip.Provider>
										<Tooltip.Root>
											<Tooltip.Trigger
												class="{buttonVariants({
													variant: 'ghost'
												})} ring-dark hidden bg-background ring-offset-background hover:bg-background/20 md:block"
											>
												<Info size={14} />
											</Tooltip.Trigger>
											<Tooltip.Content
												class="animate-in border border-border bg-background p-4 fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
												arrowClasses="bg-background border-none"
											>
												<p class="text-xs text-muted-foreground">
													Advanced mode lets you choose models and customize your AI experience.
												</p>
											</Tooltip.Content>
										</Tooltip.Root>
									</Tooltip.Provider>

									<Label for="advanced-mode" class="text-muted-foreground">{promptMode} Mode</Label>
									<Switch
										id="advanced-mode"
										name="advanced-mode"
										checked={promptMode === 'Advanced'}
										onCheckedChange={(checked) => setAdvancedMode(checked)}
										class="cursor-pointer data-[state=checked]:bg-background-secondary/90 data-[state=unchecked]:bg-background-secondary/30"
									/>
								</div>
							</div>
						</div>
					</Popover.Content>
				</Popover.Root>
			</div>

			{#if promptMode === 'Advanced'}
				<ModelSelection {providers} {models} bind:modelSelections />
			{/if}

			<Button class="flex gap-4">
				<SendHorizontal size={18} />
				<span class="block sm:hidden">Tailor resume</span>
			</Button>
		</div>
	</form>
	<!-- <div class="mt-10 flex flex-wrap items-center justify-center sm:gap-2 md:gap-4">
		<button
			class="my-2 cursor-pointer rounded-full border border-primary/30 bg-background px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-muted/50"
			>Frontend Engineer at Stripe</button
		>
		<button
			class="my-2 cursor-pointer rounded-full border border-primary/30 bg-background px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-muted/50"
			>Product Designer at Apple</button
		>
		<button
			class="my-2 cursor-pointer rounded-full border border-primary/30 bg-background px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-muted/50"
			>Project Manager at Microsoft</button
		>
		<button
			class="my-2 cursor-pointer rounded-full border border-primary/30 bg-background px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-muted/50 md:hidden"
			>Data analyst at Amazon</button
		>
	</div> -->
</div>
