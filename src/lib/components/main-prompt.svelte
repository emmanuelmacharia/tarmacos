<script lang="ts">
	import Button from '$lib/components/ui/button/button.svelte';
	import Paperclip from '$lib/icons/Paperclip.svelte';
	import Sparkles from '$lib/icons/Sparkles.svelte';
	import { FileIcon, Maximize, Minimize, Settings, X } from '@lucide/svelte';
	import ModelSelection from './model-selection.svelte';
	import * as aiProviders from '$lib/data/ai_providers.json';
	import * as aiModels from '$lib/data/models.json';
	import type { SelectedModel, Role } from '$lib/data/models';

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
</script>

<div class="mx-auto flex w-full max-w-3xl flex-col items-center">
	<h1
		class="mb-10 text-center {expansionState < 2
			? 'text-3xl'
			: 'text-xl'} font-semibold tracking-tight text-foreground md:text-4xl"
	>
		What role are we targetting today?
	</h1>

	<form
		action=""
		onsubmit={handleSubmit}
		class="relative flex w-full flex-col rounded-2xl border border-primary/30 bg-background shadow-lg transition-all duration-500 ease-out focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 hover:border-border {expansionState ===
		2
			? 'z-40 h-[75vh]'
			: expansionState === 1
				? 'z-10 h-50'
				: 'z-0 min-h-18'}"
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
				rows="2"
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
					class="flex items-center rounded-xl border border-border/50 p-1 transition-all focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20"
				>
					<div class="pl-3 text-muted-foreground">
						<Settings size={14} />
					</div>
					<textarea
						rows="1"
						bind:value={additionalInstructions}
						onkeydown={handleKeyDown}
						placeholder="Optional: add specific tailoring instructions (e.g. focus on React experience)..."
						name="instructions"
						id="instructions"
						class="min-h-10 w-full resize-none bg-transparent p-2 text-sm outline-none placeholder:text-muted-foreground/50"
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
					<span class="xs:hidden block">Attach Baseline Resume</span>
				</button>
				<input
					type="file"
					bind:this={fileInput}
					onchange={handleFileSelect}
					multiple
					class="hidden"
					accept=".pdf,.docx,.md,.txt"
				/>
				{#if !showInstructions}
					<button
						type="button"
						onclick={() => (showInstructions = true)}
						class="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-transparent text-muted-foreground transition hover:border-border hover:bg-muted/50 hover:text-foreground sm:h-10 sm:w-10"
						title="Add instructions"
					>
						<Settings size={18} />
					</button>
				{/if}
			</div>

			<ModelSelection {providers} {models} bind:modelSelections />

			<Button class="flex gap-4">
				<Sparkles size={18} />
				<span class="xs:hidden block">Tailor resume</span>
			</Button>
		</div>
	</form>
	<div class="mt-10 flex flex-wrap items-center justify-center sm:gap-2 md:gap-4">
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
	</div>
</div>
