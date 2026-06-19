import { v } from 'convex/values';
import { mutation, type MutationCtx } from '../_generated/server';
import { assertFound, forbiddenCheck, mapConvexError, withAppErrors } from '../lib/errorMapper';
import { exportFormat, renderStrategy } from '../lib/schemaTypes';
import { ok } from '../lib/responseMapper';
import type { Doc, Id } from '../_generated/dataModel';

/**
 * Export build pipeline (plan §5.2/§5.4, Phase 3). These mutations drive the
 * `exports` row through its lifecycle (pending → ready | failed) and are called
 * by the SvelteKit build route, which owns the actual HTML compile + renderer
 * HTTP call + storage upload (the renderer client/secret live app-side). The
 * build is a standalone job: it sets `phase='finalizing'` but never touches
 * `run.status` until the file is downloaded (plan §4), so it never collides
 * with the writer/reviewer loop.
 */

/** Renderer pipeline identity; bump when the rendered output format changes. */
const EXPORTER_VERSION = 'render-v1';

/** A pending build older than this is treated as abandoned and re-driven. */
const STALE_PENDING_MS = 120_000;

/** generated_export documents are run artifacts, not abandoned uploads — keep them effectively forever. */
const EXPORT_DOC_TTL_MS = 100 * 365 * 24 * 60 * 60 * 1000;

/** Stable, dependency-free hash (FNV-1a, 32-bit) for the render-option key. */
function stableHash(input: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < input.length; i++) {
		h ^= input.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(16).padStart(8, '0');
}

function renderOptionHashOf(args: {
	templateId: Id<'templates'>;
	templateVersion: number;
	format: string;
	renderStrategy?: string;
}): string {
	return stableHash(
		JSON.stringify({
			t: args.templateId,
			v: args.templateVersion,
			f: args.format,
			s: args.renderStrategy ?? null
		})
	);
}

function slugify(value: string): string {
	const slug = value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60);
	return slug || 'document';
}

async function authedUser(ctx: MutationCtx): Promise<Doc<'users'>> {
	const identity = assertFound(await ctx.auth.getUserIdentity(), 'Please log in to continue', true);
	return assertFound(
		await ctx.db
			.query('users')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', identity.subject))
			.unique(),
		'User not found',
		true
	);
}

/**
 * Open (or dedupe) an export build. Validates ownership + the template, moves a
 * still-working run into `finalizing` (status untouched), and inserts a
 * `pending` export row keyed by `by_render_key`. Returns everything the route
 * needs to render: the canonical data, a signed template-asset URL, and the
 * suggested file name. If a matching `ready` export already exists it is
 * returned as-is (no re-render); a recent `pending` one is reported as building.
 */
export const startExportBuild = mutation({
	args: {
		runId: v.id('runs'),
		templateId: v.id('templates'),
		format: exportFormat,
		renderStrategy: v.optional(renderStrategy)
	},
	handler: async (ctx, args) => {
		return withAppErrors(async () => {
			const user = await authedUser(ctx);
			const run = assertFound(await ctx.db.get(args.runId), 'Run not found');
			forbiddenCheck(() => run.userId === user._id);

			if (run.status === 'failed' || run.status === 'cancelled') {
				mapConvexError({
					status: 400,
					message: `Run is ${run.status} and cannot be exported`,
					code: 'BAD_REQUEST',
					details: run.status
				});
			}
			// the agentic loop must be finished (awaiting the user) or already done
			if (run.status !== 'awaiting_user' && run.status !== 'completed') {
				mapConvexError({
					status: 400,
					message: 'The draft is still being worked on. Finish the run before exporting.',
					code: 'BAD_REQUEST',
					details: { status: run.status, phase: run.phase }
				});
			}

			const artifactVersionId = run.finalArtifactVersionId ?? run.currentArtifactVersionId;
			if (!artifactVersionId) {
				mapConvexError({
					status: 400,
					message: 'Run has no draft to export yet',
					code: 'BAD_REQUEST',
					details: ''
				});
			}

			const artifactVersion = assertFound(
				await ctx.db.get(artifactVersionId),
				'Artifact version not found'
			);
			forbiddenCheck(() => artifactVersion.runId === run._id);

			if (!artifactVersion.canonicalJson) {
				mapConvexError({
					status: 400,
					message: 'This draft cannot be exported (no structured content)',
					code: 'BAD_REQUEST',
					details: ''
				});
			}

			const artifact = assertFound(
				await ctx.db.get(artifactVersion.artifactId),
				'Artifact not found'
			);

			const template = assertFound(await ctx.db.get(args.templateId), 'Template not found');
			// users may only build from a live template of the run's artifact kind
			if (template.status !== 'published' || !template.isVisible) {
				mapConvexError({
					status: 404,
					message: 'Template not found',
					code: 'NOT_FOUND',
					details: ''
				});
			}
			if (template.templateType !== artifact.artifactType) {
				mapConvexError({
					status: 400,
					message: `Template is for ${template.templateType}, not ${artifact.artifactType}`,
					code: 'BAD_REQUEST',
					details: ''
				});
			}
			if (!template.supportedFormats.includes(args.format)) {
				mapConvexError({
					status: 400,
					message: `Template "${template.name}" does not support ${args.format}`,
					code: 'BAD_REQUEST',
					details: { supportedFormats: template.supportedFormats }
				});
			}

			const renderOptionHash = renderOptionHashOf({
				templateId: template._id,
				templateVersion: template.version,
				format: args.format,
				renderStrategy: args.renderStrategy
			});

			const existing = await ctx.db
				.query('exports')
				.withIndex('by_render_key', (q) =>
					q
						.eq('artifactVersionId', artifactVersion._id)
						.eq('format', args.format)
						.eq('exporterVersion', EXPORTER_VERSION)
						.eq('renderOptionHash', renderOptionHash)
				)
				.collect();

			const ready = existing.find((e) => e.status === 'ready' && e.documentId);
			if (ready) {
				return ok(
					{ status: 'ready' as const, exportId: ready._id, export: ready },
					{ message: 'Export already available' }
				);
			}

			const now = Date.now();
			const buildingPending = existing.find(
				(e) => e.status === 'pending' && now - e.createdAt < STALE_PENDING_MS
			);
			if (buildingPending) {
				return ok(
					{ status: 'building' as const, exportId: buildingPending._id, alreadyBuilding: true },
					{ message: 'Export already building' }
				);
			}

			// move a still-working run into the export leg; a completed run (re-export
			// with a different template) keeps its terminal status (plan §4).
			if (run.status === 'awaiting_user' && run.phase !== 'finalizing') {
				await ctx.db.patch(run._id, { phase: 'finalizing', updatedAt: now });
			}

			const exportId = await ctx.db.insert('exports', {
				runId: run._id,
				artifactVersionId: artifactVersion._id,
				format: args.format,
				exporterVersion: EXPORTER_VERSION,
				renderOptionHash,
				status: 'pending',
				templateId: template._id,
				templateVersion: template.version,
				fileSizeBytes: 0,
				mimeType: '',
				downloadCount: 0,
				createdAt: now
			});

			const ext = args.format === 'pdf' ? 'pdf' : 'docx';
			const fileName = `${slugify(run.title)}-${template.key}.${ext}`;
			const templateAssetUrl = await ctx.storage.getUrl(template.templateAssetStorageId);

			return ok(
				{
					status: 'building' as const,
					exportId,
					canonicalJson: artifactVersion.canonicalJson,
					templateAssetUrl,
					fileName,
					format: args.format,
					renderStrategy: args.renderStrategy ?? null
				},
				{ message: 'Export build started', statusCode: 201 }
			);
		});
	}
});

/**
 * Finish a successful build: persist the rendered file as a `generated_export`
 * document, flip the `exports` row to `ready`, record a `runDocuments` link, and
 * pin the final artifact version. The run stays in `finalizing` /
 * `awaiting_user` — only the download completes it (plan §4).
 */
export const completeExportBuild = mutation({
	args: {
		exportId: v.id('exports'),
		storageId: v.id('_storage'),
		fileName: v.string(),
		fileSizeBytes: v.number(),
		mimeType: v.string(),
		contentHash: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		return withAppErrors(async () => {
			const user = await authedUser(ctx);
			const exportRow = assertFound(await ctx.db.get(args.exportId), 'Export not found');
			const run = assertFound(await ctx.db.get(exportRow.runId), 'Run not found');
			forbiddenCheck(() => run.userId === user._id);

			// idempotent: a retried completion just returns the ready row
			if (exportRow.status === 'ready' && exportRow.documentId) {
				return ok(exportRow, { message: 'Export already complete' });
			}

			const now = Date.now();
			const documentId = await ctx.db.insert('documents', {
				userId: user._id,
				profileId: run.profileId,
				name: args.fileName,
				fileSize: args.fileSizeBytes / (1024 * 1024),
				version: 1,
				storageId: args.storageId,
				documentFormat: exportRow.format,
				mimeType: args.mimeType,
				documentType: 'generated_export',
				createdAt: now,
				updatedAt: now,
				expiresAt: now + EXPORT_DOC_TTL_MS
			});

			await ctx.db.patch(exportRow._id, {
				status: 'ready',
				documentId,
				fileSizeBytes: args.fileSizeBytes,
				mimeType: args.mimeType,
				contentHash: args.contentHash,
				error: undefined,
				completedAt: now
			});

			await ctx.db.insert('runDocuments', {
				runId: run._id,
				documentId,
				purpose: 'generated_export',
				createdAt: now
			});

			// pin the exported version as final on both the run and its artifact
			const artifactVersion = await ctx.db.get(exportRow.artifactVersionId);
			await ctx.db.patch(run._id, {
				finalArtifactVersionId: exportRow.artifactVersionId,
				updatedAt: now
			});
			if (artifactVersion) {
				await ctx.db.patch(artifactVersion.artifactId, {
					finalVersionId: exportRow.artifactVersionId,
					updatedAt: now
				});
			}

			const updated = await ctx.db.get(exportRow._id);
			return ok(updated, { message: 'Export ready' });
		});
	}
});

/**
 * Mark a build failed. A render failure is *not* a run failure (plan §3 Q3): the
 * run stays in `finalizing` / `awaiting_user` so Retry is always reachable; only
 * the `exports.error` surface is set for the retry UI.
 */
export const failExportBuild = mutation({
	args: {
		exportId: v.id('exports'),
		error: v.any()
	},
	handler: async (ctx, args) => {
		return withAppErrors(async () => {
			const user = await authedUser(ctx);
			const exportRow = assertFound(await ctx.db.get(args.exportId), 'Export not found');
			const run = assertFound(await ctx.db.get(exportRow.runId), 'Run not found');
			forbiddenCheck(() => run.userId === user._id);

			await ctx.db.patch(exportRow._id, {
				status: 'failed',
				error: args.error,
				completedAt: Date.now()
			});

			return ok({ ok: true }, { message: 'Export marked failed' });
		});
	}
});

/**
 * Record a download of a ready export. The first download of a ready export is
 * the run's true completion signal (plan §4/§12.5): it flips the run to
 * `completed`. Re-downloads only bump the counter. Returns a signed URL to the
 * stored file so the caller can stream it to the user.
 */
export const markExportDownloaded = mutation({
	args: {
		exportId: v.id('exports')
	},
	handler: async (ctx, args) => {
		return withAppErrors(async () => {
			const user = await authedUser(ctx);
			const exportRow = assertFound(await ctx.db.get(args.exportId), 'Export not found');
			const run = assertFound(await ctx.db.get(exportRow.runId), 'Run not found');
			forbiddenCheck(() => run.userId === user._id);

			if (exportRow.status !== 'ready' || !exportRow.documentId) {
				mapConvexError({
					status: 400,
					message: 'Export is not ready to download',
					code: 'BAD_REQUEST',
					details: exportRow.status
				});
			}

			const document: Doc<'documents'> = assertFound(
				await ctx.db.get(exportRow.documentId),
				'Export file not found'
			);
			const url = assertFound(
				await ctx.storage.getUrl(document.storageId),
				'Export file not found'
			);

			const now = Date.now();
			const firstDownload = (exportRow.downloadCount ?? 0) === 0;

			await ctx.db.patch(exportRow._id, {
				downloadCount: (exportRow.downloadCount ?? 0) + 1,
				downloadedAt: now
			});

			// requirement #5: export ready AND downloaded → run completed (first time only)
			if (firstDownload && run.status !== 'completed') {
				await ctx.db.patch(run._id, {
					status: 'completed',
					completedAt: now,
					updatedAt: now
				});
			}

			return ok(
				{
					url,
					fileName: document.name,
					mimeType: document.mimeType ?? exportRow.mimeType,
					firstDownload
				},
				{ message: 'Download recorded' }
			);
		});
	}
});
