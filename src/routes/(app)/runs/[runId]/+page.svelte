<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { fade, slide } from 'svelte/transition';
	import { marked } from 'marked';
	import {
		ArrowLeft,
		Download,
		FileDown,
		FileText,
		History,
		LoaderCircle,
		Network,
		SendHorizontal
	} from '@lucide/svelte';
	import MesssageBubble from '$lib/components/messsage-bubble.svelte';
	import MentionTextarea from '$lib/components/mention-textarea.svelte';
	import DownloadModal from '$lib/components/download-modal.svelte';
	import { resolve } from '$app/paths';
	import posthog from 'posthog-js';
	import { api } from '../../../../convex/_generated/api';
	import type { Doc, Id } from '../../../../convex/_generated/dataModel';
	import type { PageProps } from './$types';

	type ChatMessage = Doc<'messages'> & {
		metrics: {
			resumeAlignment: number;
			keywordMatch: number;
			experienceAlignment: number;
		} | null;
		reasoning: string | null;
	};

	let { params, data }: PageProps = $props();

	const runId = $derived(params.runId as Id<'runs'>);
	const maxFeedbackRounds = $derived(data.maxUserFeedbackIterations);

	const messageFetch = useQuery(api.messages.index.getMessagesByRunId, () => ({ runId }));
	const runFetch = useQuery(api.runs.index.getRun, () => ({ runId }));
	const versionsFetch = useQuery(api.artifacts.versions.getArtifactVersionsByRunId, () => ({
		runId
	}));
	// ready exports for this run — drives the "generated files" / re-download UI (plan §8, Phase 6)
	const exportsFetch = useQuery(api.exports.index.listRunExports, () => ({ runId }));

	const messages: ChatMessage[] = $derived(messageFetch.data ?? []);
	const run: Doc<'runs'> | undefined = $derived(runFetch.data?.data?.run);
	const versions = $derived(versionsFetch.data ?? []);
	const runExports = $derived(exportsFetch.data?.data ?? []);

	// the artifact panel takes over once the writer has produced a first draft
	const showPreview = $derived(versions.length > 0);
	const isRunning = $derived(run?.status === 'running' || run?.status === 'created');
	const isAwaitingUser = $derived(run?.status === 'awaiting_user');
	const isFailed = $derived(run?.status === 'failed');

	// every feedback round is persisted as a user 'revision_request' message,
	// so the consumed rounds can be derived straight from the chat history
	const feedbackRoundsUsed = $derived(
		messages.filter(
			(message) => message.authorType === 'user' && message.messageType === 'revision_request'
		).length
	);
	const feedbackLimitReached = $derived(feedbackRoundsUsed >= maxFeedbackRounds);

	const modelAuthor = $derived({
		writer: {
			model: run?.agentConfig.writer.modelSlug.split('/')[1] ?? '',
			role: 'writer' as const
		},
		reviewer: {
			model: run?.agentConfig.reviewer.modelSlug.split('/')[1] ?? '',
			role: 'reviewer' as const
		}
	});

	let activeMobileTab = $state<'chat' | 'preview'>('chat');
	let showHistory = $state(false);
	let showFiles = $state(false);
	let showDownloadModal = $state(false);

	const formatLabel: Record<string, string> = { pdf: 'PDF', docx: 'Word', txt: 'Text' };

	function formatBytes(bytes: number): string {
		if (!bytes) return '';
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	// Re-download a previously generated export. The endpoint records the download
	// (and emits export_redownloaded server-side) then 302s to the signed file URL;
	// a new tab keeps the app mounted.
	function downloadExport(exportId: Id<'exports'>) {
		window.open(`/api/runs/${runId}/export/${exportId}/download`, '_blank', 'noopener');
	}
	// null follows the latest version as new drafts land
	let selectedVersionId = $state<Id<'artifactVersions'> | null>(null);
	let composerText = $state('');
	let composerError = $state<string | null>(null);
	let isSubmitting = $state(false);
	let chatContainer = $state<HTMLDivElement | null>(null);

	const isContinueCommand = $derived(composerText.trim().toLowerCase() === 'continue');
	const composerPlaceholder = $derived(
		isRunning
			? 'Models are processing workflow… type "continue" if it stalls'
			: isFailed
				? 'Something went wrong — type "continue" to resume the run'
				: feedbackLimitReached
					? 'Feedback limit reached for this run'
					: 'Provide feedback — @writer revises the draft, @reviewer reviews it…'
	);

	const latestVersion = $derived(versions.at(-1));
	const displayedVersion = $derived(
		(selectedVersionId !== null && versions.find((version) => version._id === selectedVersionId)) ||
			latestVersion
	);

	const artifactHtml = $derived(
		displayedVersion ? marked.parse(displayedVersion.markdown || displayedVersion.previewText) : ''
	);

	// keep the newest message in view as the workflow progresses; jump instantly while
	// messages stream in so successive scrolls don't restart mid-animation
	$effect(() => {
		void messages.length;
		chatContainer?.scrollTo({
			top: chatContainer.scrollHeight,
			behavior: isRunning ? 'instant' : 'smooth'
		});
	});

	// only auto-resume once, and only for runs that have work left to do —
	// re-running on every mount/refresh triggers needless orchestration and
	// unexpected state transitions
	let autoResumeTriggered = $state(false);

	$effect(() => {
		if (autoResumeTriggered || !run) return;
		if (run.status === 'created' || run.status === 'running' || run.status === 'failed') {
			autoResumeTriggered = true;
			void resumeRun();
		}
	});

	async function resumeRun() {
		try {
			const response = await fetch(`/api/ai/runs/${runId}/resumeRun`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ runId })
			});
			if (!response.ok) throw new Error('Failed to resume run');
			await response.json().catch(() => null);
			posthog.capture('run_resumed', { run_id: runId, run_status: run?.status });
		} catch (error) {
			console.error('Failed to resume run', error);
			posthog.captureException(error);
		}
	}

	async function sendFeedback(message: string) {
		const response = await fetch(`/api/ai/runs/${runId}/messages`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ message })
		});
		const payload = await response.json().catch(() => null);
		if (!response.ok) {
			throw new Error(payload?.error?.message ?? 'Failed to send your feedback. Please try again.');
		}
		posthog.capture('feedback_submitted', {
			run_id: runId,
			feedback_rounds_used: feedbackRoundsUsed + 1,
			message_length: message.length
		});
	}

	async function handleComposerSubmit() {
		const text = composerText.trim();
		if (!text || isSubmitting) return;
		composerError = null;

		// 'continue' is a control command, not feedback: it resumes a stalled or
		// failed workflow, is never persisted, and never counts against the limit
		if (text.toLowerCase() === 'continue') {
			composerText = '';
			if (isAwaitingUser) return;
			isSubmitting = true;
			try {
				await resumeRun();
			} finally {
				isSubmitting = false;
			}
			return;
		}

		if (feedbackLimitReached) return;

		isSubmitting = true;
		try {
			await sendFeedback(text);
			composerText = '';
		} catch (error) {
			composerError =
				error instanceof Error ? error.message : 'Failed to send your feedback. Please try again.';
		} finally {
			isSubmitting = false;
		}
	}
</script>

{#snippet mobileTabs()}
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
{/snippet}

<div
	class="relative flex h-dvh w-full flex-col overflow-hidden bg-transparent font-sans text-foreground md:flex-row"
>
	<!-- workflow / chat column -->
	<div
		class="relative flex min-h-0 flex-1 flex-col bg-transparent md:flex-none {showPreview
			? `z-10 border-border/80 md:flex md:w-[45vw] md:max-w-xl md:border-r lg:w-[60vw] ${activeMobileTab === 'chat' ? 'flex w-full' : 'hidden'}`
			: 'mx-auto flex w-full max-w-5xl shadow-[0_0_100px_rgba(0,0,0,0.02)]'}"
	>
		<div
			class="z-10 flex h-14 shrink-0 items-center border-b border-border bg-transparent px-4 md:h-16 md:px-6"
		>
			<a
				class="flex items-center gap-2 rounded px-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
				href={resolve('/dashboard')}
			>
				<ArrowLeft size={16} aria-hidden="true" /> Dashboard
			</a>
			{#if !showPreview}
				<div class="flex flex-1 justify-center gap-2 text-center text-sm font-medium text-primary">
					<Network size={16} aria-hidden="true" /> Workflow execution
				</div>
			{/if}
		</div>

		{#if showPreview}
			{@render mobileTabs()}
		{/if}

		<!-- chat -->
		<div
			class="flex flex-1 flex-col overflow-y-auto p-3 pt-6 md:p-8 md:pt-10"
			bind:this={chatContainer}
		>
			<div class="relative mx-auto w-full space-y-6 md:max-w-3xl md:space-y-8">
				{#if runFetch.isLoading || messageFetch.isLoading}
					<div class="flex w-full justify-center py-10" in:fade={{ duration: 200 }}>
						<LoaderCircle size={20} class="animate-spin text-muted-foreground" aria-hidden="true" />
					</div>
				{:else}
					{#each messages as message (message._id)}
						<MesssageBubble
							{message}
							authors={message.authorRole === 'writer' ? modelAuthor.writer : modelAuthor.reviewer}
							messageData={{
								reasoning: message.reasoning ?? undefined,
								metrics: message.metrics ?? undefined,
								isComplete: true
							}}
						/>
					{/each}

					{#if isRunning}
						<div class="flex w-full justify-start" in:fade={{ duration: 200 }}>
							<div
								class="z-10 mr-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-[3px] border-border bg-background md:h-8 md:w-8"
							>
								<LoaderCircle
									size={12}
									class="animate-spin text-muted-foreground"
									aria-hidden="true"
								/>
							</div>
							<div class="flex h-7 items-center md:h-8">
								<div
									class="animate-pulse text-[10px] font-medium tracking-widest text-muted-foreground uppercase md:text-xs"
								>
									Running process...
								</div>
							</div>
						</div>
					{/if}
				{/if}
			</div>
		</div>

		<!-- composer -->
		<div class="shrink-0 p-3 md:p-4">
			{#if feedbackLimitReached}
				<div
					class="mx-auto mb-2 w-full rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 md:max-w-3xl dark:text-amber-400"
					transition:slide={{ duration: 200 }}
					role="status"
				>
					You've used all {maxFeedbackRounds} feedback rounds for this run. The latest draft is final
					— download it, or start a new run to keep iterating.
				</div>
			{:else if composerError}
				<div
					class="mx-auto mb-2 w-full rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive md:max-w-3xl"
					transition:slide={{ duration: 200 }}
					role="alert"
				>
					{composerError}
				</div>
			{/if}
			<form
				class="mx-auto flex w-full items-end gap-2 rounded-xl border border-border bg-card p-2 shadow-sm md:max-w-3xl"
				onsubmit={(event) => {
					event.preventDefault();
					handleComposerSubmit();
				}}
			>
				<MentionTextarea
					bind:value={composerText}
					disabled={isSubmitting}
					placeholder={composerPlaceholder}
					onsubmit={handleComposerSubmit}
				/>
				<button
					type="submit"
					disabled={isSubmitting ||
						!composerText.trim() ||
						(feedbackLimitReached && !isContinueCommand)}
					class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity disabled:opacity-50"
					aria-label="Send instructions"
				>
					{#if isSubmitting}
						<LoaderCircle size={16} class="animate-spin" aria-hidden="true" />
					{:else}
						<SendHorizontal size={16} aria-hidden="true" />
					{/if}
				</button>
			</form>
		</div>
	</div>

	<!-- artifact panel -->
	{#if showPreview}
		<div
			class="min-w-0 flex-1 flex-col overflow-hidden bg-muted/30 {activeMobileTab === 'preview'
				? 'flex'
				: 'hidden md:flex'}"
			in:fade={{ duration: 400 }}
		>
			<div
				class="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-background pr-16 pl-4 md:h-16 md:pr-20 md:pl-6"
			>
				<h1 class="truncate text-sm font-bold md:text-base">Artifact Document</h1>
				<div class="flex shrink-0 items-center gap-2">
					<button
						type="button"
						onclick={() => (showHistory = !showHistory)}
						aria-pressed={showHistory}
						class="flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium transition-colors md:px-3 {showHistory
							? 'bg-muted text-foreground'
							: 'bg-card text-muted-foreground hover:text-foreground'}"
					>
						<History size={14} aria-hidden="true" />
						<span class="hidden md:inline">History</span>
					</button>
					{#if runExports.length > 0}
						<button
							type="button"
							onclick={() => (showFiles = !showFiles)}
							aria-pressed={showFiles}
							class="flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium transition-colors md:px-3 {showFiles
								? 'bg-muted text-foreground'
								: 'bg-card text-muted-foreground hover:text-foreground'}"
						>
							<FileDown size={14} aria-hidden="true" />
							<span class="hidden md:inline">Files</span>
							<span
								class="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground"
								>{runExports.length}</span
							>
						</button>
					{/if}
					<button
						type="button"
						onclick={() => {
							showDownloadModal = true;
							posthog.capture('artifact_download_clicked', {
								run_id: runId,
								version_count: versions.length
							});
						}}
						class="flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted md:px-3"
					>
						<Download size={14} aria-hidden="true" />
						<span><span class="hidden md:inline">Download &nbsp;</span>Output</span>
					</button>
				</div>
			</div>

			{#if showHistory}
				<div
					class="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-border bg-background px-4 py-2.5 md:px-6"
					transition:slide={{ duration: 200 }}
				>
					<span
						class="shrink-0 text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
						>Versions</span
					>
					{#each versions as version, i (version._id)}
						{@const isLatest = version._id === latestVersion?._id}
						{@const isSelected = version._id === displayedVersion?._id}
						<button
							type="button"
							onclick={() => (selectedVersionId = isLatest ? null : version._id)}
							aria-pressed={isSelected}
							class="shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition-colors {isSelected
								? 'border-primary bg-primary text-primary-foreground'
								: 'border-border bg-card text-muted-foreground hover:text-foreground'}"
						>
							v{i + 1}{isLatest ? ' (Latest)' : ''}
						</button>
					{/each}
				</div>
			{/if}

			{#if showFiles && runExports.length > 0}
				<div
					class="flex shrink-0 flex-col gap-2 border-b border-border bg-background px-4 py-2.5 md:px-6"
					transition:slide={{ duration: 200 }}
				>
					<span class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
						>Generated files</span
					>
					{#each runExports as file (file.id)}
						<div class="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2">
							<FileText size={16} class="shrink-0 text-muted-foreground" aria-hidden="true" />
							<div class="min-w-0 flex-1">
								<p class="truncate text-xs font-semibold">
									{formatLabel[file.format] ?? file.format.toUpperCase()}
									{#if file.templateName}<span class="font-normal text-muted-foreground"
											>· {file.templateName}</span
										>{/if}
								</p>
								<p class="text-[11px] text-muted-foreground">
									{#if file.fileSizeBytes}{formatBytes(file.fileSizeBytes)} ·
									{/if}downloaded
									{file.downloadCount}×
								</p>
							</div>
							<button
								type="button"
								onclick={() => downloadExport(file.id)}
								class="flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
							>
								<Download size={13} aria-hidden="true" /> Download
							</button>
						</div>
					{/each}
				</div>
			{/if}

			{@render mobileTabs()}

			<div class="flex-1 overflow-y-auto p-4 md:p-10">
				<article
					class="markdown-body artifact-document mx-auto w-full max-w-3xl rounded-md border border-border/60 bg-card p-6 text-foreground/90 shadow-sm md:p-12"
				>
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					{@html artifactHtml}
				</article>
			</div>
		</div>
	{/if}
</div>

<DownloadModal bind:open={showDownloadModal} {runId} />

<style>
	.artifact-document :global(h1) {
		margin-bottom: 0.25rem;
		font-size: 1.75rem;
		font-weight: 800;
		letter-spacing: -0.025em;
	}

	.artifact-document :global(h2) {
		margin-top: 2rem;
		margin-bottom: 0.75rem;
		border-bottom: 1px solid var(--color-border);
		padding-bottom: 0.375rem;
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-muted-foreground);
	}

	.artifact-document :global(h3) {
		margin-top: 1.25rem;
		margin-bottom: 0.25rem;
		font-size: 0.95rem;
		font-weight: 700;
	}

	.artifact-document :global(hr) {
		margin: 1.5rem 0;
		border-color: var(--color-border);
	}
</style>
