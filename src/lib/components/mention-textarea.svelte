<script lang="ts">
	import { tick } from 'svelte';
	import {
		filterMentionAgents,
		getActiveMentionQuery,
		tokenizeMentions,
		type MentionAgent
	} from '$lib/utils/mentions';

	type Props = {
		value: string;
		placeholder?: string;
		disabled?: boolean;
		onsubmit: () => void;
	};

	let { value = $bindable(), placeholder = '', disabled = false, onsubmit }: Props = $props();

	let textareaRef = $state<HTMLTextAreaElement | null>(null);
	let highlightRef = $state<HTMLDivElement | null>(null);
	let caret = $state(0);
	let activeIndex = $state(0);
	// '@' offset of a popup the user closed with Escape, so it stays closed
	// while they keep typing that same mention
	let dismissedAt = $state<number | null>(null);

	const activeQuery = $derived(getActiveMentionQuery(value, caret));
	const suggestions = $derived(activeQuery ? filterMentionAgents(activeQuery.query) : []);
	const showSuggestions = $derived(
		!disabled && activeQuery !== null && activeQuery.start !== dismissedAt && suggestions.length > 0
	);
	const segments = $derived(tokenizeMentions(value));

	$effect(() => {
		void suggestions;
		activeIndex = 0;
	});

	// a dismissal only applies while that same mention is still being typed;
	// once the caret leaves it (or the composer is cleared after sending) the
	// stale offset would otherwise suppress future mentions at the same index
	$effect(() => {
		if (activeQuery === null) dismissedAt = null;
	});

	function syncCaret() {
		caret = textareaRef?.selectionStart ?? 0;
	}

	// the overlay must mirror the textarea's internal scroll or highlights drift
	function syncScroll() {
		if (highlightRef && textareaRef) highlightRef.scrollTop = textareaRef.scrollTop;
	}

	async function selectMention(agent: MentionAgent) {
		if (!activeQuery || !textareaRef) return;
		const insert = `@${agent.id} `;
		const before = value.slice(0, activeQuery.start);
		const after = value.slice(caret);
		value = before + insert + after;
		const nextCaret = before.length + insert.length;
		await tick();
		textareaRef.focus();
		textareaRef.setSelectionRange(nextCaret, nextCaret);
		caret = nextCaret;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (showSuggestions) {
			if (event.key === 'ArrowDown') {
				event.preventDefault();
				activeIndex = (activeIndex + 1) % suggestions.length;
				return;
			}
			if (event.key === 'ArrowUp') {
				event.preventDefault();
				activeIndex = (activeIndex - 1 + suggestions.length) % suggestions.length;
				return;
			}
			if (event.key === 'Enter' || event.key === 'Tab') {
				event.preventDefault();
				void selectMention(suggestions[activeIndex]);
				return;
			}
			if (event.key === 'Escape') {
				event.preventDefault();
				dismissedAt = activeQuery?.start ?? null;
				return;
			}
		}
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			onsubmit();
		}
	}
</script>

<div class="relative min-w-0 flex-1">
	{#if showSuggestions}
		<div
			class="absolute bottom-full left-0 z-20 mb-2 w-72 overflow-hidden rounded-xl border border-border bg-card shadow-lg"
			role="listbox"
			aria-label="Mention an agent"
		>
			<div
				class="border-b border-border/60 px-3 py-1.5 text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
			>
				Agents
			</div>
			{#each suggestions as agent, index (agent.id)}
				<button
					type="button"
					role="option"
					aria-selected={index === activeIndex}
					class="flex w-full items-baseline gap-2 px-3 py-2 text-left text-sm transition-colors {index ===
					activeIndex
						? 'bg-primary/10'
						: 'hover:bg-muted/50'}"
					onmousedown={(event) => event.preventDefault()}
					onclick={() => selectMention(agent)}
					onmouseenter={() => (activeIndex = index)}
				>
					<span class="shrink-0 font-medium text-primary">{agent.label}</span>
					<span class="truncate text-xs text-muted-foreground">{agent.description}</span>
				</button>
			{/each}
		</div>
	{/if}

	<!-- highlight layer: same metrics as the textarea, whose text is transparent -->
	<div
		bind:this={highlightRef}
		aria-hidden="true"
		class="pointer-events-none absolute inset-0 max-h-32 overflow-hidden px-2 py-1.5 text-sm break-words whitespace-pre-wrap text-foreground"
	>
		<!-- markup stays whitespace-tight: stray text nodes render inside pre-wrap
		-->{#each segments as segment, index (index)}{#if segment.isMention}<span
					class="rounded bg-primary/15 text-primary">{segment.text}</span
				>{:else}{segment.text}{/if}{/each}{#if value.endsWith('\n')}&#8203;{/if}
	</div>

	<textarea
		rows="1"
		bind:this={textareaRef}
		bind:value
		{disabled}
		{placeholder}
		oninput={() => {
			syncCaret();
			syncScroll();
		}}
		onkeydown={handleKeydown}
		onkeyup={syncCaret}
		onclick={syncCaret}
		onscroll={syncScroll}
		class="relative max-h-32 w-full resize-none bg-transparent px-2 py-1.5 text-sm text-transparent caret-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed"
	></textarea>
</div>
