<script lang="ts">
	import { fade } from 'svelte/transition';
	import { marked } from 'marked';
	import type { Doc } from '../../convex/_generated/dataModel';
	import { BrainCircuit, CircleCheckBig, FileText, SquarePen, User } from '@lucide/svelte';

	type Props = {
		message: Doc<'messages'>;
		authors: { model: string; role: 'reviewer' | 'writer' };
		messageAttachments?: Doc<'runDocuments'>[];
		messageData?: {
			isStreamingReasoning?: boolean;
			reasoning?: string;
			isComplete?: boolean;
			isStreamingContent?: boolean;
			metrics: {
				experienceAlignment: number;
				keywordMatch: number;
				resumeAlignment: number;
			};
		};
	};
	let { message, authors, messageAttachments, messageData }: Props = $props();

	let messageContent = $derived(marked.parse(message.body));

	//  we need to figure out the logical relationship between messages and run documents;
	// for now it's safe to say that run documents are only attached to the first run message
</script>

<div
	class="group relative flex w-full {message.authorType === 'user'
		? 'justify-end'
		: 'justify-start'}"
	in:fade={{ duration: 200 }}
>
	<!-- AI icons -->
	{#if message.authorType !== 'user'}
		<div
			class="z-10 mt-1 mr-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-[3px] border-border bg-background shadow-sm md:h-8"
		>
			{#if message.authorRole === 'reviewer'}
				<CircleCheckBig size={12} class="text-muted-foreground" aria-hidden="true" />
			{:else}
				<SquarePen size={12} class="text-muted-foreground" aria-hidden="true" />
			{/if}
		</div>
	{/if}

	<div
		class="flex max-w-[85%] min-w-0 flex-col {message.authorType === 'user'
			? 'items-end'
			: 'items-start'}"
	>
		<div class="mb-1.5 flex items-center gap-2 text-[13px] font-semibold md:text-sm">
			<span class="text-[11px] tracking-wide text-foreground/90 uppercase md:text-xs">
				{message.authorType === 'user' ? 'You' : message.authorRole}
			</span>
			{#if ['reviewer', 'writer'].includes(message.authorRole)}
				<span
					class="flex items-center rounded border border-border/40 bg-muted/30 px-1.5 py-0.5 text-[9px] font-medium tracking-wider text-muted-foreground/70 md:text-[10px]"
				>
					{authors.role === message.authorRole ? authors.model : ''}
				</span>
			{/if}
		</div>
		{#if messageAttachments?.length}
			<div
				class="mb-2 flex flex-wrap gap-1 {message.authorRole === 'user'
					? 'justify-end'
					: 'justify-start'}"
			>
				{#each messageAttachments as att (att._id)}
					<div
						class="flex max-w-full min-w-0 items-center gap-1.5 rounded-md border-border/80 bg-muted/50 px-2 py-1 text-[11px] font-medium text-muted-foreground"
					>
						<FileText size={10} aria-hidden="true" class="shrink-0" />
						<!-- TODO: WE NEED THE NAME OF THE DOCUMENTS -->
						<span class="truncate">{att.purpose}</span>
					</div>
				{/each}
			</div>
		{/if}

		{#if messageData?.reasoning}
			<div
				class="mb-3 border-l-2 bg-muted/20 pb-2 text-[11px] text-muted-foreground/80 md:text-xs {message.authorType ===
				'user'
					? 'border-primary/50 pr-2.5 text-right md:pr-3'
					: 'border-muted pl-2.5 text-left md:pl-3'} flex w-full flex-col gap-1 md:gap-1.5"
			>
				<div
					class="flex items-center gap-1.5 text-[9px] font-bold tracking-wider text-muted-foreground uppercase md:text-[10px] {message.authorType ===
					'user'
						? 'justify-end'
						: 'justify-start'}"
				>
					{#if message.authorType !== 'user'}
						<BrainCircuit
							size={10}
							class={messageData?.isStreamingReasoning ? 'animate-pulse' : ''}
							aria-hidden="true"
						/>
					{/if}
					Execution Trace
					{#if message.authorType === 'user'}
						<BrainCircuit
							size={10}
							class={messageData?.isStreamingReasoning ? 'animate-pulse' : ''}
							aria-hidden="true"
						/>
					{/if}
					{#if messageData?.isStreamingReasoning}
						<span class="ml-1 flex gap-0.5" aria-hidden="true"
							><span class="animate-bounce">.</span><span
								class="animate-bounce"
								style="animation-delay: 150ms">.</span
							><span class="animate-bounce" style="animation-delay: 300ms">.</span></span
						>
					{/if}
				</div>
				<span class="leading-relaxed italic">{messageData?.reasoning}</span>
			</div>
		{/if}

		<div
			class="markdown-body w-full border p-4 shadow-sm {message.authorType ===
			'user'
				? 'rounded-2xl rounded-tr-sm border-primary/20 bg-primary text-primary-foreground'
				: 'rounded-2xl rounded-tl-sm border-border/60 bg-card text-foreground/90'}"
		>
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html messageContent}{messageData?.isStreamingContent ? '▋' : ''}

			{#if messageData?.metrics && messageData?.isComplete}
				<div
					class="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border/50 pt-3.5"
					in:fade={{ duration: 400 }}
				>
					<!-- Alignment -->
					<div class="flex flex-col gap-1.5">
						<div
							class="flex items-center justify-between text-[9px] font-bold tracking-widest text-muted-foreground uppercase md:text-[10px]"
						>
							<span>Alignment</span>
							<span class="text-foreground">{messageData?.metrics.resumeAlignment}%</span>
						</div>
						<div class="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
							<div
								class="animate-progress absolute top-0 left-0 h-full rounded-full bg-blue-500"
								style="width: {messageData?.metrics.resumeAlignment}%"
							></div>
						</div>
					</div>
					<!-- Keywords -->
					<div class="flex flex-col gap-1.5">
						<div
							class="flex items-center justify-between text-[9px] font-bold tracking-widest text-muted-foreground uppercase md:text-[10px]"
						>
							<span>Keywords</span>
							<span class="text-foreground">{messageData?.metrics.keywordMatch}%</span>
						</div>
						<div class="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
							<div
								class="animate-progress absolute top-0 left-0 h-full rounded-full bg-amber-500"
								style="width: {messageData?.metrics.keywordMatch}%"
							></div>
						</div>
					</div>
					<!-- Experience -->
					<div class="flex flex-col gap-1.5">
						<div
							class="flex items-center justify-between text-[9px] font-bold tracking-widest text-muted-foreground uppercase md:text-[10px]"
						>
							<span>Experience</span>
							<span class="text-foreground">{messageData?.metrics.experienceAlignment}%</span>
						</div>
						<div class="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
							<div
								class="animate-progress absolute top-0 left-0 h-full rounded-full bg-emerald-500"
								style="width: {messageData?.metrics.experienceAlignment}%"
							></div>
						</div>
					</div>
					<!-- Confidence -->
					<div class="flex flex-col gap-1.5">
						<div
							class="flex items-center justify-between text-[9px] font-bold tracking-widest text-primary uppercase md:text-[10px]"
						>
							<span>Confidence</span>
							<span class="font-black text-primary"
								>{Math.round(
									(messageData?.metrics.resumeAlignment +
										messageData?.metrics.keywordMatch +
										messageData?.metrics.experienceAlignment) /
										3
								)}%</span
							>
						</div>
						<div class="relative h-1.5 w-full overflow-hidden rounded-full bg-primary/20">
							<div
								class="animate-progress absolute top-0 left-0 h-full rounded-full bg-primary"
								style="width: {Math.round(
									(messageData?.metrics.resumeAlignment +
										messageData?.metrics.keywordMatch +
										messageData?.metrics.experienceAlignment) /
										3
								)}%"
							></div>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>

	<!-- User Icon -->
	{#if message.authorType === 'user'}
		<div
			class="z-10 mt-1 ml-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-[3px] border-primary bg-primary/10 shadow-sm md:h-8 md:w-8"
		>
			<User size={12} class="text-primary" aria-hidden="true" />
		</div>
	{/if}
</div>

<style>
	.animate-progress {
		animation: progressFill 1.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
	}
	@keyframes progressFill {
		0% {
			width: 0%;
		}
	}
</style>
