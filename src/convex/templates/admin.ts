import { v } from 'convex/values';
import { mutation, type MutationCtx } from '../_generated/server';
import { assertAdmin } from '../lib/admin';
import { assertFound, withAppErrors } from '../lib/errorMapper';
import { ok } from '../lib/responseMapper';
import { artifactType, exportFormat, templateEngine } from '../lib/schemaTypes';
import type { Doc, Id } from '../_generated/dataModel';

/**
 * Internal-only template management API (plan §5/§7). Every mutation here is
 * gated by `assertAdmin` (ADMIN_USER_IDS allowlist) and is never surfaced in
 * user navigation. An external admin app authenticates as an allowlisted user
 * and calls this same surface.
 */

/** Admin-only upload URL for template assets / thumbnails / sample files. */
export const generateTemplateUploadUrl = mutation({
	args: {},
	handler: async (ctx) => {
		return withAppErrors(async () => {
			await assertAdmin(ctx);
			return await ctx.storage.generateUploadUrl();
		});
	}
});

/**
 * Create or update a template by its stable `key`. Content/asset fields live
 * here; lifecycle (status, visibility) is driven by the dedicated mutations
 * below so a content edit can't accidentally flip a template live. New
 * templates start as draft + hidden.
 */
export const upsertTemplate = mutation({
	args: {
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
		sampleStorageId: v.optional(v.id('_storage'))
	},
	handler: async (ctx, args) => {
		return withAppErrors(async () => {
			await assertAdmin(ctx);

			const now = Date.now();
			const existing = await ctx.db
				.query('templates')
				.withIndex('by_key', (q) => q.eq('key', args.key))
				.unique();

			if (existing) {
				await ctx.db.patch(existing._id, {
					name: args.name,
					templateType: args.templateType,
					engine: args.engine,
					version: args.version,
					supportedFormats: args.supportedFormats,
					templateAssetStorageId: args.templateAssetStorageId,
					description: args.description,
					category: args.category,
					thumbnailStorageId: args.thumbnailStorageId,
					sampleStorageId: args.sampleStorageId,
					updatedAt: now
				});
				return ok({ id: existing._id, created: false }, { message: 'Template updated' });
			}

			const id = await ctx.db.insert('templates', {
				key: args.key,
				name: args.name,
				templateType: args.templateType,
				engine: args.engine,
				version: args.version,
				supportedFormats: args.supportedFormats,
				templateAssetStorageId: args.templateAssetStorageId,
				description: args.description,
				category: args.category,
				thumbnailStorageId: args.thumbnailStorageId,
				sampleStorageId: args.sampleStorageId,
				status: 'draft',
				isVisible: false,
				createdAt: now,
				updatedAt: now
			});
			return ok({ id, created: true }, { message: 'Template created' });
		});
	}
});

async function loadTemplate(
	ctx: MutationCtx,
	templateId: Id<'templates'>
): Promise<Doc<'templates'>> {
	return assertFound(await ctx.db.get(templateId), 'Template not found');
}

/** Move a template to `published`. Visibility is left untouched (see setVisibility). */
export const publishTemplate = mutation({
	args: { templateId: v.id('templates') },
	handler: async (ctx, args) => {
		return withAppErrors(async () => {
			await assertAdmin(ctx);
			await loadTemplate(ctx, args.templateId);
			await ctx.db.patch(args.templateId, { status: 'published', updatedAt: Date.now() });
			return ok({ id: args.templateId }, { message: 'Template published' });
		});
	}
});

/** Archive a template and force it hidden so it stops listing immediately. */
export const archiveTemplate = mutation({
	args: { templateId: v.id('templates') },
	handler: async (ctx, args) => {
		return withAppErrors(async () => {
			await assertAdmin(ctx);
			await loadTemplate(ctx, args.templateId);
			await ctx.db.patch(args.templateId, {
				status: 'archived',
				isVisible: false,
				updatedAt: Date.now()
			});
			return ok({ id: args.templateId }, { message: 'Template archived' });
		});
	}
});

/** Toggle the hard visibility gate independent of status (plan §3.1). */
export const setVisibility = mutation({
	args: { templateId: v.id('templates'), isVisible: v.boolean() },
	handler: async (ctx, args) => {
		return withAppErrors(async () => {
			await assertAdmin(ctx);
			await loadTemplate(ctx, args.templateId);
			await ctx.db.patch(args.templateId, { isVisible: args.isVisible, updatedAt: Date.now() });
			return ok({ id: args.templateId, isVisible: args.isVisible }, { message: 'Visibility updated' });
		});
	}
});
