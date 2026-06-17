import { v } from 'convex/values';
import { internalMutation } from '../_generated/server';
import { withAppErrors } from '../lib/errorMapper';
import { ok } from '../lib/responseMapper';
import { artifactType, exportFormat, templateEngine, templateStatus } from '../lib/schemaTypes';

/**
 * Seed/refresh templates so v1 can ship without the external admin UI (plan §7).
 *
 * Assets must already live in `_storage` — upload them first (e.g. via the admin
 * `generateTemplateUploadUrl` mutation or the Convex dashboard) and pass the
 * resulting storage ids here. This is an `internalMutation`: run it from the
 * Convex dashboard / CLI, not from the client. Idempotent per `key` (upsert), so
 * re-running with new asset ids refreshes the existing row.
 */
export const seedTemplates = internalMutation({
	args: {
		templates: v.array(
			v.object({
				key: v.string(),
				name: v.string(),
				templateType: artifactType,
				engine: templateEngine,
				version: v.number(),
				supportedFormats: v.array(exportFormat),
				templateAssetStorageId: v.id('_storage'),
				description: v.optional(v.string()),
				category: v.optional(v.string()),
				thumbnailStorageId: v.optional(v.id('_storage')),
				sampleStorageId: v.optional(v.id('_storage')),
				// default published + visible so seeded templates list immediately
				status: v.optional(templateStatus),
				isVisible: v.optional(v.boolean())
			})
		)
	},
	handler: async (ctx, args) => {
		return withAppErrors(async () => {
			const results: Array<{ key: string; id: string; created: boolean }> = [];
			const now = Date.now();

			for (const t of args.templates) {
				const status = t.status ?? 'published';
				const isVisible = t.isVisible ?? true;

				const existing = await ctx.db
					.query('templates')
					.withIndex('by_key', (q) => q.eq('key', t.key))
					.unique();

				if (existing) {
					await ctx.db.patch(existing._id, {
						name: t.name,
						templateType: t.templateType,
						engine: t.engine,
						version: t.version,
						supportedFormats: t.supportedFormats,
						templateAssetStorageId: t.templateAssetStorageId,
						description: t.description,
						category: t.category,
						thumbnailStorageId: t.thumbnailStorageId,
						sampleStorageId: t.sampleStorageId,
						status,
						isVisible,
						updatedAt: now
					});
					results.push({ key: t.key, id: existing._id, created: false });
					continue;
				}

				const id = await ctx.db.insert('templates', {
					key: t.key,
					name: t.name,
					templateType: t.templateType,
					engine: t.engine,
					version: t.version,
					supportedFormats: t.supportedFormats,
					templateAssetStorageId: t.templateAssetStorageId,
					description: t.description,
					category: t.category,
					thumbnailStorageId: t.thumbnailStorageId,
					sampleStorageId: t.sampleStorageId,
					status,
					isVisible,
					createdAt: now,
					updatedAt: now
				});
				results.push({ key: t.key, id, created: true });
			}

			return ok(results, { message: `Seeded ${results.length} template(s)` });
		});
	}
});
