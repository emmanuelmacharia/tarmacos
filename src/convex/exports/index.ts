import { v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { assertFound, forbiddenCheck, withAppErrors } from '../lib/errorMapper';
import { exportFormat, exportStatus } from '../lib/schemaTypes';
import { ok } from '../lib/responseMapper';
import { api } from '../_generated/api';
import type { Id } from '../_generated/dataModel';

export const createExport = mutation({
	args: {
		runId: v.id('runs'),
		artifactVersionId: v.id('artifactVersions'),
		format: exportFormat,
		exporterVersion: v.string(),
		renderOptionHash: v.string(),
		status: exportStatus,
		documentId: v.optional(v.id('documents')),
		contentHash: v.optional(v.string()),
		fileSizeBytes: v.number(),
		mimeType: v.string()
	},
	handler: async (ctx, args) => {
		return withAppErrors(async () => {
			const identity = assertFound(
				await ctx.auth.getUserIdentity(),
				'Please log in to continue',
				true
			);

			const clerkId = identity.subject;
			// get the user
			const user = assertFound(
				await ctx.db
					.query('users')
					.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkId))
					.unique(),
				'User not found',
				true
			);

			const run = assertFound(await ctx.db.get(args.runId));

			forbiddenCheck(() => run.userId === user._id);

			const artifactVersion = assertFound(await ctx.db.get(args.artifactVersionId));

			const payload = {
				...args,
				createdAt: new Date().getTime()
			};

			const artifact = assertFound(await ctx.db.get(artifactVersion.artifactId));

			const exportId = await ctx.db.insert('exports', payload);

			const exportData = await ctx.db.get(exportId);

			// update artifact final id

			await ctx.runMutation(api.artifacts.index.updateArtifact, {
				artifactId: artifact._id,
				finalVersionId: artifactVersion._id
			});

			// update run version id final
			await ctx.runMutation(api.runs.index.updateRun, {
				runId: run._id,
				finalArtifactVersionId: artifactVersion._id
			});

			return ok(exportData, { message: 'Export generated successfully', statusCode: 201 });
		});
	}
});

/**
 * Context the download modal needs to drive a truthful WYSIWYG preview (plan §8):
 * the run's artifact type (so the template grid only lists matching templates) and
 * the `canonicalJson` of the *exact* version the build will export — the same
 * `finalArtifactVersionId ?? currentArtifactVersionId` that `startExportBuild`
 * uses. Previewing that version (not an arbitrary history selection) is what makes
 * "what you see is what you get" honest. Returns `exportable: false` when the run
 * has no structured draft to export yet.
 */
export const getExportContext = query({
	args: { runId: v.id('runs') },
	handler: async (ctx, args) => {
		return withAppErrors(async () => {
			const identity = assertFound(
				await ctx.auth.getUserIdentity(),
				'Please log in to continue',
				true
			);
			const user = assertFound(
				await ctx.db
					.query('users')
					.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', identity.subject))
					.unique(),
				'User not found',
				true
			);

			const run = assertFound(await ctx.db.get(args.runId), 'Run not found');
			forbiddenCheck(() => run.userId === user._id);

			const artifactVersionId = run.finalArtifactVersionId ?? run.currentArtifactVersionId;
			if (!artifactVersionId) {
				return ok(
					{ exportable: false as const, artifactType: null, canonicalJson: null },
					{ message: 'Run has no draft to export yet' }
				);
			}

			const version = assertFound(
				await ctx.db.get(artifactVersionId),
				'Artifact version not found'
			);
			forbiddenCheck(() => version.runId === run._id);
			const artifact = assertFound(await ctx.db.get(version.artifactId), 'Artifact not found');

			return ok(
				{
					exportable: !!version.canonicalJson,
					artifactType: artifact.artifactType,
					artifactVersionId: version._id,
					canonicalJson: version.canonicalJson ?? null
				},
				{ message: 'Export context fetched' }
			);
		});
	}
});

/**
 * Ready exports for a run, newest first (plan §8 / Phase 6 "run history
 * surfacing"). Powers the "generated files" list on the run detail + history
 * UI, each item re-downloadable via `/api/runs/[runId]/export/[exportId]/download`.
 * Only `ready` exports with a persisted file are returned — pending/failed rows
 * are job bookkeeping, not user-facing artifacts.
 */
export const listRunExports = query({
	args: { runId: v.id('runs') },
	handler: async (ctx, args) => {
		return withAppErrors(async () => {
			const identity = assertFound(
				await ctx.auth.getUserIdentity(),
				'Please log in to continue',
				true
			);
			const user = assertFound(
				await ctx.db
					.query('users')
					.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', identity.subject))
					.unique(),
				'User not found',
				true
			);

			const run = assertFound(await ctx.db.get(args.runId), 'Run not found');
			forbiddenCheck(() => run.userId === user._id);

			const rows = await ctx.db
				.query('exports')
				.withIndex('by_run_createdat', (q) => q.eq('runId', args.runId))
				.order('desc')
				.collect();

			// template names are shared across a run's exports, so resolve each once
			const templateNames = new Map<Id<'templates'>, string>();
			const items = [];
			for (const row of rows) {
				if (row.status !== 'ready' || !row.documentId) continue;

				let templateName: string | null = null;
				if (row.templateId) {
					if (!templateNames.has(row.templateId)) {
						const template = await ctx.db.get(row.templateId);
						templateNames.set(row.templateId, template?.name ?? 'Template');
					}
					templateName = templateNames.get(row.templateId) ?? null;
				}

				items.push({
					id: row._id,
					format: row.format,
					templateName,
					fileSizeBytes: row.fileSizeBytes,
					downloadCount: row.downloadCount ?? 0,
					downloadedAt: row.downloadedAt ?? null,
					createdAt: row.createdAt,
					completedAt: row.completedAt ?? null
				});
			}

			return ok(items, { message: 'Run exports fetched' });
		});
	}
});
