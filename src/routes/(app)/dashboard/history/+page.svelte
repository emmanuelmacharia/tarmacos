<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { fade } from 'svelte/transition';
	import { resolve } from '$app/paths';
	import { ChevronRight, FileDown, History, LoaderCircle, Plus } from '@lucide/svelte';
	import { api } from '../../../../convex/_generated/api';
	import type { Doc } from '../../../../convex/_generated/dataModel';
	import { Button } from '$lib/components/ui/button';
	import { SvelteDate } from 'svelte/reactivity';

	type RunListItem = Doc<'runs'> & { profileName: string; exportCount: number };
	type RunStatus = Doc<'runs'>['status'];

	const PAGE_SIZE = 20;

	let limit = $state(PAGE_SIZE);

	// keepPreviousData stops the list flashing back to the loader while
	// "show more" refetches with a larger limit
	const runsFetch = useQuery(api.runs.index.listUserRuns, () => ({ limit }), {
		keepPreviousData: true
	});

	const runs: RunListItem[] = $derived(runsFetch.data?.data?.runs ?? []);
	const hasMore = $derived(runsFetch.data?.data?.hasMore ?? false);
	const isLoadingFirstPage = $derived(runsFetch.isLoading && runs.length === 0);
	const isLoadingMore = $derived(runsFetch.isStale);

	const statusConfig: Record<RunStatus, { label: string; dot: string; text: string }> = {
		created: {
			label: 'Running',
			dot: 'bg-blue-500 animate-pulse',
			text: 'text-blue-600 dark:text-blue-400'
		},
		running: {
			label: 'Running',
			dot: 'bg-blue-500 animate-pulse',
			text: 'text-blue-600 dark:text-blue-400'
		},
		awaiting_user: {
			label: 'Awaiting your review',
			dot: 'bg-amber-500',
			text: 'text-amber-700 dark:text-amber-400'
		},
		completed: {
			label: 'Completed',
			dot: 'bg-emerald-500',
			text: 'text-emerald-700 dark:text-emerald-400'
		},
		failed: { label: 'Failed', dot: 'bg-destructive', text: 'text-destructive' },
		cancelled: { label: 'Cancelled', dot: 'bg-muted-foreground/60', text: 'text-muted-foreground' }
	};

	const timeFormatter = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
	const dayFormatter = new Intl.DateTimeFormat('en-US', {
		month: 'long',
		day: 'numeric',
		year: 'numeric'
	});

	function dayLabel(timestamp: number) {
		const day = new SvelteDate(timestamp);
		const today = new SvelteDate();
		const yesterday = new SvelteDate();
		yesterday.setDate(today.getDate() - 1);

		if (day.toDateString() === today.toDateString()) return 'Today';
		if (day.toDateString() === yesterday.toDateString()) return 'Yesterday';
		return dayFormatter.format(day);
	}

	// runs arrive sorted by last activity, so consecutive runs of the same day
	// collapse into one dated section
	const groupedRuns = $derived.by(() => {
		const groups: { label: string; runs: RunListItem[] }[] = [];
		for (const run of runs) {
			const label = dayLabel(run.updatedAt);
			const lastGroup = groups.at(-1);
			if (lastGroup?.label === label) {
				lastGroup.runs.push(run);
			} else {
				groups.push({ label, runs: [run] });
			}
		}
		return groups;
	});
</script>

<div class="flex h-full flex-col gap-8">
	<div class="shrink-0">
		<h1 class="text-xl font-bold tracking-tight md:text-2xl">History</h1>
		<p class="mt-1 text-sm text-muted-foreground">
			Every run you've started, most recent first. Open one to pick up the conversation and preview
			where you left off.
		</p>
	</div>

	{#if isLoadingFirstPage}
		<div class="flex w-full justify-center py-16" in:fade={{ duration: 200 }}>
			<LoaderCircle size={20} class="animate-spin text-muted-foreground" aria-hidden="true" />
		</div>
	{:else if runsFetch.error}
		<div
			class="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
			role="alert"
		>
			Something went wrong while loading your runs. Please refresh and try again.
		</div>
	{:else if runs.length === 0}
		<div
			class="flex flex-col items-center rounded-xl border border-dashed border-border px-6 py-16 text-center"
			in:fade={{ duration: 200 }}
		>
			<div
				class="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-background-secondary/5"
			>
				<History size={20} class="text-muted-foreground" aria-hidden="true" />
			</div>
			<p class="mt-4 text-sm font-semibold">No runs yet</p>
			<p class="mt-1 max-w-sm text-sm text-muted-foreground">
				Start a run from the dashboard and it will show up here, ready to revisit anytime.
			</p>
			<a
				href={resolve('/dashboard')}
				class="mt-6 flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
			>
				<Plus size={16} aria-hidden="true" /> Start your first run
			</a>
		</div>
	{:else}
		<div
			class="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto pr-1"
			in:fade={{ duration: 200 }}
		>
			{#each groupedRuns as group (group.label)}
				<section aria-label={group.label}>
					<h2
						class="mb-3 px-1 text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
					>
						{group.label}
					</h2>
					<div class="flex flex-col gap-2 px-4">
						{#each group.runs as run (run._id)}
							{@const status = statusConfig[run.status]}
							<a
								href={resolve('/(app)/runs/[runId]', { runId: run._id })}
								data-sveltekit-preload-data="hover"
								class="group flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/5"
							>
								<div class="min-w-0 flex-1">
									<div class="flex items-center gap-2">
										<span class="h-2 w-2 shrink-0 rounded-full {status.dot}" aria-hidden="true"
										></span>
										<h3 class="truncate text-sm font-semibold">{run.title}</h3>
									</div>
									<div
										class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-4 text-xs text-muted-foreground"
									>
										<span class="font-medium {status.text}">{status.label}</span>
										<span aria-hidden="true">·</span>
										<span class="truncate">{run.profileName}</span>
										<span aria-hidden="true">·</span>
										<span>{timeFormatter.format(run.updatedAt)}</span>
										{#if run.exportCount > 0}
											<span
												class="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 font-medium text-emerald-700 dark:text-emerald-400"
												title="{run.exportCount} generated file{run.exportCount > 1 ? 's' : ''}"
											>
												<FileDown size={11} aria-hidden="true" />
												{run.exportCount}
											</span>
										{/if}
									</div>
								</div>
								<ChevronRight
									size={16}
									class="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
									aria-hidden="true"
								/>
							</a>
						{/each}
					</div>
				</section>
			{/each}

			{#if hasMore}
				<Button
					type="button"
					onclick={() => (limit += PAGE_SIZE)}
					disabled={isLoadingMore}
					class="mx-auto flex items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
				>
					{#if isLoadingMore}
						<LoaderCircle size={14} class="animate-spin" aria-hidden="true" /> Loading…
					{:else}
						Show more
					{/if}
				</Button>
			{/if}
		</div>
	{/if}
</div>
