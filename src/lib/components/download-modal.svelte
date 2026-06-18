<script lang="ts">
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import posthog from 'posthog-js';
	import {
		ArrowLeft,
		Check,
		Download,
		Eye,
		LoaderCircle,
		Search,
		TriangleAlert
	} from '@lucide/svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { compileResumeHtml } from '$lib/render/compile';
	import { api } from '../../convex/_generated/api';
	import type { Id } from '../../convex/_generated/dataModel';

	type ExportFormat = 'pdf' | 'docx';
	type BuildState = 'idle' | 'building' | 'ready' | 'failed';

	let {
		open = $bindable(false),
		runId
	}: {
		open?: boolean;
		runId: Id<'runs'>;
	} = $props();

	const convex = useConvexClient();

	// Export context drives a *truthful* preview: the artifact type filters the
	// template grid, and the canonicalJson is that of the exact version the build
	// will export — so the iframe preview is byte-for-byte the export (plan §2/§8).
	const contextFetch = useQuery(api.exports.index.getExportContext, () =>
		open ? { runId } : 'skip'
	);
	const context = $derived(contextFetch.data?.data ?? null);
	const artifactType = $derived(context?.artifactType ?? null);
	const canonicalJson = $derived(context?.canonicalJson ?? null);
	const isExportable = $derived(context?.exportable ?? false);

	const templatesFetch = useQuery(api.templates.index.listPublishedTemplates, () =>
		open && artifactType ? { templateType: artifactType } : 'skip'
	);
	const templates = $derived(templatesFetch.data?.data ?? []);
	type TemplateItem = (typeof templates)[number];

	const templatesLoading = $derived(
		open && (contextFetch.isLoading || (!!artifactType && templatesFetch.isLoading))
	);

	let explicitTemplateId = $state<Id<'templates'> | null>(null);
	let explicitFormat = $state<ExportFormat | null>(null);
	let view = $state<'grid' | 'preview'>('grid');

	// Search only filters what the grid *shows* — it never touches selection, so
	// the active template stays valid even when filtered out of view.
	let templateSearch = $state('');
	const filteredTemplates = $derived.by(() => {
		const q = templateSearch.trim().toLowerCase();
		if (!q) return templates;
		return templates.filter((template) => template.name.toLowerCase().includes(q));
	});

	function defaultFormatFor(template: TemplateItem): ExportFormat | null {
		if (template.supportedFormats.length === 0) return null;
		return (
			template.supportedFormats.includes('pdf') ? 'pdf' : template.supportedFormats[0]
		) as ExportFormat;
	}

	// Selection is derived so the first template/format is usable the moment the
	// catalogue lands — no init effect needed. An explicit pick wins when it is
	// still valid for the current list.
	const selectedTemplate = $derived(
		templates.find((template) => template.id === explicitTemplateId) ?? templates[0] ?? null
	);
	const selectedFormat = $derived.by<ExportFormat | null>(() => {
		const template = selectedTemplate;
		if (!template) return null;
		if (explicitFormat && template.supportedFormats.includes(explicitFormat)) return explicitFormat;
		return defaultFormatFor(template);
	});

	function chooseTemplate(template: TemplateItem) {
		if (template.id === explicitTemplateId) return;
		explicitTemplateId = template.id;
		resetBuild();
		posthog.capture('template_selected', {
			run_id: runId,
			template_id: template.id,
			template_key: template.key
		});
	}

	function chooseFormat(format: ExportFormat) {
		if (format === selectedFormat) return;
		explicitFormat = format;
		resetBuild();
		posthog.capture('export_format_selected', {
			run_id: runId,
			format,
			template_id: selectedTemplate?.id ?? null
		});
	}

	// ── WYSIWYG preview ──────────────────────────────────────────────────────
	// The compiled template HTML is cached per template (plan §2 perf note) so
	// re-opening a preview never refetches the asset.
	const assetCache = new SvelteMap<Id<'templates'>, string>();
	let previewHtml = $state<string | null>(null);
	let previewLoading = $state(false);
	let previewError = $state<string | null>(null);
	// guards against an out-of-order resolve when previews are opened in quick succession
	let previewToken = 0;

	async function rawTemplateHtml(template: TemplateItem): Promise<string> {
		const cached = assetCache.get(template.id);
		if (cached) return cached;
		const res = await convex.query(api.templates.index.getTemplateAssets, {
			templateId: template.id
		});
		const assetUrl = res.data?.assetUrl;
		if (!assetUrl) throw new Error('This template is unavailable right now.');
		const assetRes = await fetch(assetUrl);
		if (!assetRes.ok) throw new Error('Could not load the template.');
		const html = await assetRes.text();
		assetCache.set(template.id, html);
		return html;
	}

	// Loaded on demand (Preview click) rather than reactively: the only inputs are
	// the already-loaded canonicalJson and the selected template, so an effect adds
	// nothing but indirection.
	async function openPreview() {
		const template = selectedTemplate;
		const json = canonicalJson;
		if (!template || !json) return;
		view = 'preview';
		posthog.capture('template_previewed', {
			run_id: runId,
			template_id: template.id,
			template_key: template.key,
			format: selectedFormat
		});

		const token = ++previewToken;
		previewLoading = true;
		previewError = null;
		try {
			const html = await rawTemplateHtml(template);
			if (token !== previewToken) return;
			previewHtml = compileResumeHtml(html, json);
		} catch (err) {
			if (token !== previewToken) return;
			previewHtml = null;
			previewError = err instanceof Error ? err.message : 'Preview failed.';
		} finally {
			if (token === previewToken) previewLoading = false;
		}
	}

	// ── Build + download ─────────────────────────────────────────────────────
	let buildState = $state<BuildState>('idle');
	let buildError = $state<string | null>(null);
	let readyExportId = $state<Id<'exports'> | null>(null);
	let downloaded = $state(false);

	function resetBuild() {
		buildState = 'idle';
		buildError = null;
		readyExportId = null;
		downloaded = false;
	}

	async function startBuild() {
		if (!selectedTemplate || !selectedFormat || buildState === 'building') return;
		buildState = 'building';
		buildError = null;
		try {
			const res = await fetch(`/api/runs/${runId}/export`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ templateId: selectedTemplate.id, format: selectedFormat })
			});
			const payload = (await res.json().catch(() => null)) as {
				status?: string;
				export?: { _id: Id<'exports'> };
				exportId?: Id<'exports'>;
				error?: { message?: string };
				message?: string;
			} | null;

			if (res.ok && payload?.status === 'ready' && payload.export) {
				readyExportId = payload.export._id;
				buildState = 'ready';
				return;
			}
			// a concurrent build for the same render key is already in flight
			if (res.status === 202 && payload?.status === 'building') {
				buildError = 'This document is already being generated — try again in a moment.';
				buildState = 'failed';
				return;
			}
			buildError =
				payload?.error?.message ??
				payload?.message ??
				'We could not generate your document. Please try again.';
			buildState = 'failed';
		} catch (err) {
			buildError =
				err instanceof Error
					? err.message
					: 'We could not generate your document. Please try again.';
			buildState = 'failed';
		}
	}

	function download() {
		if (!readyExportId) return;
		// The endpoint records the download (first one flips the run to completed)
		// then 302s to the signed file URL. A new tab keeps the app mounted.
		window.open(`/api/runs/${runId}/export/${readyExportId}/download`, '_blank', 'noopener');
		downloaded = true;
	}

	// ── Modal open/close lifecycle ───────────────────────────────────────────
	function handleOpenChange(next: boolean) {
		if (next) {
			posthog.capture('download_modal_opened', { run_id: runId });
		} else {
			// reset transient UI so a re-open starts clean
			view = 'grid';
			templateSearch = '';
			previewHtml = null;
			previewError = null;
			resetBuild();
		}
	}

	const formatLabel: Record<ExportFormat, string> = { pdf: 'PDF', docx: 'Word' };
</script>

{#snippet formatPicker()}
	{#if selectedTemplate}
		<div class="flex items-center gap-2">
			<span class="text-xs font-medium text-muted-foreground">Format</span>
			<div class="flex gap-1.5">
				{#each selectedTemplate.supportedFormats as format (format)}
					{@const fmt = format as ExportFormat}
					<button
						type="button"
						onclick={() => chooseFormat(fmt)}
						aria-pressed={selectedFormat === fmt}
						class="rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors {selectedFormat ===
						fmt
							? 'border-primary bg-primary text-primary-foreground'
							: 'border-border bg-card text-muted-foreground hover:text-foreground'}"
					>
						{formatLabel[fmt]}
					</button>
				{/each}
			</div>
		</div>
	{/if}
{/snippet}

{#snippet actionButton()}
	{#if buildState === 'ready'}
		<button
			type="button"
			onclick={download}
			class="flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
		>
			{#if downloaded}
				<Check size={15} aria-hidden="true" /> Downloaded
			{:else}
				<Download size={15} aria-hidden="true" /> Download {selectedFormat
					? formatLabel[selectedFormat]
					: ''}
			{/if}
		</button>
	{:else}
		<button
			type="button"
			onclick={startBuild}
			disabled={!selectedTemplate || !selectedFormat || buildState === 'building'}
			class="flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
		>
			{#if buildState === 'building'}
				<LoaderCircle size={15} class="animate-spin" aria-hidden="true" /> Generating…
			{:else if buildState === 'failed'}
				Try again
			{:else}
				Generate {selectedFormat ? formatLabel[selectedFormat] : ''}
			{/if}
		</button>
	{/if}
{/snippet}

<Dialog.Root bind:open onOpenChange={handleOpenChange}>
	<Dialog.Content class="flex max-h-[88vh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
		<Dialog.Header class="border-b border-border px-5 py-4 text-left">
			{#if view === 'preview'}
				<button
					type="button"
					onclick={() => (view = 'grid')}
					class="mb-1 flex w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
				>
					<ArrowLeft size={14} aria-hidden="true" /> All templates
				</button>
				<Dialog.Title class="text-base">{selectedTemplate?.name ?? 'Preview'}</Dialog.Title>
				<Dialog.Description>
					A live preview of your document in this template style.
				</Dialog.Description>
			{:else}
				<Dialog.Title class="text-base">Download your document</Dialog.Title>
				<Dialog.Description>Pick a template and format.</Dialog.Description>
			{/if}
		</Dialog.Header>

		<div class="min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-6">
			{#if templatesLoading}
				<div class="flex items-center justify-center py-16">
					<LoaderCircle size={22} class="animate-spin text-muted-foreground" aria-hidden="true" />
				</div>
			{:else if contextFetch.data && !isExportable}
				<div class="flex flex-col items-center gap-2 py-16 text-center">
					<TriangleAlert size={22} class="text-muted-foreground" aria-hidden="true" />
					<p class="text-sm font-medium">This draft can't be exported yet</p>
					<p class="max-w-sm text-xs text-muted-foreground">
						Finish the run so it produces a final, structured draft, then come back to download it.
					</p>
				</div>
			{:else if templates.length === 0}
				<div class="flex flex-col items-center gap-2 py-16 text-center">
					<TriangleAlert size={22} class="text-muted-foreground" aria-hidden="true" />
					<p class="text-sm font-medium">No templates available</p>
					<p class="max-w-sm text-xs text-muted-foreground">
						There are no published templates for this document type yet.
					</p>
				</div>
			{:else if view === 'preview'}
				<div
					class="relative h-[58vh] w-full overflow-hidden rounded-md border border-border bg-white"
				>
					{#if previewLoading}
						<div class="absolute inset-0 flex items-center justify-center bg-white/70">
							<LoaderCircle
								size={20}
								class="animate-spin text-muted-foreground"
								aria-hidden="true"
							/>
						</div>
					{/if}
					{#if previewError}
						<div class="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
							<TriangleAlert size={20} class="text-destructive" aria-hidden="true" />
							<p class="text-sm text-destructive">{previewError}</p>
						</div>
					{:else if previewHtml}
						<!-- sandboxed + script-free: the compiled template is static markup -->
						<iframe
							title="Document preview"
							srcdoc={previewHtml}
							sandbox=""
							class="h-full w-full border-0 bg-white"
						></iframe>
					{/if}
				</div>
			{:else}
				<div class="relative mb-4">
					<Search
						size={15}
						class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
						aria-hidden="true"
					/>
					<input
						type="text"
						bind:value={templateSearch}
						placeholder="Search templates by name…"
						aria-label="Search templates by name"
						class="h-9 w-full rounded-md border border-border bg-card pr-3 pl-9 text-sm text-foreground transition-colors placeholder:text-muted-foreground focus:border-primary focus:outline-none"
					/>
				</div>

				{#if filteredTemplates.length === 0}
					<div class="flex flex-col items-center gap-1 py-12 text-center">
						<p class="text-sm font-medium">No templates match “{templateSearch}”</p>
						<p class="text-xs text-muted-foreground">Try a different name.</p>
					</div>
				{:else}
					<div class="grid grid-cols-3 gap-3 sm:grid-cols-4">
						{#each filteredTemplates as template (template.id)}
							{@const isSelected = template.id === selectedTemplate?.id}
							<button
								type="button"
								onclick={() => chooseTemplate(template)}
								aria-pressed={isSelected}
								class="group flex flex-col overflow-hidden rounded-lg border text-left transition-colors {isSelected
									? 'border-primary ring-1 ring-primary'
									: 'border-border hover:border-foreground/30'}"
							>
								<div class="relative aspect-[3/4] w-full overflow-hidden bg-muted">
									{#if template.thumbnailUrl}
										<img
											src={template.thumbnailUrl}
											alt={template.name}
											class="h-full w-full object-cover"
											loading="lazy"
										/>
									{:else}
										<div
											class="flex h-full items-center justify-center text-xs text-muted-foreground"
										>
											No preview
										</div>
									{/if}
									{#if isSelected}
										<div
											class="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground"
										>
											<Check size={11} aria-hidden="true" />
										</div>
									{/if}
								</div>
								<div class="flex flex-col gap-0.5 p-2">
									<span class="truncate text-xs font-semibold">{template.name}</span>
									{#if template.description}
										<span class="line-clamp-1 text-[11px] text-muted-foreground"
											>{template.description}</span
										>
									{/if}
								</div>
							</button>
						{/each}
					</div>
				{/if}
			{/if}

			{#if buildError}
				<div
					class="mt-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
					role="alert"
				>
					<TriangleAlert size={14} class="mt-0.5 shrink-0" aria-hidden="true" />
					<span>{buildError}</span>
				</div>
			{/if}
		</div>

		{#if !templatesLoading && isExportable && templates.length > 0}
			<Dialog.Footer
				class="flex flex-col gap-3 border-t border-border px-6 pt-4 pb-8 sm:flex-row sm:items-center sm:justify-between"
			>
				{@render formatPicker()}
				<div class="flex items-center gap-2">
					{#if view === 'grid'}
						<button
							type="button"
							onclick={openPreview}
							disabled={!selectedTemplate}
							class="flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
						>
							<Eye size={15} aria-hidden="true" /> Preview
						</button>
					{/if}
					{@render actionButton()}
				</div>
			</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>
