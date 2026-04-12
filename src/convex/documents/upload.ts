import { v } from 'convex/values';
import { mutation } from '../_generated/server';
import { assertFound, forbidden, unauthorized, withAppErrors } from '../lib/errorMapper';
import { documentFormat, documentType } from '../lib/schemaTypes';
import { ok } from '../lib/responseMapper';

export const generateUploadUrl = mutation({
	args: {},
	handler: async (ctx) => {
		return withAppErrors(async () => {
			const identity = await ctx.auth.getUserIdentity();
			if (!identity) {
				unauthorized('Please log in to continue');
			}

			const clerkId = identity.subject;
			assertFound(
				await ctx.db
					.query('users')
					.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkId))
					.unique(),
				'User not found'
			);
			return await ctx.storage.generateUploadUrl();
		});
	}
});

export const registerUpload = mutation({
	args: {
		profileId: v.optional(v.id('profiles')),
		name: v.string(),
		fileSize: v.number(),
		storageId: v.id('_storage'),
		documentFormat: documentFormat,
		mimeType: v.optional(v.string()),
		documentType: v.optional(documentType),
		version: v.optional(v.number())
	},
	handler: async (ctx, args) => {
		return withAppErrors(async () => {
			const identity = await ctx.auth.getUserIdentity();
			if (!identity) {
				unauthorized('Please log in to continue');
			}

			const clerkId = identity.subject;
			const user = assertFound(
				await ctx.db
					.query('users')
					.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkId))
					.unique(),
				'User not found'
			);

			const tomorrow = new Date();
			tomorrow.setDate(tomorrow.getDate() + 1);

			const expiresAt = Math.floor(tomorrow.getTime());

			const payload = {
				userId: user._id,
				profileId: args.profileId,
				name: args.name,
				fileSize: args.fileSize,
				version: args.version || 1,
				mimeType: args.mimeType,
				storageId: args.storageId,
				documentFormat: args.documentFormat,
				documentType: args.documentType || 'uploaded_resume',
				createdAt: new Date().getTime(),
				updatedAt: new Date().getTime(),
				expiresAt: expiresAt
			};
			const document = await ctx.db.insert('documents', payload);
			return ok(document, { message: 'Document upload is complete' });
		});
	}
});

export const deleteUploadRecord = mutation({
	// public api for user deleting files
	args: {
		id: v.id('documents')
	},
	handler: async (ctx, args) => {
		return withAppErrors(async () => {
			const identity = await ctx.auth.getUserIdentity();
			if (!identity) {
				unauthorized('Please log in to continue');
			}
			const clerkId = identity.subject;
			const user = assertFound(
				await ctx.db
					.query('users')
					.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkId))
					.unique(),
				'User not found'
			);

			const doc = assertFound(await ctx.db.get(args.id), 'Document not found');

			if (doc.userId !== user._id) {
				forbidden();
			}

			await ctx.storage.delete(doc.storageId); // deletes the document
			await ctx.db.delete(args.id); // deletes the record
			return ok({ success: true }, {});
		});
	}
});

export const deleteStorageObject = mutation({
	args: { storageId: v.id('_storage') },
	handler: async (ctx, args) => {
		return withAppErrors(async () => {
			const identity = await ctx.auth.getUserIdentity();
			if (!identity) {
				unauthorized('Please log in to continue');
			}
			const clerkId = identity.subject;
			const user = assertFound(
				await ctx.db
					.query('users')
					.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkId))
					.unique(),
				'User not found'
			);

			const document = await ctx.db
				.query('documents')
				.withIndex('by_storage_id', (q) => q.eq('storageId', args.storageId))
				.unique();

			if (document && document.userId !== user._id) {
				forbidden();
			}

			await ctx.storage.delete(args.storageId);
		});
	}
});
