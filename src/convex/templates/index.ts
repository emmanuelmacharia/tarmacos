import { v } from 'convex/values';
import { query } from '../_generated/server';
import { artifactType } from '../lib/schemaTypes';
import { assertFound, withAppErrors } from '../lib/errorMapper';
import { ok } from '../lib/responseMapper';
import type { Doc } from '../_generated/dataModel';

/**
 * User-facing template catalogue. Only ever returns published + visible
 * templates of the requested artifact type, with a signed thumbnail URL.
 * Asset/storage internals are never exposed here.
 */
export const listPublishedTemplates = query({
	args: {
		templateType: artifactType
	},
	handler: async (ctx, args) => {
		return withAppErrors(async () => {
			const identity = assertFound(
				await ctx.auth.getUserIdentity(),
				'Please log in to continue',
				true
			);

			const clerkId = identity.subject;
			assertFound(
				await ctx.db
					.query('users')
					.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkId))
					.unique(),
				'User not found',
				true
			);

			const templates = await ctx.db
				.query('templates')
				.withIndex('by_type_status_visible', (q) =>
					q.eq('templateType', args.templateType).eq('status', 'published').eq('isVisible', true)
				)
				.collect();

			const items = await Promise.all(
				templates.map(async (t) => ({
					id: t._id,
					key: t.key,
					name: t.name,
					description: t.description,
					category: t.category,
					engine: t.engine,
					version: t.version,
					supportedFormats: t.supportedFormats,
					thumbnailUrl: t.thumbnailStorageId ? await ctx.storage.getUrl(t.thumbnailStorageId) : null
				}))
			);

			return ok(items, { message: 'Templates fetched successfully' });
		});
	}
});

/**
 * Returns the assets needed to render a WYSIWYG preview client-side: a signed
 * URL to the template asset bundle plus the engine/version. Refuses to serve
 * anything that isn't published + visible so drafts never leak.
 */
export const getTemplateAssets = query({
	args: {
		templateId: v.id('templates')
	},
	handler: async (ctx, args) => {
		return withAppErrors(async () => {
			const identity = assertFound(
				await ctx.auth.getUserIdentity(),
				'Please log in to continue',
				true
			);

			const clerkId = identity.subject;
			assertFound(
				await ctx.db
					.query('users')
					.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkId))
					.unique(),
				'User not found',
				true
			);

			const template: Doc<'templates'> = assertFound(
				await ctx.db.get(args.templateId),
				'Template not found'
			);

			// never serve drafts/archived/hidden templates to users
			assertFound(
				template.status === 'published' && template.isVisible ? template : null,
				'Template not found'
			);

			const assetUrl = await ctx.storage.getUrl(template.templateAssetStorageId);

			return ok(
				{
					id: template._id,
					key: template.key,
					engine: template.engine,
					version: template.version,
					supportedFormats: template.supportedFormats,
					assetUrl
				},
				{ message: 'Template assets fetched successfully' }
			);
		});
	}
});
